// Access token: JWT HS256 pendek lewat WebCrypto. Refresh token: string acak; hanya hash-nya disimpan di D1.
import type { Role } from '@hris/shared';

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const hmacKey = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

export interface AccessClaims { sub: string; role: Role; exp: number; iat: number }

export async function signAccessToken(secret: string, sub: string, role: Role, ttlSeconds: number) {
  const iat = Math.floor(Date.now() / 1000);
  const claims: AccessClaims = { sub, role, iat, exp: iat + ttlSeconds };
  const head = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

export async function verifyAccessToken(secret: string, token: string): Promise<AccessClaims | null> {
  const [head, body, sig] = token.split('.');
  if (!head || !body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), unb64url(sig), enc.encode(`${head}.${body}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(unb64url(body))) as AccessClaims;
    return claims.exp > Math.floor(Date.now() / 1000) ? claims : null;
  } catch {
    return null;
  }
}

export const newRefreshToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export const sha256 = async (s: string) => b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));
