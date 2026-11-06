import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  MAX_ENTRIES_PER_SECTION, PERSONAL_FIELDS, PERSONAL_KEYS, isAdmin, profileCompleteness, sectionOf, validateFields,
} from '@hris/shared';
import type { AppEnv } from '../env';
import { audit_log, employees, master_options, profile_entries } from '../db/schema';
import { auditRow } from '../lib/audit';
import type { Db } from '../lib/leave-db';
import { MB, validateUpload } from '../lib/upload';
import { requireAuth } from '../middleware/auth';

/**
 * Profil karyawan. Data personal dan daftar (keluarga, pendidikan, ...) hanya untuk pemilik, HC, dan super admin; atasan langsung dan
 * karyawan lain tidak mendapat akses. Kartu ringkas (nama, jabatan, departemen, foto) terbuka untuk semua pengguna login.
 * Karyawan mengubah profilnya sendiri langsung (tanpa persetujuan); HC/super admin dapat mengubah semua; bagian `hcOnly` hanya HC.
 * Perubahan tercatat di audit dengan nama kolom (nilai sensitif tidak dicatat); membuka profil orang lain juga dicatat.
 */
export const profile = new Hono<AppEnv>();
profile.use('*', requireAuth);

type Ctx = Context<AppEnv>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batch = (db: Db, stmts: any[]) => db.batch(stmts as [any, ...any[]]);
const one = async <T>(p: Promise<T[]>) => (await p)[0];
const ip = (c: Ctx) => c.req.header('CF-Connecting-IP');

export const PROFILE_PHOTO_PREFIX = 'profile_photos/';
const PHOTO_MAX = 2 * MB;
const VIEW_AUDIT_WINDOW_MS = 10 * 60 * 1000;

async function actor(c: Ctx, db: Db) {
  const [e] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  return e && e.active ? e : null;
}
type Me = NonNullable<Awaited<ReturnType<typeof actor>>>;
/** `me` = pemilik. Tujuan harus karyawan yang ada. */
const targetId = (c: Ctx, me: Me): string => { const id = c.req.param('id') ?? ''; return id === 'me' ? me.id : id; };
const canAccess = (me: Me, target: string) => me.id === target || isAdmin(me.role);

const parseJson = (raw: string): Record<string, string | null> => { try { const v: unknown = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string | null>) : {}; } catch { return {}; } };

// ------------------------------------------------------------------ persetujuan keterangan (statis dulu agar tidak tertangkap /:id)

profile.post('/me/consent', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  if (!me.profile_consented_at) await db.update(employees).set({ profile_consented_at: new Date().toISOString() }).where(eq(employees.id, me.id));
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ butir daftar (juga statis dulu)

/** Muat butir + pastikan pelaku berhak (pemilik atau admin; bagian `hcOnly` hanya admin). */
async function loadEntry(c: Ctx, db: Db, me: Me) {
  const entry = await one(db.select().from(profile_entries).where(eq(profile_entries.id, c.req.param('entryId') ?? '')).limit(1));
  if (!entry || !canAccess(me, entry.employee_id)) return { error: c.json({ error: 'Data tidak ditemukan' }, 404) } as const;
  const def = sectionOf(entry.section);
  if (!def) return { error: c.json({ error: 'Bagian tidak dikenal' }, 400) } as const;
  if (def.hcOnly && !isAdmin(me.role)) return { error: c.json({ error: 'Bagian ini hanya dapat diisi HC' }, 403) } as const;
  return { entry, def } as const;
}

async function nameOf(db: Db, id: string): Promise<string> {
  const e = await one(db.select({ name: employees.name }).from(employees).where(eq(employees.id, id)).limit(1));
  return e?.name ?? id;
}

/** Pernyataan audit (sinkron, agar aman dimasukkan ke batch). Label tujuan dimuat lebih dulu lewat `ownerLabel`. */
const entryAuditStmt = (c: Ctx, db: Db, me: Me, owner: string, label: string, section: string, op: 'add' | 'edit' | 'delete') =>
  db.insert(audit_log).values(auditRow({
    actorId: me.id, actorName: me.name, action: 'profile.updated', targetType: 'employee', targetId: owner, targetLabel: label, ip: ip(c), details: { section, op },
  }));
const ownerLabel = (db: Db, me: Me, owner: string) => (owner === me.id ? Promise.resolve(me.name) : nameOf(db, owner));

profile.patch('/entries/:entryId', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const loaded = await loadEntry(c, db, me);
  if ('error' in loaded) return loaded.error;
  const { entry, def } = loaded;
  const b = await c.req.json<{ data?: unknown }>().catch(() => ({} as { data?: unknown }));
  if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return c.json({ error: 'Data tidak valid' }, 400);
  const v = validateFields(def.fields, b.data as Record<string, unknown>);
  if (!v.ok) return c.json({ error: v.error }, 400);
  await batch(db, [
    db.update(profile_entries).set({ data: JSON.stringify(v.data), updated_at: new Date().toISOString() }).where(eq(profile_entries.id, entry.id)),
    entryAuditStmt(c, db, me, entry.employee_id, await ownerLabel(db, me, entry.employee_id), entry.section, 'edit'),
  ]);
  return c.json({ ok: true });
});

profile.delete('/entries/:entryId', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const loaded = await loadEntry(c, db, me);
  if ('error' in loaded) return loaded.error;
  const { entry } = loaded;
  await batch(db, [
    db.delete(profile_entries).where(eq(profile_entries.id, entry.id)),
    entryAuditStmt(c, db, me, entry.employee_id, await ownerLabel(db, me, entry.employee_id), entry.section, 'delete'),
  ]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ kartu ringkas (semua pengguna login)

profile.get('/:id/card', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const e = await one(db.select().from(employees).where(eq(employees.id, targetId(c, me))).limit(1));
  if (!e || !e.active) return c.json({ error: 'Karyawan tidak ditemukan' }, 404);
  const names = await optionNames(db, [e.department_id, e.level_id]);
  return c.json({ id: e.id, name: e.name, title: e.title, department: names.get(e.department_id ?? '') ?? null, photoKey: e.photo_key });
});

async function optionNames(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const list = ids.filter((x): x is string => Boolean(x));
  if (!list.length) return new Map();
  const rows = await db.select({ id: master_options.id, name: master_options.name }).from(master_options).where(inArray(master_options.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ------------------------------------------------------------------ profil lengkap

profile.get('/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const id = targetId(c, me);
  if (!canAccess(me, id)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const e = await one(db.select().from(employees).where(eq(employees.id, id)).limit(1));
  if (!e) return c.json({ error: 'Karyawan tidak ditemukan' }, 404);

  // Membuka profil orang lain dicatat (satu kali per 10 menit per pasangan, agar muat ulang layar tidak membanjiri log).
  if (id !== me.id) {
    const since = new Date(Date.now() - VIEW_AUDIT_WINDOW_MS).toISOString();
    const recent = await one(db.select({ id: audit_log.id }).from(audit_log).where(and(
      eq(audit_log.actor_id, me.id), eq(audit_log.action, 'profile.view'), eq(audit_log.target_id, id), gt(audit_log.at, since),
    )).limit(1));
    if (!recent) await db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'profile.view', targetType: 'employee', targetId: id, targetLabel: e.name, ip: ip(c) }));
  }

  const [rows, names] = await Promise.all([
    db.select().from(profile_entries).where(eq(profile_entries.employee_id, id)).orderBy(asc(profile_entries.sort_order), asc(profile_entries.created_at)),
    optionNames(db, [e.department_id, e.level_id, e.employment_status_id]),
  ]);
  const entries: Record<string, { id: string; data: Record<string, string | null> }[]> = {};
  for (const r of rows) (entries[r.section] ??= []).push({ id: r.id, data: parseJson(r.data) });
  const personal = Object.fromEntries(PERSONAL_KEYS.map((k) => [k, (e as Record<string, unknown>)[k] ?? null])) as Record<string, string | null>;
  const counts = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, v.length]));

  return c.json({
    employee: {
      id: e.id, name: e.name, email: e.email, title: e.title, join_date: e.join_date, photoKey: e.photo_key,
      department: names.get(e.department_id ?? '') ?? null, level: names.get(e.level_id ?? '') ?? null, status: names.get(e.employment_status_id ?? '') ?? null,
    },
    personal,
    entries,
    consentedAt: id === me.id ? e.profile_consented_at : undefined,
    completeness: profileCompleteness(personal, counts, Boolean(e.photo_key)),
    /** `hc`: pelaku boleh mengisi bagian khusus HC (riwayat promosi). */
    permissions: { hc: isAdmin(me.role), self: id === me.id },
  });
});

profile.patch('/:id/personal', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const id = targetId(c, me);
  if (!canAccess(me, id)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const e = await one(db.select().from(employees).where(eq(employees.id, id)).limit(1));
  if (!e) return c.json({ error: 'Karyawan tidak ditemukan' }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const v = validateFields(PERSONAL_FIELDS, body, { partial: true });
  if (!v.ok) return c.json({ error: v.error }, 400);

  const changed = Object.entries(v.data).filter(([k, val]) => ((e as Record<string, unknown>)[k] ?? null) !== val);
  if (!changed.length) return c.json({ ok: true, changed: false });
  await batch(db, [
    db.update(employees).set({ ...Object.fromEntries(changed), updated_at: new Date().toISOString() }).where(eq(employees.id, id)),
    // Hanya nama kolom yang dicatat; nilai (NIK, rekening, dst.) tidak masuk log.
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'profile.updated', targetType: 'employee', targetId: id, targetLabel: e.name, ip: ip(c), details: { fields: changed.map(([k]) => k) } })),
  ]);
  return c.json({ ok: true, changed: true });
});

profile.post('/:id/entries', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const id = targetId(c, me);
  if (!canAccess(me, id)) return c.json({ error: 'Tidak diizinkan' }, 403);
  if (!(await one(db.select({ id: employees.id }).from(employees).where(eq(employees.id, id)).limit(1)))) return c.json({ error: 'Karyawan tidak ditemukan' }, 404);
  const b = await c.req.json<{ section?: unknown; data?: unknown }>().catch(() => ({} as { section?: unknown; data?: unknown }));
  const def = typeof b.section === 'string' ? sectionOf(b.section) : undefined;
  if (!def) return c.json({ error: 'Bagian tidak dikenal' }, 400);
  if (def.hcOnly && !isAdmin(me.role)) return c.json({ error: 'Bagian ini hanya dapat diisi HC' }, 403);
  if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return c.json({ error: 'Data tidak valid' }, 400);
  const v = validateFields(def.fields, b.data as Record<string, unknown>);
  if (!v.ok) return c.json({ error: v.error }, 400);

  const stat = await one(db.select({ n: sql<number>`count(*)`, m: sql<number>`coalesce(max(${profile_entries.sort_order}), 0)` }).from(profile_entries)
    .where(and(eq(profile_entries.employee_id, id), eq(profile_entries.section, def.key))));
  if (Number(stat?.n ?? 0) >= MAX_ENTRIES_PER_SECTION) return c.json({ error: `Maksimal ${MAX_ENTRIES_PER_SECTION} butir untuk ${def.label}` }, 400);

  const now = new Date().toISOString();
  const entryId = crypto.randomUUID();
  await batch(db, [
    db.insert(profile_entries).values({ id: entryId, employee_id: id, section: def.key, data: JSON.stringify(v.data), sort_order: Number(stat?.m ?? 0) + 1, created_at: now, updated_at: now }),
    entryAuditStmt(c, db, me, id, await ownerLabel(db, me, id), def.key, 'add'),
  ]);
  return c.json({ id: entryId }, 201);
});

// ------------------------------------------------------------------ foto profil

profile.post('/:id/photo', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const id = targetId(c, me);
  if (!canAccess(me, id)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const e = await one(db.select().from(employees).where(eq(employees.id, id)).limit(1));
  if (!e) return c.json({ error: 'Karyawan tidak ditemukan' }, 404);
  const declared = Number(c.req.header('Content-Length'));
  if (Number.isFinite(declared) && declared > PHOTO_MAX + 64 * 1024) return c.json({ error: 'Foto terlalu besar (maks. 2 MB)' }, 413);
  const form = await c.req.parseBody().catch(() => null);
  const file = form?.file;
  if (!(file instanceof File)) return c.json({ error: 'Foto tidak ada' }, 400);
  const v = await validateUpload(file, { maxBytes: PHOTO_MAX, kinds: ['jpeg', 'png', 'webp'] });
  if (!v.ok) return c.json({ error: v.error }, 400);

  const key = `${PROFILE_PHOTO_PREFIX}${id}/${crypto.randomUUID()}.${v.ext}`;
  await c.env.STORAGE.put(key, v.buffer, { httpMetadata: { contentType: v.contentType } });
  try {
    await batch(db, [
      db.update(employees).set({ photo_key: key, updated_at: new Date().toISOString() }).where(eq(employees.id, id)),
      db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'profile.photo', targetType: 'employee', targetId: id, targetLabel: e.name, ip: ip(c), details: { op: 'set' } })),
    ]);
  } catch (err) {
    await c.env.STORAGE.delete(key).catch(() => {});
    throw err;
  }
  if (e.photo_key) await c.env.STORAGE.delete(e.photo_key).catch(() => {});
  return c.json({ photoKey: key }, 201);
});

profile.delete('/:id/photo', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const id = targetId(c, me);
  if (!canAccess(me, id)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const e = await one(db.select().from(employees).where(eq(employees.id, id)).limit(1));
  if (!e) return c.json({ error: 'Karyawan tidak ditemukan' }, 404);
  if (!e.photo_key) return c.json({ ok: true });
  await batch(db, [
    db.update(employees).set({ photo_key: null, updated_at: new Date().toISOString() }).where(eq(employees.id, id)),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'profile.photo', targetType: 'employee', targetId: id, targetLabel: e.name, ip: ip(c), details: { op: 'remove' } })),
  ]);
  await c.env.STORAGE.delete(e.photo_key).catch(() => {});
  return c.json({ ok: true });
});
