// Tautan berkas R2 bertanda tangan dan berumur pendek (karena <img>/<a> tidak bisa mengirim header Authorization).
const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const LINK_TTL_SECONDS = 5 * 60;

const hmacKey = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

export async function signFileLink(secret: string, key: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + LINK_TTL_SECONDS;
  const sig = b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(`${key}|${exp}`)));
  return { exp, sig };
}

export async function verifyFileLink(secret: string, key: string, exp: number, sig: string, now = Date.now()) {
  if (!Number.isFinite(exp) || exp < Math.floor(now / 1000)) return false;
  const expected = b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(`${key}|${exp}`)));
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
