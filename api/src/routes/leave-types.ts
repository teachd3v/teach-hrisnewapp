import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql } from 'drizzle-orm';
import { GENDERS, isAdmin, isValidQuota } from '@hris/shared';
import type { AppEnv } from '../env';
import { audit_log, employees, leave_quotas, leave_requests, leave_types, master_options } from '../db/schema';
import { auditRow } from '../lib/audit';
import { loadLeaveTypes, toMeta } from '../lib/leave-types';
import type { Db } from '../lib/leave-db';
import { requireAuth } from '../middleware/auth';

/**
 * Jenis cuti (Data master > Cuti). Semua pengguna masuk boleh membaca (untuk menampilkan nama jenis di riwayat);
 * hanya super admin yang boleh mengubah. Pengajuan dan kuota menyimpan `key` yang tetap, jadi mengganti nama tidak memutus riwayat.
 * Jenis bawaan sistem tidak dapat dihapus; jenis yang pernah dipakai tidak dapat dihapus, hanya dinonaktifkan.
 */
export const leaveTypes = new Hono<AppEnv>();
leaveTypes.use('*', requireAuth);

type Ctx = Context<AppEnv>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batch = (db: Db, stmts: any[]) => db.batch(stmts as [any, ...any[]]);
const one = async <T>(p: Promise<T[]>) => (await p)[0];
const ip = (c: Ctx) => c.req.header('CF-Connecting-IP');

async function actor(c: Ctx, db: Db) {
  const [e] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  return e && e.active ? e : null;
}
const superAdmin = async (c: Ctx, db: Db) => {
  const me = await actor(c, db);
  return me && me.role === 'super_admin' ? me : null;
};
const DENIED = 'Hanya super admin yang dapat mengelola jenis cuti';

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const bool = (v: unknown) => v === true;
const genderOf = (v: unknown) => (v === null || v === '' || v === undefined ? null : (GENDERS as readonly string[]).includes(v as string) ? (v as (typeof GENDERS)[number]) : undefined);

/**
 * Batasan status dari klien -> teks JSON untuk kolom (urutan dinormalkan), `null` = semua status, `undefined` = tidak valid.
 * Setiap id harus berupa status kepegawaian di data master.
 */
async function statusesJson(db: Db, v: unknown): Promise<string | null | undefined> {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return undefined;
  const ids = [...new Set(v as string[])].sort();
  if (ids.length === 0) return null;
  const valid = new Set((await db.select({ id: master_options.id }).from(master_options).where(eq(master_options.kind, 'employment_status'))).map((r) => r.id));
  return ids.every((id) => valid.has(id)) ? JSON.stringify(ids) : undefined;
}
const normalizedStatuses = (raw: string | null) => {
  try { return raw ? JSON.stringify([...(JSON.parse(raw) as string[])].sort()) : null; } catch { return null; }
};

async function labelTaken(db: Db, label: string, exceptKey?: string) {
  return (await loadLeaveTypes(db)).some((t) => t.key !== exceptKey && t.label.toLowerCase() === label.toLowerCase());
}

/** Berapa pengajuan dan kuota khusus yang merujuk sebuah jenis. */
async function usage(db: Db, key: string) {
  const [r, q] = await Promise.all([
    one(db.select({ n: sql<number>`count(*)` }).from(leave_requests).where(eq(leave_requests.leave_type, key))),
    one(db.select({ n: sql<number>`count(*)` }).from(leave_quotas).where(eq(leave_quotas.leave_type, key))),
  ]);
  return { requests: Number(r?.n ?? 0), quotas: Number(q?.n ?? 0) };
}

/** Daftar semua jenis. Admin juga mendapat `usedBy` (jumlah pengajuan). */
leaveTypes.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const types = await loadLeaveTypes(db);
  if (!isAdmin(me.role)) return c.json(types.map((t) => ({ key: t.key, label: t.label, active: t.active })));
  const counts = await db.select({ key: leave_requests.leave_type, n: sql<number>`count(*)` }).from(leave_requests).groupBy(leave_requests.leave_type);
  const used = new Map(counts.map((r) => [r.key, Number(r.n)]));
  return c.json(types.map((t) => ({ ...t, usedBy: used.get(t.key) ?? 0 })));
});

leaveTypes.post('/', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await superAdmin(c, db);
  if (!me) return c.json({ error: DENIED }, 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const label = clean(b.label, 60);
  if (!label) return c.json({ error: 'Nama wajib diisi' }, 400);
  if (await labelTaken(db, label)) return c.json({ error: `"${label}" sudah ada` }, 409);
  const quota = b.defaultQuota ?? null;
  if (quota !== null && !isValidQuota(quota)) return c.json({ error: 'Kuota harus 0-366 hari (kelipatan 0,5) atau kosong untuk tanpa batas' }, 400);
  const gender = genderOf(b.gender);
  if (gender === undefined) return c.json({ error: 'Jenis kelamin tidak valid' }, 400);
  const statuses = await statusesJson(db, b.allowedStatusIds);
  if (statuses === undefined) return c.json({ error: 'Status kepegawaian tidak valid' }, 400);

  const max = await one(db.select({ m: sql<number>`coalesce(max(${leave_types.sort_order}), 0)` }).from(leave_types));
  const key = crypto.randomUUID();
  const row = {
    key, label, description: clean(b.description, 200), default_quota: quota as number | null,
    requires_attachment: bool(b.requiresAttachment), time_based: bool(b.timeBased), gender, allowed_status_ids: statuses,
    sort_order: Number(max?.m ?? 0) + 1, active: true, system: false, created_at: new Date().toISOString(),
  };
  await batch(db, [
    db.insert(leave_types).values(row),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'master.created', targetType: 'leave_type', targetId: key, targetLabel: label, ip: ip(c), details: { quota: row.default_quota, timeBased: row.time_based } })),
  ]);
  return c.json({ key }, 201);
});

/** Atur urutan: `keys` harus memuat semua jenis, tepat sekali. Didaftarkan sebelum '/:key'. */
leaveTypes.put('/order', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await superAdmin(c, db);
  if (!me) return c.json({ error: DENIED }, 403);
  const { keys } = await c.req.json<{ keys?: unknown }>().catch(() => ({} as never));
  if (!Array.isArray(keys) || keys.some((x) => typeof x !== 'string')) return c.json({ error: 'Urutan tidak valid' }, 400);
  const current = await db.select({ key: leave_types.key }).from(leave_types);
  const want = new Set(keys as string[]);
  if (want.size !== keys.length || want.size !== current.length || current.some((r) => !want.has(r.key))) return c.json({ error: 'Daftar urutan tidak lengkap' }, 400);
  await batch(db, [
    ...(keys as string[]).map((k, i) => db.update(leave_types).set({ sort_order: i + 1 }).where(eq(leave_types.key, k))),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'master.reordered', targetType: 'leave_type', ip: ip(c) })),
  ]);
  return c.json({ ok: true });
});

/** Ubah nama, keterangan, kuota bawaan, lampiran, jenis kelamin, aktif. `timeBased` tidak dapat diubah (mengubah arti pengajuan yang ada). */
leaveTypes.patch('/:key', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await superAdmin(c, db);
  if (!me) return c.json({ error: DENIED }, 403);
  const key = c.req.param('key');
  const row = await one(db.select().from(leave_types).where(eq(leave_types.key, key)).limit(1));
  if (!row) return c.json({ error: 'Jenis cuti tidak ditemukan' }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));

  const set: Partial<typeof leave_types.$inferInsert> = {};
  if ('label' in b) {
    const label = clean(b.label, 60);
    if (!label) return c.json({ error: 'Nama wajib diisi' }, 400);
    if (label !== row.label) {
      if (await labelTaken(db, label, key)) return c.json({ error: `"${label}" sudah ada` }, 409);
      set.label = label;
    }
  }
  if ('description' in b) { const d = clean(b.description, 200); if (d !== row.description) set.description = d; }
  if ('defaultQuota' in b) {
    const q = b.defaultQuota;
    if (q !== null && !isValidQuota(q)) return c.json({ error: 'Kuota harus 0-366 hari (kelipatan 0,5) atau kosong untuk tanpa batas' }, 400);
    if (q !== row.default_quota) set.default_quota = q as number | null;
  }
  if ('requiresAttachment' in b && typeof b.requiresAttachment === 'boolean' && b.requiresAttachment !== row.requires_attachment) set.requires_attachment = b.requiresAttachment;
  if ('gender' in b) {
    const g = genderOf(b.gender);
    if (g === undefined) return c.json({ error: 'Jenis kelamin tidak valid' }, 400);
    if (g !== row.gender) set.gender = g;
  }
  if ('allowedStatusIds' in b) {
    const s = await statusesJson(db, b.allowedStatusIds);
    if (s === undefined) return c.json({ error: 'Status kepegawaian tidak valid' }, 400);
    if (s !== normalizedStatuses(row.allowed_status_ids)) set.allowed_status_ids = s;
  }
  if ('active' in b && typeof b.active === 'boolean' && b.active !== row.active) set.active = b.active;
  if (!Object.keys(set).length) return c.json({ ok: true, changed: false });

  await batch(db, [
    db.update(leave_types).set(set).where(eq(leave_types.key, key)),
    db.insert(audit_log).values(auditRow({
      actorId: me.id, actorName: me.name, action: 'master.updated', targetType: 'leave_type', targetId: key, targetLabel: row.label, ip: ip(c),
      details: { before: Object.fromEntries(Object.keys(set).map((k) => [k, (row as Record<string, unknown>)[k]])), after: set },
    })),
  ]);
  return c.json({ ok: true, changed: true, type: toMeta({ ...row, ...set } as typeof row) });
});

/** Hapus permanen: hanya jenis buatan admin yang belum pernah dipakai (tanpa pengajuan dan tanpa kuota khusus). */
leaveTypes.delete('/:key', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await superAdmin(c, db);
  if (!me) return c.json({ error: DENIED }, 403);
  const key = c.req.param('key');
  const row = await one(db.select().from(leave_types).where(eq(leave_types.key, key)).limit(1));
  if (!row) return c.json({ error: 'Jenis cuti tidak ditemukan' }, 404);
  if (row.system) return c.json({ error: 'Jenis bawaan sistem tidak dapat dihapus. Nonaktifkan saja.' }, 409);
  const u = await usage(db, key);
  if (u.requests > 0 || u.quotas > 0) return c.json({ error: `Sudah dipakai (${u.requests} pengajuan, ${u.quotas} kuota khusus). Nonaktifkan saja, jangan dihapus.` }, 409);
  await batch(db, [
    db.delete(leave_types).where(eq(leave_types.key, key)),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'master.deleted', targetType: 'leave_type', targetId: key, targetLabel: row.label, ip: ip(c) })),
  ]);
  return c.json({ ok: true });
});
