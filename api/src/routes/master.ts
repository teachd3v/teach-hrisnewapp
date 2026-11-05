import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { isAdmin } from '@hris/shared';
import type { AppEnv } from '../env';
import { MASTER_KINDS, audit_log, employees, master_options } from '../db/schema';
import { auditRow } from '../lib/audit';
import type { Db } from '../lib/leave-db';
import { requireAuth } from '../middleware/auth';

/**
 * Data master pilihan dropdown: departemen, level, status kepegawaian.
 * Admin (HC) boleh membaca; hanya super admin yang boleh mengubah.
 * Item yang dipakai karyawan tidak dihapus, hanya dinonaktifkan (karyawan lama tetap menampilkannya).
 */
export const master = new Hono<AppEnv>();
master.use('*', requireAuth);

type Kind = (typeof MASTER_KINDS)[number];
type Ctx = Context<AppEnv>;
const isKind = (v: unknown): v is Kind => MASTER_KINDS.includes(v as Kind);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batch = (db: Db, stmts: any[]) => db.batch(stmts as [any, ...any[]]);
const one = async <T>(p: Promise<T[]>) => (await p)[0];

async function actor(c: Ctx, db: Db) {
  const [e] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  return e && e.active ? e : null;
}

/** Kolom karyawan yang menyimpan id master per jenis. */
const USAGE_COL = { department: employees.department_id, level: employees.level_id, employment_status: employees.employment_status_id } as const;

async function usageCount(db: Db, kind: Kind, id: string) {
  const r = await one(db.select({ n: sql<number>`count(*)` }).from(employees).where(eq(USAGE_COL[kind], id)));
  return Number(r?.n ?? 0);
}

const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 60) : '');

async function nameTaken(db: Db, kind: Kind, name: string, exceptId?: string) {
  const rows = await db.select({ id: master_options.id, name: master_options.name }).from(master_options)
    .where(and(eq(master_options.kind, kind), exceptId ? ne(master_options.id, exceptId) : undefined));
  return rows.some((r) => r.name.toLowerCase() === name.toLowerCase());
}

/** Semua pilihan beserta jumlah karyawan yang memakainya. `?all=1` termasuk yang nonaktif (default: hanya untuk layar kelola). */
master.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const rows = await db.select().from(master_options).orderBy(asc(master_options.kind), asc(master_options.sort_order), asc(master_options.name));
  const counts = await Promise.all(MASTER_KINDS.map(async (k) => {
    const r = await db.select({ id: USAGE_COL[k], n: sql<number>`count(*)` }).from(employees).groupBy(USAGE_COL[k]);
    return r;
  }));
  const used = new Map<string, number>();
  for (const group of counts) for (const r of group) if (r.id) used.set(r.id, Number(r.n));
  return c.json(rows.map((r) => ({ ...r, usedBy: used.get(r.id) ?? 0 })));
});

master.post('/', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || me.role !== 'super_admin') return c.json({ error: 'Hanya super admin yang dapat mengelola data master' }, 403);
  const b = await c.req.json<{ kind?: unknown; name?: unknown }>().catch(() => ({} as never));
  if (!isKind(b.kind)) return c.json({ error: 'Jenis tidak valid' }, 400);
  const name = cleanName(b.name);
  if (!name) return c.json({ error: 'Nama wajib diisi' }, 400);
  if (await nameTaken(db, b.kind, name)) return c.json({ error: `"${name}" sudah ada` }, 409);

  const max = await one(db.select({ m: sql<number>`coalesce(max(${master_options.sort_order}), 0)` }).from(master_options).where(eq(master_options.kind, b.kind)));
  const id = crypto.randomUUID();
  await batch(db, [
    db.insert(master_options).values({ id, kind: b.kind, name, sort_order: Number(max?.m ?? 0) + 1, active: true, created_at: new Date().toISOString() }),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'master.created', targetType: b.kind, targetId: id, targetLabel: name, ip: c.req.header('CF-Connecting-IP') })),
  ]);
  return c.json({ id }, 201);
});

/** Ubah nama dan/atau aktif/nonaktif. */
master.patch('/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || me.role !== 'super_admin') return c.json({ error: 'Hanya super admin yang dapat mengelola data master' }, 403);
  const id = c.req.param('id');
  const row = await one(db.select().from(master_options).where(eq(master_options.id, id)).limit(1));
  if (!row) return c.json({ error: 'Data tidak ditemukan' }, 404);
  const b = await c.req.json<{ name?: unknown; active?: unknown }>().catch(() => ({} as never));

  const set: Partial<typeof master_options.$inferInsert> = {};
  if ('name' in b) {
    const name = cleanName(b.name);
    if (!name) return c.json({ error: 'Nama wajib diisi' }, 400);
    if (name !== row.name) {
      if (await nameTaken(db, row.kind, name, id)) return c.json({ error: `"${name}" sudah ada` }, 409);
      set.name = name;
    }
  }
  if ('active' in b && typeof b.active === 'boolean' && b.active !== row.active) set.active = b.active;
  if (!Object.keys(set).length) return c.json({ ok: true, changed: false });

  await batch(db, [
    db.update(master_options).set(set).where(eq(master_options.id, id)),
    db.insert(audit_log).values(auditRow({
      actorId: me.id, actorName: me.name, action: 'master.updated', targetType: row.kind, targetId: id, targetLabel: row.name,
      ip: c.req.header('CF-Connecting-IP'), details: { before: { name: row.name, active: row.active }, after: set },
    })),
  ]);
  return c.json({ ok: true, changed: true });
});

/** Atur urutan satu jenis: `ids` harus memuat semua id jenis itu, tepat sekali. */
master.put('/:kind/order', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || me.role !== 'super_admin') return c.json({ error: 'Hanya super admin yang dapat mengelola data master' }, 403);
  const kind = c.req.param('kind');
  if (!isKind(kind)) return c.json({ error: 'Jenis tidak valid' }, 400);
  const { ids } = await c.req.json<{ ids?: unknown }>().catch(() => ({} as never));
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) return c.json({ error: 'Urutan tidak valid' }, 400);
  const current = await db.select({ id: master_options.id }).from(master_options).where(eq(master_options.kind, kind));
  const want = new Set(ids as string[]);
  if (want.size !== ids.length || want.size !== current.length || current.some((r) => !want.has(r.id))) return c.json({ error: 'Daftar urutan tidak lengkap' }, 400);

  await batch(db, [
    ...(ids as string[]).map((id, i) => db.update(master_options).set({ sort_order: i + 1 }).where(eq(master_options.id, id))),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'master.reordered', targetType: kind, ip: c.req.header('CF-Connecting-IP') })),
  ]);
  return c.json({ ok: true });
});

/** Hapus permanen hanya bila belum dipakai karyawan mana pun. */
master.delete('/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || me.role !== 'super_admin') return c.json({ error: 'Hanya super admin yang dapat mengelola data master' }, 403);
  const id = c.req.param('id');
  const row = await one(db.select().from(master_options).where(eq(master_options.id, id)).limit(1));
  if (!row) return c.json({ error: 'Data tidak ditemukan' }, 404);
  const used = await usageCount(db, row.kind, id);
  if (used > 0) return c.json({ error: `Dipakai ${used} karyawan. Nonaktifkan saja, jangan dihapus.` }, 409);
  await batch(db, [
    db.delete(master_options).where(and(eq(master_options.id, id), inArray(master_options.kind, [row.kind]))),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'master.deleted', targetType: row.kind, targetId: id, targetLabel: row.name, ip: c.req.header('CF-Connecting-IP') })),
  ]);
  return c.json({ ok: true });
});
