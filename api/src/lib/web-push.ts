// Dipindah dari project lama (teruji dengan vektor RFC 8291/8292 di sana). Hanya WebCrypto, jalan di Workers.
// Web Push (RFC 8030) dengan enkripsi aes128gcm (RFC 8291) dan VAPID (RFC 8292), hanya memakai WebCrypto
// sehingga jalan di Cloudflare Workers tanpa dependensi Node. Diverifikasi dengan vektor uji RFC 8291 (lihat PR).

const enc = new TextEncoder()
const RECORD_SIZE = 4096
const MAX_PAYLOAD_BYTES = 3000

export const b64uToBytes = (s: string): Uint8Array => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
export const bytesToB64u = (b: Uint8Array): string => {
  let bin = ''
  for (const x of b) bin += String.fromCharCode(x)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
// Salinan ke ArrayBuffer murni (tipe BufferSource yang ketat di TypeScript baru)
const buf = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) }, key, length * 8))
}

export interface PushTarget {
  endpoint: string
  /** Kunci publik perangkat (base64url, 65 byte tak terkompresi) */
  p256dh: string
  /** Rahasia autentikasi perangkat (base64url, 16 byte) */
  auth: string
}

export interface VapidConfig {
  /** Kunci publik VAPID (base64url, 65 byte) */
  publicKey: string
  /** Kunci privat VAPID (base64url, 32 byte) */
  privateKey: string
  /** mis. "mailto:admin@hrteach.site" */
  subject: string
}

/** Enkripsi isi pesan untuk satu perangkat. `opts` hanya untuk pengujian dengan vektor RFC. */
export async function encryptPayload(
  plaintext: Uint8Array,
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  opts: { ephemeral?: CryptoKeyPair; salt?: Uint8Array } = {},
): Promise<Uint8Array> {
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new Error('Isi notifikasi terlalu besar')
  const uaPublic = b64uToBytes(target.p256dh)
  const authSecret = b64uToBytes(target.auth)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('Kunci publik perangkat tidak valid')
  if (authSecret.length !== 16) throw new Error('Rahasia autentikasi perangkat tidak valid')

  const ephemeral = opts.ephemeral ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', ephemeral.publicKey)) as ArrayBuffer)
  const uaKey = await crypto.subtle.importKey('raw', buf(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  // workers-types menamai properti `public` sebagai `$public`; runtime membaca `public`.
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, ephemeral.privateKey, 256))

  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // Satu record: isi + 0x02 (penanda record terakhir, tanpa padding)
  const record = concat(plaintext, new Uint8Array([2]))
  const aes = await crypto.subtle.importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, aes, buf(record)))

  const header = new Uint8Array(16 + 4 + 1)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = asPublic.length
  return concat(header, asPublic, cipher)
}

/** Nilai header Authorization (skema "vapid") untuk endpoint tertentu, berlaku 12 jam. */
export async function vapidAuthorization(endpoint: string, vapid: VapidConfig, nowMs: number = Date.now()): Promise<string> {
  const pub = b64uToBytes(vapid.publicKey)
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('Kunci publik VAPID tidak valid')
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), d: vapid.privateKey, ext: true }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])

  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: vapid.subject })))
  const signingInput = `${header}.${claims}`
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput))) // r||s, 64 byte
  return `vapid t=${signingInput}.${bytesToB64u(sig)}, k=${vapid.publicKey}`
}

export interface SendResult {
  status: number
  /** true bila langganan sudah tidak berlaku (404/410) dan sebaiknya dihapus */
  gone: boolean
}

export async function sendWebPush(
  target: PushTarget,
  payload: string,
  vapid: VapidConfig,
  opts: { ttlSeconds?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; fetchImpl?: typeof fetch } = {},
): Promise<SendResult> {
  const body = await encryptPayload(enc.encode(payload), target)
  const res = await (opts.fetchImpl ?? fetch)(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(target.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttlSeconds ?? 86400),
      Urgency: opts.urgency ?? 'normal',
    },
    body: buf(body),
  })
  // Hindari menahan koneksi: isi respons tidak dibutuhkan
  await res.body?.cancel().catch(() => {})
  return { status: res.status, gone: res.status === 404 || res.status === 410 }
}
