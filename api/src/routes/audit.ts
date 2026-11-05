import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq, gte, inArray, like, lt, or, sql, type SQL } from 'drizzle-orm';
import { AUDIT_ACTIONS, AUDIT_GROUPS, parseIsoDate } from '@hris/shared';
import type { AppEnv } from '../env';
import { audit_log, employees } from '../db/schema';
import { requireAuth } from '../middleware/auth';

/** Log audit (hanya super admin). Log bersifat append-only; rute ini hanya membaca. */
export const audit = new Hono<AppEnv>();
audit.use('*', requireAuth);

const WIB = '+07:00';
// Karakter escape '!' (bukan garis miring terbalik) agar % dan _ yang diketik pengguna dianggap huruf biasa, bukan wildcard.
const escLike = (s: string) => s.replace(/[!%_]/g, (m) => '!' + m);

audit.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const [me] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  if (!me || !me.active || me.role !== 'super_admin') return c.json({ error: 'Hanya super admin yang dapat melihat log audit' }, 403);

  const q = c.req.query();
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 30));
  const where: SQL[] = [];

  if (q.group) {
    if (!AUDIT_GROUPS.some((g) => g.key === q.group)) return c.json({ error: 'Kategori tidak valid' }, 400);
    where.push(like(audit_log.action, `${q.group}.%`));
  }
  if (q.action) where.push(eq(audit_log.action, q.action));
  if (q.actor) where.push(eq(audit_log.actor_id, q.actor));
  if (q.from) {
    if (!parseIsoDate(q.from)) return c.json({ error: 'Tanggal awal tidak valid' }, 400);
    where.push(gte(audit_log.at, new Date(`${q.from}T00:00:00${WIB}`).toISOString()));
  }
  if (q.to) {
    if (!parseIsoDate(q.to)) return c.json({ error: 'Tanggal akhir tidak valid' }, 400);
    const next = new Date(new Date(`${q.to}T00:00:00${WIB}`).getTime() + 86_400_000).toISOString();
    where.push(lt(audit_log.at, next));
  }
  const text = (q.q ?? '').trim().slice(0, 80).toLowerCase();
  if (text) {
    const pat = `%${escLike(text)}%`;
    // Kata dari label yang terlihat di layar (mis. "kuota") ikut dicari: dipetakan ke kode aksinya.
    const byLabel = Object.entries(AUDIT_ACTIONS).filter(([, v]) => v.label.toLowerCase().includes(text)).map(([k]) => k);
    where.push(or(
      byLabel.length ? inArray(audit_log.action, byLabel) : undefined,
      sql`lower(coalesce(${audit_log.actor_name}, '')) like ${pat} escape '!'`,
      sql`lower(coalesce(${audit_log.target_label}, '')) like ${pat} escape '!'`,
      sql`lower(${audit_log.action}) like ${pat} escape '!'`,
      sql`coalesce(${audit_log.ip}, '') like ${pat} escape '!'`,
    )!);
  }
  if (q.cursor) {
    const [cAt, cId] = q.cursor.split('|');
    if (!cAt || !cId) return c.json({ error: 'Kursor tidak valid' }, 400);
    where.push(or(lt(audit_log.at, cAt), and(eq(audit_log.at, cAt), lt(audit_log.id, cId)))!);
  }

  const rows = await db.select().from(audit_log).where(where.length ? and(...where) : undefined)
    .orderBy(desc(audit_log.at), desc(audit_log.id)).limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return c.json({
    items: page.map((r) => {
      let details: unknown = null;
      if (r.details) { try { details = JSON.parse(r.details); } catch { details = r.details; } }
      return { id: r.id, at: r.at, actor_id: r.actor_id, actor_name: r.actor_name, action: r.action, target_type: r.target_type, target_id: r.target_id, target_label: r.target_label, details, ip: r.ip };
    }),
    nextCursor: rows.length > limit && last ? `${last.at}|${last.id}` : null,
  });
});
