// PBKDF2 via WebCrypto. Workers membatasi iterasi maksimal 100.000.
const ITERATIONS = 100_000;

const b64 = (buf: Uint8Array) => btoa(String.fromCharCode(...buf));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256),
  );
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  return timingSafeEqual(await derive(password, unb64(salt), Number(iter)), unb64(hash));
}

/** Dipakai agar waktu respons mirip saat email tidak ditemukan. */
export const burnPasswordCheck = (password: string) => derive(password, new Uint8Array(16), ITERATIONS);

export function validateNewPassword(password: string): string | null {
  if (password.length < 8) return 'Password minimal 8 karakter';
  if (password.length > 128) return 'Password terlalu panjang';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password harus mengandung huruf dan angka';
  return null;
}
