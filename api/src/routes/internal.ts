import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import type { AppEnv } from '../env';
import { pruneReminderLog, runReminders } from '../lib/reminders';

/** Titik masuk untuk Worker penjadwal (cron/). Bukan untuk pengguna: dilindungi secret bersama, tanpa token login. */
export const internal = new Hono<AppEnv>();

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Jalankan pengingat sekarang. Dipanggil tiap 5 menit oleh Worker cron; aman dipanggil berulang (dedup per orang per hari).
 * Respons `more: true` berarti masih ada penerima yang belum diproses: pemanggil mengulang segera.
 * Uji lokal: `?dry=1` (laporan saja), dan `?now=<ISO>` hanya bila CRON_ALLOW_NOW=1 (tidak pernah diset di produksi).
 */
internal.post('/cron', async (c) => {
  const secret = c.env.CRON_SECRET;
  const auth = c.req.header('Authorization') ?? '';
  if (!secret || secret.length < 24 || !safeEqual(auth, `Bearer ${secret}`)) return c.json({ error: 'Tidak diizinkan' }, 401);

  const nowParam = c.req.query('now');
  const now = c.env.CRON_ALLOW_NOW === '1' && nowParam && !Number.isNaN(Date.parse(nowParam)) ? new Date(nowParam) : new Date();
  const db = drizzle(c.env.DB);
  const result = await runReminders(db, c.env, now, { dry: c.req.query('dry') === '1' });
  if (!result.more && c.req.query('dry') !== '1') await pruneReminderLog(db, now);
  return c.json(result);
});
