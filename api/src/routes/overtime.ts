import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import {
  OVERTIME_DAYS_AHEAD, OVERTIME_DAYS_BACK, OVERTIME_MIN_MINUTES, FULL_DAY_MINUTES, LEMBUR_BLOCK_MINUTES, PENDING_STATUSES,
  isAdmin, minutesBetween, overtimeBrief, overtimeLabel, planOvertimeHcDecision, planOvertimeManagerDecision, planOvertimeOverride,
  planOvertimeRevoked, planOvertimeSubmitted, validateOvertime, wibDate, type LeaveStatus,
} from '@hris/shared';
import type { AppEnv } from '../env';
import { attendances, audit_log, employees, holidays, overtime_requests } from '../db/schema';
import { auditRow } from '../lib/audit';
import { adminRecipientIds, compensationShortfall, notifyStmts, resolveStmt, type Db } from '../lib/leave-db';
import { pushNotify } from '../lib/push';
import { requireAuth } from '../middleware/auth';

/**
 * Overtime (Lembur dan Kerja di Hari Libur). Alur sama dengan cuti: atasan langsung -> HC; pucuk pimpinan langsung ke HC; HC dapat mengambil alih.
 * Yang disetujui HC mengisi kuota Ganti Hari otomatis (kredit dihitung saat saldo dibaca, lihat shared/src/overtime.ts); HC dapat mencabutnya
 * selama kreditnya belum terpakai. Isi notifikasi tanpa alasan.
 */
export const overtime = new Hono<AppEnv>();
overtime.use('*', requireAuth);

type Ctx = Context<AppEnv>;
type Row = typeof overtime_requests.$inferSelect;
type Employee = typeof employees.$inferSelect;

const REASON_MAX = 1000;
const NOTES_MAX = 500;
const ACTIVE: LeaveStatus[] = ['pending_manager', 'pending_hc', 'approved'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batch = (db: Db, stmts: any[]) => db.batch(stmts as [any, ...any[]]);
const one = async <T>(p: Promise<T[]>) => (await p)[0];

async function loadActor(db: Db, id: string): Promise<Employee | null> {
  const [e] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return e && e.active ? e : null;
}
const brief = (r: Row) => overtimeBrief(overtimeLabel(r.kind), r.date, r.start_time, r.end_time);
const dayShift = (ymd: string, n: number) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- data form

/** Aturan, hari libur pada jendela tanggal yang boleh diajukan, dan apakah pengguna boleh mengajukan. */
overtime.get('/meta', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const today = wibDate();
  const hols = await db.select().from(holidays).orderBy(asc(holidays.date));
  const from = dayShift(today, -OVERTIME_DAYS_BACK);
  const to = dayShift(today, OVERTIME_DAYS_AHEAD);
  return c.json({
    today, from, to,
    rules: { minMinutes: OVERTIME_MIN_MINUTES, fullDayMinutes: FULL_DAY_MINUTES, lemburBlockMinutes: LEMBUR_BLOCK_MINUTES },
    canSubmit: Boolean(me.manager_id) || me.is_top_leader,
    holidays: hols.filter((h) => h.date >= from && h.date <= to).map((h) => ({ date: h.date, name: h.name })),
  });
});

// ---------------------------------------------------------------- karyawan

overtime.get('/mine', async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(overtime_requests).where(eq(overtime_requests.employee_id, c.get('user').id))
    .orderBy(desc(overtime_requests.date), desc(overtime_requests.created_at)).limit(200);
  return c.json(rows);
});

overtime.post('/', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
  const kind = str('kind');
  const date = str('date');
  const startTime = str('startTime');
  const endTime = str('endTime');
  const reason = str('reason');

  if (!me.manager_id && !me.is_top_leader) return c.json({ error: 'Atasan langsung Anda belum ditetapkan. Hubungi HC/Admin sebelum mengajukan overtime.' }, 400);
  const isHoliday = Boolean(date) && Boolean(await one(db.select({ d: holidays.date }).from(holidays).where(eq(holidays.date, date)).limit(1)));
  const error = validateOvertime({ kind, date, startTime, endTime }, wibDate(), isHoliday);
  if (error) return c.json({ error }, 400);
  if (!reason) return c.json({ error: 'Alasan wajib diisi' }, 400);
  if (reason.length > REASON_MAX) return c.json({ error: `Alasan maksimal ${REASON_MAX} karakter` }, 400);
  const dup = await one(db.select({ id: overtime_requests.id }).from(overtime_requests).where(and(
    eq(overtime_requests.employee_id, me.id), eq(overtime_requests.date, date), inArray(overtime_requests.status, ACTIVE),
  )).limit(1));
  if (dup) return c.json({ error: 'Anda sudah punya pengajuan overtime aktif pada tanggal ini' }, 400);

  const minutes = minutesBetween(startTime, endTime)!;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const manager = me.manager_id ? await one(db.select({ name: employees.name }).from(employees).where(eq(employees.id, me.manager_id)).limit(1)) : null;
  const label = overtimeLabel(kind);
  const notes = planOvertimeSubmitted({
    requestId: id, requesterId: me.id, requesterName: me.name, brief: overtimeBrief(label, date, startTime, endTime),
    managerId: me.manager_id, managerName: manager?.name ?? null, adminIds: await adminRecipientIds(db),
  });
  await batch(db, [
    db.insert(overtime_requests).values({
      id, employee_id: me.id, kind: kind as 'lembur' | 'hari_libur', date, start_time: startTime, end_time: endTime, minutes, reason,
      status: me.manager_id ? 'pending_manager' : 'pending_hc', created_at: now, updated_at: now,
    }),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'overtime.submitted', targetType: 'overtime_request', targetId: id, details: { kind: label, date, minutes } })),
    ...notifyStmts(db, notes),
  ]);
  pushNotify(c, notes);
  return c.json({ id }, 201);
});

/** Batalkan selama masih menunggu (yang sudah disetujui hanya dapat dicabut HC). */
overtime.post('/:id/cancel', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const id = c.req.param('id');
  const req = await one(db.select().from(overtime_requests).where(and(eq(overtime_requests.id, id), eq(overtime_requests.employee_id, me.id))).limit(1));
  if (!req) return c.json({ error: 'Pengajuan tidak ditemukan' }, 404);
  if (!PENDING_STATUSES.includes(req.status)) return c.json({ error: 'Pengajuan sudah diproses. Overtime yang disetujui hanya dapat dibatalkan HC' }, 409);
  const done = await db.update(overtime_requests).set({ status: 'cancelled', updated_at: new Date().toISOString() })
    .where(and(eq(overtime_requests.id, id), inArray(overtime_requests.status, PENDING_STATUSES))).returning({ id: overtime_requests.id });
  if (!done.length) return c.json({ error: 'Pengajuan sudah diproses, tidak dapat dibatalkan' }, 409);
  await batch(db, [
    resolveStmt(db, id),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'overtime.cancelled', targetType: 'overtime_request', targetId: id })),
  ]);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- daftar penyetuju

/** Tambahkan `hasAttendance`: ada presensi masuk pada tanggal overtime (informasi bagi penyetuju, terutama Kerja di Hari Libur). */
async function annotate(db: Db, rows: { req: Row; name: string | null }[]) {
  const ids = [...new Set(rows.map((r) => r.req.employee_id))];
  const dates = [...new Set(rows.map((r) => r.req.date))];
  const present = new Set<string>();
  for (let i = 0; i < ids.length; i += 80) {
    const part = await db.select({ e: attendances.employee_id, d: attendances.date, ci: attendances.clock_in }).from(attendances)
      .where(and(inArray(attendances.employee_id, ids.slice(i, i + 80)), inArray(attendances.date, dates.length ? dates : ['']))).limit(2000);
    for (const p of part) if (p.ci) present.add(`${p.e}|${p.d}`);
  }
  return rows.map((r) => ({ ...r.req, employeeName: r.name, hasAttendance: present.has(`${r.req.employee_id}|${r.req.date}`) }));
}

const withEmployee = (db: Db) =>
  db.select({ req: overtime_requests, name: employees.name }).from(overtime_requests).innerJoin(employees, eq(overtime_requests.employee_id, employees.id));

overtime.get('/approvals', async (c) => {
  const db = drizzle(c.env.DB);
  const meId = c.get('user').id;
  if (c.req.query('tab') === 'history') {
    const rows = await withEmployee(db).where(and(
      eq(employees.manager_id, meId),
      inArray(overtime_requests.status, ['pending_hc', 'approved', 'rejected']),
      or(eq(overtime_requests.manager_decided_by, meId), isNull(overtime_requests.manager_decided_by)),
    )).orderBy(desc(overtime_requests.updated_at)).limit(100);
    return c.json(await annotate(db, rows));
  }
  const rows = await withEmployee(db).where(and(eq(employees.manager_id, meId), eq(overtime_requests.status, 'pending_manager'))).orderBy(asc(overtime_requests.created_at));
  return c.json(await annotate(db, rows));
});

function readDecision(b: Record<string, unknown>, field: 'notes' | 'reason') {
  const text = typeof b[field] === 'string' ? (b[field] as string).trim().slice(0, NOTES_MAX) : '';
  return { approve: typeof b.approve === 'boolean' ? b.approve : null, text };
}

overtime.post('/:id/manager-decision', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const id = c.req.param('id');
  const { approve, text: notes } = readDecision(await c.req.json().catch(() => ({})), 'notes');
  if (approve === null) return c.json({ error: 'Keputusan tidak valid' }, 400);
  const req = await one(db.select().from(overtime_requests).where(eq(overtime_requests.id, id)).limit(1));
  if (!req) return c.json({ error: 'Pengajuan tidak ditemukan' }, 404);
  if (req.status !== 'pending_manager') return c.json({ error: 'Pengajuan ini sudah diproses' }, 409);
  if (req.employee_id === me.id) return c.json({ error: 'Anda tidak dapat menyetujui pengajuan sendiri' }, 403);
  const requester = await one(db.select().from(employees).where(eq(employees.id, req.employee_id)).limit(1));
  if (!requester || requester.manager_id !== me.id) return c.json({ error: 'Anda tidak memiliki wewenang untuk pengajuan ini' }, 403);

  const now = new Date().toISOString();
  const claimed = await db.update(overtime_requests).set({
    status: approve ? 'pending_hc' : 'rejected', manager_decided_by: me.id, manager_decided_at: now, manager_notes: notes || null, updated_at: now,
  }).where(and(eq(overtime_requests.id, id), eq(overtime_requests.status, 'pending_manager'))).returning({ id: overtime_requests.id });
  if (!claimed.length) return c.json({ error: 'Pengajuan ini sudah diproses' }, 409);

  const planned = planOvertimeManagerDecision({
    requestId: id, requesterId: requester.id, requesterName: requester.name, brief: brief(req), actorId: me.id, approved: approve, adminIds: await adminRecipientIds(db),
  });
  await batch(db, [
    db.insert(audit_log).values(auditRow({
      actorId: me.id, actorName: me.name, action: 'overtime.manager_decision', targetType: 'overtime_request', targetId: id, targetLabel: requester.name,
      details: { decision: approve ? 'setuju' : 'tolak', kind: overtimeLabel(req.kind), date: req.date, minutes: req.minutes, notes: notes || undefined },
    })),
    resolveStmt(db, id, { exceptEmployeeId: requester.id }),
    ...notifyStmts(db, planned),
  ]);
  pushNotify(c, planned);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- HC / admin

overtime.get('/admin', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const q = c.req.query('status') ?? 'pending_hc';
  const statuses: LeaveStatus[] = ['pending_manager', 'pending_hc', 'approved', 'rejected', 'cancelled'];
  const filter = q === 'all' ? undefined : statuses.includes(q as LeaveStatus) ? eq(overtime_requests.status, q as LeaveStatus) : null;
  if (filter === null) return c.json({ error: 'Status tidak valid' }, 400);
  const rows = await db.select({ req: overtime_requests, name: employees.name, managerId: employees.manager_id })
    .from(overtime_requests).innerJoin(employees, eq(overtime_requests.employee_id, employees.id))
    .where(filter).orderBy(q === 'all' ? desc(overtime_requests.created_at) : asc(overtime_requests.created_at)).limit(500);
  const managerIds = [...new Set(rows.filter((r) => r.req.status === 'pending_manager' && r.managerId).map((r) => r.managerId!))];
  const names = new Map<string, string>();
  if (managerIds.length) for (const m of await db.select({ id: employees.id, name: employees.name }).from(employees).where(inArray(employees.id, managerIds))) names.set(m.id, m.name);
  const annotated = await annotate(db, rows);
  return c.json(annotated.map((r, i) => ({ ...r, managerName: rows[i]!.req.status === 'pending_manager' && rows[i]!.managerId ? names.get(rows[i]!.managerId!) ?? null : null })));
});

async function hcDecide(c: Ctx, mode: 'normal' | 'override') {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const id = c.req.param('id') ?? '';
  const { approve, text } = readDecision(await c.req.json().catch(() => ({})), mode === 'override' ? 'reason' : 'notes');
  if (approve === null) return c.json({ error: 'Keputusan tidak valid' }, 400);
  if (mode === 'override' && !text) return c.json({ error: 'Alasan ambil alih wajib diisi' }, 400);
  const expected: LeaveStatus = mode === 'override' ? 'pending_manager' : 'pending_hc';
  const req = await one(db.select().from(overtime_requests).where(eq(overtime_requests.id, id)).limit(1));
  if (!req) return c.json({ error: 'Pengajuan tidak ditemukan' }, 404);
  if (req.status !== expected) return c.json({ error: mode === 'override' ? 'Pengajuan ini sudah diproses atau tidak lagi menunggu atasan' : 'Pengajuan ini sudah diproses atau belum sampai tahap HC' }, 409);
  if (req.employee_id === me.id) return c.json({ error: 'Anda tidak dapat menyetujui pengajuan sendiri' }, 403);
  const requester = await one(db.select().from(employees).where(eq(employees.id, req.employee_id)).limit(1));
  if (!requester) return c.json({ error: 'Karyawan pengaju tidak ditemukan' }, 404);

  const now = new Date().toISOString();
  const claimed = await db.update(overtime_requests).set({
    status: approve ? 'approved' : 'rejected', hc_decided_by: me.id, hc_decided_at: now, updated_at: now,
    hc_notes: mode === 'normal' ? text || null : null, hc_override: mode === 'override', hc_override_reason: mode === 'override' ? text : null,
  }).where(and(eq(overtime_requests.id, id), eq(overtime_requests.status, expected))).returning({ id: overtime_requests.id });
  if (!claimed.length) return c.json({ error: 'Pengajuan ini sudah diproses' }, 409);

  const base = { requestId: id, requesterId: requester.id, requesterName: requester.name, brief: brief(req), approved: approve };
  const planned = mode === 'override' ? planOvertimeOverride({ ...base, actorId: me.id, managerId: requester.manager_id }) : planOvertimeHcDecision(base);
  await batch(db, [
    db.insert(audit_log).values(auditRow({
      actorId: me.id, actorName: me.name, action: mode === 'override' ? 'overtime.hc_override' : 'overtime.hc_decision', targetType: 'overtime_request', targetId: id, targetLabel: requester.name,
      details: {
        decision: approve ? 'setuju' : 'tolak', kind: overtimeLabel(req.kind), date: req.date, minutes: req.minutes,
        ...(mode === 'override' ? { reason: text, manager_id: requester.manager_id ?? undefined } : { notes: text || undefined }),
      },
    })),
    resolveStmt(db, id, { exceptEmployeeId: requester.id }),
    ...notifyStmts(db, planned),
  ]);
  pushNotify(c, planned);
  return c.json({ ok: true });
}

overtime.post('/:id/hc-decision', (c) => hcDecide(c, 'normal'));
overtime.post('/:id/hc-override', (c) => hcDecide(c, 'override'));

/** HC mencabut overtime yang sudah disetujui. Ditolak bila kreditnya sudah terpakai (kelebihan pemakaian Ganti Hari akan bertambah). */
overtime.post('/:id/revoke', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json<{ reason?: unknown }>().catch(() => ({} as { reason?: unknown }));
  const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, NOTES_MAX) : '';
  if (!reason) return c.json({ error: 'Alasan pencabutan wajib diisi' }, 400);
  const req = await one(db.select().from(overtime_requests).where(eq(overtime_requests.id, id)).limit(1));
  if (!req) return c.json({ error: 'Pengajuan tidak ditemukan' }, 404);
  if (req.status !== 'approved') return c.json({ error: 'Hanya overtime yang sudah disetujui yang dapat dicabut' }, 409);
  const requester = await one(db.select().from(employees).where(eq(employees.id, req.employee_id)).limit(1));
  if (!requester) return c.json({ error: 'Karyawan tidak ditemukan' }, 404);

  const year = Number(req.date.slice(0, 4));
  const [before, after] = await Promise.all([
    compensationShortfall(db, req.employee_id, year),
    compensationShortfall(db, req.employee_id, year, id),
  ]);
  if (after > before) return c.json({ error: 'Kredit Ganti Hari dari overtime ini sudah terpakai. Batalkan atau ubah pengajuan Ganti Hari karyawan lebih dulu.' }, 409);

  const now = new Date().toISOString();
  const done = await db.update(overtime_requests).set({ status: 'cancelled', revoked_by: me.id, revoked_at: now, revoke_reason: reason, updated_at: now })
    .where(and(eq(overtime_requests.id, id), eq(overtime_requests.status, 'approved'))).returning({ id: overtime_requests.id });
  if (!done.length) return c.json({ error: 'Pengajuan sudah berubah, muat ulang' }, 409);
  const planned = planOvertimeRevoked({ requestId: id, requesterId: requester.id, requesterName: requester.name, brief: brief(req) });
  await batch(db, [
    db.insert(audit_log).values(auditRow({
      actorId: me.id, actorName: me.name, action: 'overtime.revoked', targetType: 'overtime_request', targetId: id, targetLabel: requester.name,
      details: { kind: overtimeLabel(req.kind), date: req.date, minutes: req.minutes, reason },
    })),
    ...notifyStmts(db, planned),
  ]);
  pushNotify(c, planned);
  return c.json({ ok: true });
});
