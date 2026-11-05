import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import type { AppEnv } from '../env';
import { employees, push_devices } from '../db/schema';
import { isAllowedPushEndpoint, sendPushToEmployees, vapidConfig } from '../lib/push';
import { requireAuth } from '../middleware/auth';

/** Langganan Web Push perangkat (browser). Aplikasi Tauri memakai FCM (terpisah, menyusul). */
export const push = new Hono<AppEnv>();
push.use('*', requireAuth);

const MAX_DEVICES_PER_USER = 10;

push.get('/config', (c) => {
  const v = vapidConfig(c.env);
  return v ? c.json({ publicKey: v.publicKey }) : c.json({ error: 'Notifikasi push belum dikonfigurasi di server' }, 503);
});

push.post('/subscribe', async (c) => {
  const b = await c.req.json<{ endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }>().catch(() => ({} as never));
  const endpoint = typeof b.endpoint === 'string' ? b.endpoint : '';
  const p256dh = typeof b.keys?.p256dh === 'string' ? b.keys.p256dh : '';
  const auth = typeof b.keys?.auth === 'string' ? b.keys.auth : '';
  if (!isAllowedPushEndpoint(endpoint) || endpoint.length > 600) return c.json({ error: 'Endpoint push tidak valid' }, 400);
  if (!p256dh || !auth || p256dh.length > 200 || auth.length > 64) return c.json({ error: 'Kunci langganan tidak valid' }, 400);

  const db = drizzle(c.env.DB);
  const me = c.get('user').id;
  const webKeys = JSON.stringify({ p256dh, auth });
  const existing = (await db.select().from(push_devices).where(eq(push_devices.token, endpoint)).limit(1))[0];
  if (existing) {
    // Perangkat yang sama dipakai akun lain: langganan berpindah ke akun yang sedang masuk.
    await db.update(push_devices).set({ employee_id: me, web_keys: webKeys }).where(eq(push_devices.id, existing.id));
    return c.json({ ok: true });
  }
  const mine = await db.select({ id: push_devices.id, created_at: push_devices.created_at }).from(push_devices).where(and(eq(push_devices.employee_id, me), eq(push_devices.kind, 'webpush')));
  if (mine.length >= MAX_DEVICES_PER_USER) {
    // Buang langganan tertua agar tidak menumpuk.
    const oldest = mine.sort((x, y) => x.created_at.localeCompare(y.created_at))[0]!;
    await db.delete(push_devices).where(eq(push_devices.id, oldest.id));
  }
  await db.insert(push_devices).values({ id: crypto.randomUUID(), employee_id: me, kind: 'webpush', token: endpoint, web_keys: webKeys, created_at: new Date().toISOString() });
  return c.json({ ok: true }, 201);
});

/** Pengingat harian (belum presensi, pengajuan menunggu). Tidak memengaruhi notifikasi pengajuan/keputusan. */
push.get('/preferences', async (c) => {
  const [me] = await drizzle(c.env.DB).select({ r: employees.reminders_enabled }).from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  return c.json({ reminders: me?.r ?? true });
});

push.put('/preferences', async (c) => {
  const { reminders } = await c.req.json<{ reminders?: unknown }>().catch(() => ({} as never));
  if (typeof reminders !== 'boolean') return c.json({ error: 'Pilihan tidak valid' }, 400);
  await drizzle(c.env.DB).update(employees).set({ reminders_enabled: reminders }).where(eq(employees.id, c.get('user').id));
  return c.json({ ok: true, reminders });
});

push.post('/unsubscribe', async (c) => {
  const { endpoint } = await c.req.json<{ endpoint?: unknown }>().catch(() => ({} as never));
  if (typeof endpoint !== 'string' || !endpoint) return c.json({ error: 'Endpoint tidak valid' }, 400);
  await drizzle(c.env.DB).delete(push_devices).where(and(eq(push_devices.token, endpoint), eq(push_devices.employee_id, c.get('user').id)));
  return c.json({ ok: true });
});

/** Kirim notifikasi uji ke perangkat saya (memastikan jalur push berfungsi). Mengembalikan jumlah perangkat yang menerima. */
push.post('/test', async (c) => {
  const v = vapidConfig(c.env);
  if (!v) return c.json({ error: 'Notifikasi push belum dikonfigurasi di server' }, 503);
  const sent = await sendPushToEmployees(c.env, [c.get('user').id], () => [{ title: 'Notifikasi uji', body: 'Notifikasi HRIS TEACH berfungsi di perangkat ini.', href: '/akun', tag: 'test' }], v);
  return c.json({ sent });
});
