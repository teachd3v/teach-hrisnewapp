import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  CORRECTION_MAX_DAYS_BACK, HHMM, correctionBrief, isAdmin, parseIsoDate, planCorrectionDecided, planCorrectionRequested, wibDate, wibDateMinusDays, wibToIso,
} from '@hris/shared';
import type { AppEnv } from '../env';
import { attendance_corrections, attendances, audit_log, employees } from '../db/schema';
import { auditRow } from '../lib/audit';
import { adminRecipientIds, notifyStmts, resolveStmt, type Db } from '../lib/leave-db';
import { requireAuth } from '../middleware/auth';

/**
 * Koreksi presensi (lupa masuk/pulang). Karyawan mengajukan, HC memutuskan (satu tahap).
 * Jenis ditentukan SERVER dari keadaan data: tidak ada presensi di tanggal itu -> 'both' (masuk+pulang diisi);
 * ada masuk tanpa pulang -> 'out_only'. Jam masuk dari presensi asli tidak pernah diubah.
 * Hasil koreksi ditandai (tanpa foto/lokasi) dan terlambat tetap dihitung dengan aturan 09:00 yang sama.
 */
export const corrections = new Hono<AppEnv>();
corrections.use('*', requireAuth);

type Ctx = Context<AppEnv>;
type Corr = typeof attendance_corrections.$inferSelect;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batch = (db: Db, stmts: any[]) => db.batch(stmts as [any, ...any[]]);
const one = async <T>(p: Promise<T[]>) => (await p)[0];
const REASON_MAX = 500;

async function actor(c: Ctx, db: Db) {
  const [e] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  return e && e.active ? e : null;
}

type State = { kind: 'both' } | { kind: 'out_only'; clockIn: string } | { error: string };

/** Keadaan presensi tanggal itu -> jenis koreksi yang mungkin. */
async function stateFor(db: Db, employeeId: string, date: string): Promise<State> {
  const row = await one(db.select().from(attendances).where(and(eq(attendances.employee_id, employeeId), eq(attendances.date, date))).limit(1));
  if (!row) return { kind: 'both' };
  if (row.clock_in && !row.clock_out) return { kind: 'out_only', clockIn: row.clock_in };
  return { error: 'Presensi tanggal itu sudah lengkap, tidak perlu dikoreksi' };
}

/** Validasi jam dan urutannya (WIB, tanggal sama). */
function timesError(date: string, inTime: string | null, outTime: string, clockInIso: string | null): string | null {
  if (!HHMM.test(outTime)) return 'Format jam pulang tidak valid (HH:MM)';
  if (inTime !== null && !HHMM.test(inTime)) return 'Format jam masuk tidak valid (HH:MM)';
  const inIso = inTime ? wibToIso(date, inTime) : clockInIso;
  if (inIso && wibToIso(date, outTime) <= inIso) return 'Jam pulang harus sesudah jam masuk';
  return null;
}

const brief = (r: Corr) => correctionBrief(r.date, r.clock_in_time, r.clock_out_time);

corrections.post('/', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
  const date = str('date');
  const outTime = str('clockOutTime');
  const inTime = str('clockInTime') || null;
  const reason = str('reason');

  if (!parseIsoDate(date)) return c.json({ error: 'Tanggal tidak valid' }, 400);
  const today = wibDate();
  if (date >= today) return c.json({ error: 'Koreksi hanya untuk tanggal yang sudah lewat. Hari ini Anda masih bisa presensi sendiri.' }, 400);
  if (date < wibDateMinusDays(today, CORRECTION_MAX_DAYS_BACK)) return c.json({ error: `Koreksi hanya dapat diajukan sampai ${CORRECTION_MAX_DAYS_BACK} hari ke belakang` }, 400);
  if (!reason) return c.json({ error: 'Alasan wajib diisi' }, 400);
  if (reason.length > REASON_MAX) return c.json({ error: `Alasan maksimal ${REASON_MAX} karakter` }, 400);

  const state = await stateFor(db, me.id, date);
  if ('error' in state) return c.json({ error: state.error }, 409);
  if (state.kind === 'both' && !inTime) return c.json({ error: 'Presensi masuk tanggal itu kosong: isi jam masuk dan jam pulang' }, 400);
  if (state.kind === 'out_only' && inTime) return c.json({ error: 'Jam masuk sudah tercatat dan tidak dapat diubah; isi hanya jam pulang' }, 400);
  const tErr = timesError(date, state.kind === 'both' ? inTime : null, outTime, state.kind === 'out_only' ? state.clockIn : null);
  if (tErr) return c.json({ error: tErr }, 400);

  if (await one(db.select({ id: attendance_corrections.id }).from(attendance_corrections)
    .where(and(eq(attendance_corrections.employee_id, me.id), eq(attendance_corrections.date, date), eq(attendance_corrections.status, 'pending'))).limit(1))) {
    return c.json({ error: 'Sudah ada pengajuan koreksi yang menunggu untuk tanggal itu' }, 409);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const clockInTime = state.kind === 'both' ? inTime : null;
  const row: Corr = { id, employee_id: me.id, date, kind: state.kind, clock_in_time: clockInTime, clock_out_time: outTime, reason, status: 'pending', decided_by: null, decided_at: null, decision_notes: null, created_at: now, updated_at: now };
  const notes = planCorrectionRequested({ id, requesterId: me.id, requesterName: me.name, brief: brief(row), adminIds: await adminRecipientIds(db) });
  await batch(db, [
    db.insert(attendance_corrections).values(row),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'attendance.correction_requested', targetType: 'attendance_correction', targetId: id, ip: c.req.header('CF-Connecting-IP'), details: { date, kind: state.kind } })),
    ...notifyStmts(db, notes),
  ]);
  return c.json({ id, kind: state.kind }, 201);
});

/** Keadaan satu tanggal untuk form: jenis koreksi yang akan berlaku dan jam masuk yang sudah ada. */
corrections.get('/state', async (c) => {
  const db = drizzle(c.env.DB);
  const date = c.req.query('date') ?? '';
  if (!parseIsoDate(date)) return c.json({ error: 'Tanggal tidak valid' }, 400);
  const s = await stateFor(db, c.get('user').id, date);
  return c.json('error' in s ? { kind: null, message: s.error } : s.kind === 'both' ? { kind: 'both' } : { kind: 'out_only', clockIn: s.clockIn });
});

corrections.get('/mine', async (c) => {
  const db = drizzle(c.env.DB);
  return c.json(await db.select().from(attendance_corrections).where(eq(attendance_corrections.employee_id, c.get('user').id)).orderBy(desc(attendance_corrections.created_at)).limit(50));
});

corrections.post('/:id/cancel', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const id = c.req.param('id');
  const row = await one(db.select().from(attendance_corrections).where(and(eq(attendance_corrections.id, id), eq(attendance_corrections.employee_id, me.id))).limit(1));
  if (!row) return c.json({ error: 'Pengajuan tidak ditemukan' }, 404);
  const done = await db.update(attendance_corrections).set({ status: 'cancelled', updated_at: new Date().toISOString() })
    .where(and(eq(attendance_corrections.id, id), eq(attendance_corrections.status, 'pending'))).returning({ id: attendance_corrections.id });
  if (!done.length) return c.json({ error: 'Pengajuan sudah diproses, tidak dapat dibatalkan' }, 409);
  await batch(db, [
    resolveStmt(db, id),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'attendance.correction_cancelled', targetType: 'attendance_correction', targetId: id })),
  ]);
  return c.json({ ok: true });
});

/** HC: `?status=pending` (default) | `all`. */
corrections.get('/admin', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const all = c.req.query('status') === 'all';
  const rows = await db.select({ r: attendance_corrections, name: employees.name })
    .from(attendance_corrections).innerJoin(employees, eq(attendance_corrections.employee_id, employees.id))
    .where(all ? undefined : eq(attendance_corrections.status, 'pending'))
    .orderBy(all ? desc(attendance_corrections.created_at) : asc(attendance_corrections.created_at)).limit(300);
  return c.json(rows.map((x) => ({ ...x.r, employeeName: x.name })));
});

corrections.post('/:id/decision', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json<{ approve?: unknown; notes?: unknown }>().catch(() => ({} as never));
  if (typeof b.approve !== 'boolean') return c.json({ error: 'Keputusan tidak valid' }, 400);
  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, REASON_MAX) : '';

  const corr = await one(db.select().from(attendance_corrections).where(eq(attendance_corrections.id, id)).limit(1));
  if (!corr) return c.json({ error: 'Pengajuan tidak ditemukan' }, 404);
  if (corr.status !== 'pending') return c.json({ error: 'Pengajuan ini sudah diproses' }, 409);
  if (corr.employee_id === me.id) return c.json({ error: 'Anda tidak dapat memutuskan koreksi presensi sendiri' }, 403);
  const owner = await one(db.select({ name: employees.name }).from(employees).where(eq(employees.id, corr.employee_id)).limit(1));

  // Keadaan data harus masih sesuai jenis koreksi (karyawan mungkin presensi/dikoreksi sejak diajukan).
  let existing: typeof attendances.$inferSelect | undefined;
  if (b.approve) {
    existing = await one(db.select().from(attendances).where(and(eq(attendances.employee_id, corr.employee_id), eq(attendances.date, corr.date))).limit(1));
    if (corr.kind === 'both' && existing) return c.json({ error: 'Karyawan sudah memiliki presensi di tanggal itu. Tolak pengajuan ini.' }, 409);
    if (corr.kind === 'out_only') {
      if (!existing?.clock_in || existing.clock_out) return c.json({ error: 'Presensi tanggal itu sudah berubah (jam pulang sudah terisi). Tolak pengajuan ini.' }, 409);
      const tErr = timesError(corr.date, null, corr.clock_out_time, existing.clock_in);
      if (tErr) return c.json({ error: tErr }, 409);
    }
  }

  const now = new Date().toISOString();
  const claimed = await db.update(attendance_corrections).set({
    status: b.approve ? 'approved' : 'rejected', decided_by: me.id, decided_at: now, decision_notes: notes || null, updated_at: now,
  }).where(and(eq(attendance_corrections.id, id), eq(attendance_corrections.status, 'pending'))).returning({ id: attendance_corrections.id });
  if (!claimed.length) return c.json({ error: 'Pengajuan ini sudah diproses' }, 409);

  const apply = !b.approve ? [] : [
    corr.kind === 'both'
      ? db.insert(attendances).values({
        id: crypto.randomUUID(), employee_id: corr.employee_id, date: corr.date, clock_in: wibToIso(corr.date, corr.clock_in_time!), clock_out: wibToIso(corr.date, corr.clock_out_time),
        clock_in_corrected: true, clock_out_corrected: true, status: 'dikoreksi', created_at: now,
      })
      : db.update(attendances).set({ clock_out: wibToIso(corr.date, corr.clock_out_time), clock_out_corrected: true })
        .where(and(eq(attendances.id, existing!.id), eq(attendances.clock_in, existing!.clock_in!))),
  ];
  try {
    await batch(db, [
      ...apply,
      db.insert(audit_log).values(auditRow({
        actorId: me.id, actorName: me.name, action: 'attendance.correction_decision', targetType: 'attendance_correction', targetId: id, targetLabel: owner?.name,
        ip: c.req.header('CF-Connecting-IP'), details: { decision: b.approve ? 'setuju' : 'tolak', date: corr.date, kind: corr.kind, in: corr.clock_in_time, out: corr.clock_out_time, reason: corr.reason, notes: notes || undefined },
      })),
      resolveStmt(db, id, { exceptEmployeeId: corr.employee_id }),
      ...notifyStmts(db, planCorrectionDecided({ id, requesterId: corr.employee_id, brief: brief(corr), approved: b.approve })),
    ]);
  } catch (e) {
    // Penerapan gagal (mis. presensi dibuat bersamaan): kembalikan ke menunggu agar bisa diputuskan ulang.
    await db.update(attendance_corrections).set({ status: 'pending', decided_by: null, decided_at: null, decision_notes: null }).where(eq(attendance_corrections.id, id));
    console.error('koreksi gagal diterapkan', e);
    return c.json({ error: 'Gagal menerapkan koreksi. Presensi tanggal itu mungkin berubah; coba lagi.' }, 409);
  }
  return c.json({ ok: true });
});
