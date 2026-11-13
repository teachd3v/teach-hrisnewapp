// Pengiriman Web Push ke perangkat karyawan. Dipanggil SETELAH aksi berhasil; kegagalan push tidak boleh menggagalkan aksi.
// Konfigurasi: VAPID_PUBLIC_KEY (var), VAPID_PRIVATE_KEY (secret), VAPID_SUBJECT (var, opsional). Tanpa itu, push dilewati diam-diam.
import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, inArray } from 'drizzle-orm';
import type { NotifyInput } from '@hris/shared';
import type { AppEnv, Bindings } from '../env';
import { push_devices } from '../db/schema';
import { sendWebPush, type VapidConfig } from './web-push';

const MAX_DEVICES_PER_CALL = 40; // batas subrequest per permintaan Worker

export function vapidConfig(env: Bindings): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT?.trim() || 'https://app.hrteach.site' };
}

// Endpoint hanya boleh milik layanan push resmi browser (mencegah server dipakai menembak alamat sembarang).
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.username && !u.password && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export interface PushMessage { title: string; body?: string | null; href?: string | null; tag?: string }

/** Kirim ke semua perangkat web milik para penerima. Mengembalikan jumlah terkirim; langganan yang sudah mati dihapus. */
export async function sendPushToEmployees(env: Bindings, employeeIds: string[], make: (employeeId: string) => PushMessage[], vapid: VapidConfig): Promise<number> {
  if (employeeIds.length === 0) return 0;
  const db = drizzle(env.DB);
  const devices = await db.select().from(push_devices)
    .where(and(eq(push_devices.kind, 'webpush'), inArray(push_devices.employee_id, employeeIds))).limit(MAX_DEVICES_PER_CALL);
  let sent = 0;
  await Promise.allSettled(devices.flatMap((d) => {
    const keys = d.web_keys ? (JSON.parse(d.web_keys) as { p256dh?: string; auth?: string }) : {};
    if (!keys.p256dh || !keys.auth) return [];
    return make(d.employee_id).map(async (m) => {
      try {
        const payload = JSON.stringify({ title: m.title, body: m.body ?? '', href: m.href ?? '/notifikasi', tag: m.tag });
        const res = await sendWebPush({ endpoint: d.token, p256dh: keys.p256dh!, auth: keys.auth! }, payload, vapid);
        if (res.gone) await db.delete(push_devices).where(eq(push_devices.token, d.token));
        else if (res.status >= 200 && res.status < 300) sent++;
        else console.warn('Push ditolak', res.status, new URL(d.token).hostname);
      } catch (e) {
        console.warn('Push gagal', new URL(d.token).hostname, e instanceof Error ? e.message : e);
      }
    });
  }));
  return sent;
}

/**
 * Kirim push untuk daftar notifikasi tanpa menunggu (waitUntil). Aman dipanggil tanpa konfigurasi VAPID.
 * Isi sama dengan notifikasi di dalam aplikasi (sudah tanpa alasan cuti/koreksi).
 */
export function pushNotify(c: Context<AppEnv>, items: NotifyInput[]): void {
  const vapid = vapidConfig(c.env);
  if (!vapid || items.length === 0) return;
  const byEmployee = new Map<string, NotifyInput[]>();
  for (const i of items) byEmployee.set(i.employeeId, [...(byEmployee.get(i.employeeId) ?? []), i]);
  const job = sendPushToEmployees(c.env, [...byEmployee.keys()], (id) =>
    (byEmployee.get(id) ?? []).map((i) => ({ title: i.title, body: i.body, href: i.href, tag: `${i.type}:${i.entityId ?? ''}` })), vapid,
  ).catch((e) => console.warn('Push latar belakang gagal', e));
  try {
    c.executionCtx.waitUntil(job);
  } catch {
    // Tanpa ExecutionContext (mis. pengujian): biarkan berjalan sendiri
  }
}
