import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type { AppEnv } from '../env';
import { audit_log, employees, flash_links } from '../db/schema';
import { auditRow } from '../lib/audit';
import { requireAuth } from '../middleware/auth';

/**
 * Tautan cepat (ikon petir di beranda). Tautan untuk semua karyawan (owner_id kosong) dikelola super admin; setiap karyawan juga
 * boleh menambah tautan untuk dirinya sendiri. Hanya alamat https. Perubahan tautan untuk semua karyawan dicatat di audit.
 */
export const flashLinkRoutes = new Hono<AppEnv>();
flashLinkRoutes.use('*', requireAuth);

const MAX_TITLE = 60;
const MAX_URL = 500;
const MAX_GLOBAL = 30;
const MAX_MINE = 30;

type Ctx = Context<AppEnv>;
const ip = (c: Ctx) => c.req.header('CF-Connecting-IP') ?? null;

async function actor(c: Ctx) {
  const db = drizzle(c.env.DB);
  const [e] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  return { db, me: e && e.active ? e : null };
}

const pub = (r: typeof flash_links.$inferSelect) => ({ id: r.id, title: r.title, url: r.url });

flashLinkRoutes.get('/', async (c) => {
  const { db, me } = await actor(c);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const [global, mine] = await Promise.all([
    db.select().from(flash_links).where(isNull(flash_links.owner_id)).orderBy(asc(flash_links.created_at)),
    db.select().from(flash_links).where(eq(flash_links.owner_id, me.id)).orderBy(asc(flash_links.created_at)),
  ]);
  return c.json({ global: global.map(pub), mine: mine.map(pub) });
});

flashLinkRoutes.post('/', async (c) => {
  const { db, me } = await actor(c);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const b = await c.req.json<{ title?: unknown; url?: unknown; scope?: unknown }>().catch(() => ({} as never));
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const url = typeof b.url === 'string' ? b.url.trim() : '';
  if (!title || title.length > MAX_TITLE) return c.json({ error: `Nama tautan wajib diisi (maks. ${MAX_TITLE} karakter)` }, 400);
  if (!url || url.length > MAX_URL) return c.json({ error: 'Alamat tautan wajib diisi' }, 400);
  let parsed: URL;
  try { parsed = new URL(url); } catch { return c.json({ error: 'Alamat tautan tidak valid' }, 400); }
  if (parsed.protocol !== 'https:') return c.json({ error: 'Alamat tautan harus diawali https://' }, 400);

  const global = b.scope === 'global';
  if (global && me.role !== 'super_admin') return c.json({ error: 'Hanya super admin yang dapat menambah tautan untuk semua karyawan' }, 403);

  const ownerId = global ? null : me.id;
  const [row] = await db.select({ n: count() }).from(flash_links).where(ownerId === null ? isNull(flash_links.owner_id) : eq(flash_links.owner_id, ownerId));
  if (Number(row?.n ?? 0) >= (global ? MAX_GLOBAL : MAX_MINE)) return c.json({ error: `Maksimal ${global ? MAX_GLOBAL : MAX_MINE} tautan` }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(flash_links).values({ id, owner_id: ownerId, title, url: parsed.toString(), created_by: me.id, created_at: now });
  if (global) {
    await db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'flash_link.changed', targetType: 'flash_link', targetId: id, targetLabel: title, ip: ip(c), details: { aksi: 'tambah', untuk: 'semua karyawan' } }));
  }
  return c.json({ id }, 201);
});

flashLinkRoutes.delete('/:id', async (c) => {
  const { db, me } = await actor(c);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const id = c.req.param('id');
  const [row] = await db.select().from(flash_links).where(eq(flash_links.id, id)).limit(1);
  if (!row) return c.json({ error: 'Tautan tidak ditemukan' }, 404);
  if (row.owner_id === null) {
    if (me.role !== 'super_admin') return c.json({ error: 'Hanya super admin yang dapat menghapus tautan untuk semua karyawan' }, 403);
    await db.delete(flash_links).where(and(eq(flash_links.id, id), isNull(flash_links.owner_id)));
    await db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'flash_link.changed', targetType: 'flash_link', targetId: id, targetLabel: row.title, ip: ip(c), details: { aksi: 'hapus', untuk: 'semua karyawan' } }));
    return c.json({ ok: true });
  }
  // Tautan milik orang lain tidak terlihat dan tidak bisa dihapus.
  if (row.owner_id !== me.id) return c.json({ error: 'Tautan tidak ditemukan' }, 404);
  await db.delete(flash_links).where(and(eq(flash_links.id, id), eq(flash_links.owner_id, me.id)));
  return c.json({ ok: true });
});
