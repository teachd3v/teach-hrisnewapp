import { Hono } from 'hono';
import type { AppEnv } from '../env';

/**
 * Login berbasis token (lihat docs/AUTH.md).
 * TODO: implementasi. Aturan: PBKDF2 100.000 iterasi, kunci 5x salah / 15 menit,
 * access token pendek + refresh token di D1 (hash-nya saja), rotasi saat refresh.
 */
export const auth = new Hono<AppEnv>();

const notImplemented = (c: { json: (b: unknown, s: 501) => Response }) =>
  c.json({ error: 'Belum diimplementasikan' }, 501);

auth.post('/login', notImplemented);
auth.post('/refresh', notImplemented);
auth.post('/logout', notImplemented);
