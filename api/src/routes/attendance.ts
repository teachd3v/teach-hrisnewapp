import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { distanceToOffice, isAdmin, validLatLng, wibDate } from '@hris/shared';
import type { AppEnv } from '../env';
import { attendances, audit_log, employees } from '../db/schema';
import { auditRow } from '../lib/audit';
import type { Db } from '../lib/leave-db';
import { MB, validateUpload } from '../lib/upload';
import { requireAuth } from '../middleware/auth';

/**
 * Presensi. Waktu dan tanggal (WIB) selalu dari server. Lokasi hanya dicatat (jarak ke kantor dihitung server),
 * tidak memblokir. Foto selfie wajib; "wajah terdeteksi" berasal dari perangkat dan bukan verifikasi identitas.
 */
export const attendance = new Hono<AppEnv>();
attendance.use('*', requireAuth);

type Ctx = Context<AppEnv>;
type Row = typeof attendances.$inferSelect;
const PHOTO_MAX = 3 * MB;
export const ATTENDANCE_PREFIX = 'attendance/';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batch = (db: Db, stmts: any[]) => db.batch(stmts as [any, ...any[]]);
const one = async <T>(p: Promise<T[]>) => (await p)[0];

async function actor(c: Ctx, db: Db) {
  const [e] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  return e && e.active ? e : null;
}

const shape = (r: Row) => ({
  id: r.id, employee_id: r.employee_id, date: r.date, clock_in: r.clock_in, clock_out: r.clock_out,
  in: r.clock_in ? { lat: r.clock_in_lat, lng: r.clock_in_lng, accuracy: r.clock_in_accuracy, distance: r.clock_in_distance, face: r.clock_in_face, photo: r.clock_in_photo_key } : null,
  out: r.clock_out ? { lat: r.clock_out_lat, lng: r.clock_out_lng, accuracy: r.clock_out_accuracy, distance: r.clock_out_distance, face: r.clock_out_face, photo: r.clock_out_photo_key } : null,
});

const num = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : null);

attendance.get('/today', async (c) => {
  const db = drizzle(c.env.DB);
  const now = new Date();
  const date = wibDate(now);
  const row = await one(db.select().from(attendances).where(and(eq(attendances.employee_id, c.get('user').id), eq(attendances.date, date))).limit(1));
  return c.json({ date, serverTime: now.toISOString(), record: row ? shape(row) : null });
});

/** Riwayat sendiri per bulan: `?month=YYYY-MM` (default bulan ini WIB). */
attendance.get('/mine', async (c) => {
  const db = drizzle(c.env.DB);
  const month = c.req.query('month') ?? wibDate().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return c.json({ error: 'Bulan tidak valid' }, 400);
  const rows = await db.select().from(attendances)
    .where(and(eq(attendances.employee_id, c.get('user').id), gte(attendances.date, `${month}-01`), lte(attendances.date, `${month}-31`)))
    .orderBy(desc(attendances.date));
  return c.json(rows.map(shape));
});

async function punch(c: Ctx, type: 'in' | 'out') {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);

  const declared = Number(c.req.header('Content-Length'));
  if (Number.isFinite(declared) && declared > PHOTO_MAX + 64 * 1024) return c.json({ error: 'Foto terlalu besar (maks. 3 MB)' }, 413);
  const form = await c.req.parseBody().catch(() => null);
  const file = form?.photo;
  if (!(file instanceof File)) return c.json({ error: 'Foto wajib diambil' }, 400);
  const v = await validateUpload(file, { maxBytes: PHOTO_MAX, kinds: ['jpeg', 'png', 'webp'] });
  if (!v.ok) return c.json({ error: v.error }, 400);

  const lat = num(form?.lat);
  const lng = num(form?.lng);
  const hasLoc = lat !== null && lng !== null;
  if (hasLoc && !validLatLng(lat, lng)) return c.json({ error: 'Koordinat tidak valid' }, 400);
  const accuracy = num(form?.accuracy);
  const distance = hasLoc ? distanceToOffice({ lat: lat!, lng: lng! }) : null;
  const face = form?.face === '1';

  const now = new Date();
  const date = wibDate(now);
  const today = await one(db.select().from(attendances).where(and(eq(attendances.employee_id, me.id), eq(attendances.date, date))).limit(1));
  if (type === 'in' && today) return c.json({ error: 'Anda sudah presensi masuk hari ini' }, 409);
  if (type === 'out') {
    if (!today?.clock_in) return c.json({ error: 'Anda belum presensi masuk hari ini' }, 409);
    if (today.clock_out) return c.json({ error: 'Anda sudah presensi pulang hari ini' }, 409);
  }

  const key = `${ATTENDANCE_PREFIX}${me.id}/${date}/${type}-${crypto.randomUUID()}.${v.ext}`;
  await c.env.STORAGE.put(key, v.buffer, { httpMetadata: { contentType: v.contentType } });
  const iso = now.toISOString();
  const auditStmt = db.insert(audit_log).values(auditRow({
    actorId: me.id, actorName: me.name, action: type === 'in' ? 'attendance.clock_in' : 'attendance.clock_out', targetType: 'attendance', targetId: date,
    ip: c.req.header('CF-Connecting-IP'), details: { distance, accuracy, face, hasLoc },
  }));

  try {
    if (type === 'in') {
      await batch(db, [
        db.insert(attendances).values({
          id: crypto.randomUUID(), employee_id: me.id, date, clock_in: iso, clock_in_lat: lat, clock_in_lng: lng, clock_in_accuracy: accuracy,
          clock_in_distance: distance, clock_in_face: face, clock_in_photo_key: key, status: 'hadir', created_at: iso,
        }),
        auditStmt,
      ]);
    } else {
      // Update bersyarat: dua permintaan pulang bersamaan tidak sama-sama lolos.
      const done = await db.update(attendances).set({
        clock_out: iso, clock_out_lat: lat, clock_out_lng: lng, clock_out_accuracy: accuracy, clock_out_distance: distance, clock_out_face: face, clock_out_photo_key: key,
      }).where(and(eq(attendances.id, today!.id), isNull(attendances.clock_out))).returning({ id: attendances.id });
      if (!done.length) throw new Error('already');
      await auditStmt;
    }
  } catch (e) {
    await c.env.STORAGE.delete(key).catch(() => {});
    const dup = type === 'in'
      ? await one(db.select({ id: attendances.id }).from(attendances).where(and(eq(attendances.employee_id, me.id), eq(attendances.date, date))).limit(1))
      : (e as Error).message === 'already';
    if (dup) return c.json({ error: type === 'in' ? 'Anda sudah presensi masuk hari ini' : 'Anda sudah presensi pulang hari ini' }, 409);
    throw e;
  }
  return c.json({ ok: true, time: iso, date, distance });
}

attendance.post('/clock-in', (c) => punch(c, 'in'));
attendance.post('/clock-out', (c) => punch(c, 'out'));

/** HC: presensi semua karyawan aktif pada satu tanggal (`?date=YYYY-MM-DD`, default hari ini WIB). */
attendance.get('/admin', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const date = c.req.query('date') ?? wibDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Tanggal tidak valid' }, 400);

  const [people, rows] = await Promise.all([
    db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.active, true)).orderBy(asc(employees.name)),
    db.select().from(attendances).where(eq(attendances.date, date)),
  ]);
  const byEmp = new Map(rows.map((r) => [r.employee_id, r]));
  return c.json({ date, rows: people.map((p) => ({ employeeId: p.id, name: p.name, record: byEmp.has(p.id) ? shape(byEmp.get(p.id)!) : null })) });
});
