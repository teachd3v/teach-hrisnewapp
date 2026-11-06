import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { asc, eq } from 'drizzle-orm';
import { HHMM, isAdmin, parseIsoDate, policyFor, validLatLng, wibDate } from '@hris/shared';
import type { AppEnv } from '../env';
import { attendance_policies, audit_log, employees, office_locations } from '../db/schema';
import { auditRow } from '../lib/audit';
import { loadOffices, loadPolicies, toOffice, toPolicy } from '../lib/attendance-policy';
import type { Db } from '../lib/leave-db';
import { requireAuth } from '../middleware/auth';

/**
 * Pengaturan presensi: lokasi kantor (geofence) dan aturan jam masuk/toleransi/mode lokasi. Admin boleh membaca; hanya super admin yang mengubah.
 * Aturan berlaku mulai tanggal yang dipilih (tidak boleh lampau) sehingga riwayat presensi tidak berubah. Semua perubahan tercatat di audit.
 */
export const attendanceSettings = new Hono<AppEnv>();
attendanceSettings.use('*', requireAuth);

type Ctx = Context<AppEnv>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batch = (db: Db, stmts: any[]) => db.batch(stmts as [any, ...any[]]);
const one = async <T>(p: Promise<T[]>) => (await p)[0];
const ip = (c: Ctx) => c.req.header('CF-Connecting-IP');
const DENIED = 'Hanya super admin yang dapat mengubah pengaturan presensi';
const RADIUS_MIN = 20;
const RADIUS_MAX = 5000;

async function actor(c: Ctx, db: Db) {
  const [e] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  return e && e.active ? e : null;
}
const superAdmin = async (c: Ctx, db: Db) => {
  const me = await actor(c, db);
  return me && me.role === 'super_admin' ? me : null;
};
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const isRadius = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= RADIUS_MIN && v <= RADIUS_MAX;

/** Mode blokir pada aturan yang sedang atau akan berlaku harus punya minimal satu lokasi aktif. */
async function blockNeedsOffice(db: Db, activeAfter: number): Promise<boolean> {
  if (activeAfter > 0) return false;
  const policies = await loadPolicies(db);
  const today = wibDate();
  const current = policyFor(policies, today);
  return current.locationMode === 'block' || policies.some((p) => p.effectiveFrom > today && p.locationMode === 'block');
}

attendanceSettings.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const [locations, rows] = await Promise.all([loadOffices(db), db.select().from(attendance_policies).orderBy(asc(attendance_policies.effective_from))]);
  const policies = rows.map((r) => ({ id: r.id, ...toPolicy(r) }));
  const today = wibDate();
  return c.json({ today, locations, policies, current: policyFor(policies, today) });
});

// ------------------------------------------------------------------ lokasi kantor

function parseLocation(b: Record<string, unknown>): { error: string } | { name: string; lat: number; lng: number; radiusM: number } {
  const name = clean(b.name, 60);
  if (!name) return { error: 'Nama lokasi wajib diisi' };
  if (!validLatLng(b.lat, b.lng)) return { error: 'Koordinat tidak valid' };
  if (!isRadius(b.radiusM)) return { error: `Radius harus bilangan bulat ${RADIUS_MIN}-${RADIUS_MAX} meter` };
  return { name, lat: b.lat as number, lng: b.lng as number, radiusM: b.radiusM };
}

attendanceSettings.post('/locations', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await superAdmin(c, db);
  if (!me) return c.json({ error: DENIED }, 403);
  const p = parseLocation(await c.req.json<Record<string, unknown>>().catch(() => ({})));
  if ('error' in p) return c.json({ error: p.error }, 400);
  const id = crypto.randomUUID();
  await batch(db, [
    db.insert(office_locations).values({ id, name: p.name, lat: p.lat, lng: p.lng, radius_m: p.radiusM, active: true, created_at: new Date().toISOString() }),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'setting.changed', targetType: 'office_location', targetId: id, targetLabel: p.name, ip: ip(c), details: { after: p } })),
  ]);
  return c.json({ id }, 201);
});

attendanceSettings.patch('/locations/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await superAdmin(c, db);
  if (!me) return c.json({ error: DENIED }, 403);
  const id = c.req.param('id');
  const row = await one(db.select().from(office_locations).where(eq(office_locations.id, id)).limit(1));
  if (!row) return c.json({ error: 'Lokasi tidak ditemukan' }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));

  const set: Partial<typeof office_locations.$inferInsert> = {};
  if ('name' in b) { const n = clean(b.name, 60); if (!n) return c.json({ error: 'Nama lokasi wajib diisi' }, 400); if (n !== row.name) set.name = n; }
  if ('lat' in b || 'lng' in b) {
    const lat = 'lat' in b ? b.lat : row.lat;
    const lng = 'lng' in b ? b.lng : row.lng;
    if (!validLatLng(lat, lng)) return c.json({ error: 'Koordinat tidak valid' }, 400);
    if (lat !== row.lat) set.lat = lat as number;
    if (lng !== row.lng) set.lng = lng as number;
  }
  if ('radiusM' in b) { if (!isRadius(b.radiusM)) return c.json({ error: `Radius harus bilangan bulat ${RADIUS_MIN}-${RADIUS_MAX} meter` }, 400); if (b.radiusM !== row.radius_m) set.radius_m = b.radiusM; }
  if ('active' in b && typeof b.active === 'boolean' && b.active !== row.active) set.active = b.active;
  if (!Object.keys(set).length) return c.json({ ok: true, changed: false });

  if (set.active === false) {
    const activeAfter = (await loadOffices(db)).filter((o) => o.active && o.id !== id).length;
    if (await blockNeedsOffice(db, activeAfter)) return c.json({ error: 'Aturan dengan mode blokir sedang atau akan berlaku. Sisakan minimal satu lokasi aktif, atau ubah mode ke "hanya ditandai" lebih dulu.' }, 409);
  }
  await batch(db, [
    db.update(office_locations).set(set).where(eq(office_locations.id, id)),
    db.insert(audit_log).values(auditRow({
      actorId: me.id, actorName: me.name, action: 'setting.changed', targetType: 'office_location', targetId: id, targetLabel: row.name, ip: ip(c),
      details: { before: Object.fromEntries(Object.keys(set).map((k) => [k, (row as Record<string, unknown>)[k]])), after: set },
    })),
  ]);
  return c.json({ ok: true, changed: true });
});

attendanceSettings.delete('/locations/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await superAdmin(c, db);
  if (!me) return c.json({ error: DENIED }, 403);
  const id = c.req.param('id');
  const row = await one(db.select().from(office_locations).where(eq(office_locations.id, id)).limit(1));
  if (!row) return c.json({ error: 'Lokasi tidak ditemukan' }, 404);
  const activeAfter = (await loadOffices(db)).filter((o) => o.active && o.id !== id).length;
  if (await blockNeedsOffice(db, activeAfter)) return c.json({ error: 'Aturan dengan mode blokir sedang atau akan berlaku. Sisakan minimal satu lokasi aktif, atau ubah mode ke "hanya ditandai" lebih dulu.' }, 409);
  await batch(db, [
    db.delete(office_locations).where(eq(office_locations.id, id)),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'setting.changed', targetType: 'office_location', targetId: id, targetLabel: row.name, ip: ip(c), details: { deleted: toOffice(row) } })),
  ]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ aturan jam masuk, toleransi, mode lokasi

/** Buat/ganti aturan yang berlaku mulai `effectiveFrom` (>= hari ini WIB). Tanggal yang sama menggantikan aturan sebelumnya pada tanggal itu. */
attendanceSettings.put('/policy', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await superAdmin(c, db);
  if (!me) return c.json({ error: DENIED }, 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const effectiveFrom = typeof b.effectiveFrom === 'string' ? b.effectiveFrom : '';
  if (!parseIsoDate(effectiveFrom)) return c.json({ error: 'Tanggal berlaku tidak valid' }, 400);
  if (effectiveFrom < wibDate()) return c.json({ error: 'Tanggal berlaku tidak boleh lampau (riwayat presensi tidak diubah)' }, 400);
  const workStart = typeof b.workStart === 'string' ? b.workStart : '';
  if (!HHMM.test(workStart)) return c.json({ error: 'Jam masuk tidak valid (HH:MM)' }, 400);
  const grace = b.graceMinutes;
  if (typeof grace !== 'number' || !Number.isInteger(grace) || grace < 0 || grace > 120) return c.json({ error: 'Toleransi harus 0-120 menit' }, 400);
  if (b.locationMode !== 'flag' && b.locationMode !== 'block') return c.json({ error: 'Mode lokasi tidak valid' }, 400);
  const mode: 'flag' | 'block' = b.locationMode;
  if (mode === 'block' && !(await loadOffices(db)).some((o) => o.active)) return c.json({ error: 'Mode blokir membutuhkan minimal satu lokasi kantor aktif' }, 400);

  const existing = await one(db.select().from(attendance_policies).where(eq(attendance_policies.effective_from, effectiveFrom)).limit(1));
  const now = new Date().toISOString();
  const values = { effective_from: effectiveFrom, work_start: workStart, grace_minutes: grace, location_mode: mode, created_by: me.id, created_at: now };
  await batch(db, [
    existing
      ? db.update(attendance_policies).set(values).where(eq(attendance_policies.id, existing.id))
      : db.insert(attendance_policies).values({ id: crypto.randomUUID(), ...values }),
    db.insert(audit_log).values(auditRow({
      actorId: me.id, actorName: me.name, action: 'setting.changed', targetType: 'attendance_policy', targetId: effectiveFrom, targetLabel: `Aturan presensi mulai ${effectiveFrom}`, ip: ip(c),
      details: { before: existing ? toPolicy(existing) : undefined, after: { workStart, graceMinutes: grace, locationMode: mode } },
    })),
  ]);
  return c.json({ ok: true }, existing ? 200 : 201);
});

/** Batalkan aturan yang dijadwalkan (belum berlaku). Aturan yang sudah berlaku/bawaan tidak dapat dihapus. */
attendanceSettings.delete('/policy/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await superAdmin(c, db);
  if (!me) return c.json({ error: DENIED }, 403);
  const row = await one(db.select().from(attendance_policies).where(eq(attendance_policies.id, c.req.param('id'))).limit(1));
  if (!row) return c.json({ error: 'Aturan tidak ditemukan' }, 404);
  if (row.effective_from <= wibDate()) return c.json({ error: 'Aturan yang sudah berlaku tidak dapat dihapus. Buat aturan baru dengan tanggal berlaku berikutnya.' }, 409);
  await batch(db, [
    db.delete(attendance_policies).where(eq(attendance_policies.id, row.id)),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'setting.changed', targetType: 'attendance_policy', targetId: row.effective_from, targetLabel: `Batalkan aturan presensi mulai ${row.effective_from}`, ip: ip(c), details: { deleted: toPolicy(row) } })),
  ]);
  return c.json({ ok: true });
});
