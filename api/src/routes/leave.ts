import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import {
  ACTIVE_STATUSES,
  LEAVE_TYPES,
  PENDING_STATUSES,
  calculateLeaveDuration,
  isAdmin,
  leaveBrief,
  planHcDecision,
  planManagerDecision,
  planOverride,
  planSubmitted,
  validateLeaveDates,
  type LeaveCategory,
  type LeaveStatus,
} from '@hris/shared';
import type { AppEnv } from '../env';
import { audit_log, employees, holidays, leave_requests } from '../db/schema';
import { auditRow } from '../lib/audit';
import { adminRecipientIds, getBalances, loadHolidayDates, notifyStmts, resolveStmt, type Db } from '../lib/leave-db';
import { requireAuth } from '../middleware/auth';

export const leave = new Hono<AppEnv>();
leave.use('*', requireAuth);

const REASON_MAX = 1000;
const NOTES_MAX = 500;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type Employee = typeof employees.$inferSelect;
type LeaveRow = typeof leave_requests.$inferSelect;

/** Data pelaku diambil ulang dari D1 (peran dari token bisa basi sampai 15 menit). */
async function loadActor(db: Db, id: string): Promise<Employee | null> {
  const [e] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return e && e.active ? e : null;
}

const one = async <T>(p: Promise<T[]>) => (await p)[0];

const brief = (r: LeaveRow) => leaveBrief(r.leave_type, r.start_date, r.end_date, r.total_days);

/** Jalankan beberapa pernyataan dalam satu transaksi D1 (db.batch menuntut tuple tak kosong). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batch = (db: Db, stmts: any[]) => db.batch(stmts as [any, ...any[]]);

// ---------------------------------------------------------------- data form

/** Jatah per jenis, atasan, dan hari libur untuk form pengajuan. `?year=` mengikuti tahun tanggal mulai. */
leave.get('/meta', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const year = Number(c.req.query('year')) || new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return c.json({ error: 'Tahun tidak valid' }, 400);

  const [balances, manager, hols] = await Promise.all([
    getBalances(db, me.id, year),
    me.manager_id ? one(db.select({ name: employees.name }).from(employees).where(eq(employees.id, me.manager_id)).limit(1)) : null,
    db.select().from(holidays).where(and(gte(holidays.date, `${year - 1}-01-01`), lte(holidays.date, `${year + 1}-12-31`))).orderBy(asc(holidays.date)),
  ]);
  return c.json({
    gender: me.gender,
    managerName: manager?.name ?? null,
    canSubmit: Boolean(me.manager_id) || me.is_top_leader,
    balances,
    holidays: hols,
  });
});

// ---------------------------------------------------------------- karyawan

leave.get('/mine', async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(leave_requests)
    .where(eq(leave_requests.employee_id, c.get('user').id))
    .orderBy(desc(leave_requests.created_at)).limit(200);
  return c.json(rows);
});

leave.post('/', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);

  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
  const type = str('leaveType') as LeaveCategory;
  const start = str('startDate');
  const end = str('endDate');
  const reason = str('reason');
  const startTime = str('startTime') || null;
  const endTime = str('endTime') || null;

  if (!me.manager_id && !me.is_top_leader) {
    return c.json({ error: 'Atasan langsung Anda belum ditetapkan. Hubungi HC/Admin sebelum mengajukan cuti.' }, 400);
  }
  const meta = LEAVE_TYPES.find((t) => t.key === type);
  if (!meta) return c.json({ error: 'Jenis cuti tidak valid' }, 400);

  const holidaySet = await loadHolidayDates(db, start, end);
  const dateError = validateLeaveDates(type, start, end, holidaySet);
  if (dateError) return c.json({ error: dateError }, 400);
  if (!reason) return c.json({ error: 'Alasan wajib diisi' }, 400);
  if (reason.length > REASON_MAX) return c.json({ error: `Alasan maksimal ${REASON_MAX} karakter` }, 400);

  // Durasi dihitung server, bukan dari klien
  const days = calculateLeaveDuration(type, start, end, holidaySet);
  if (days > 366) return c.json({ error: 'Durasi pengajuan terlalu panjang' }, 400);

  if (meta.gender && me.gender && me.gender !== meta.gender) {
    return c.json({ error: `${meta.label} hanya diperuntukkan bagi karyawan ${meta.gender}` }, 400);
  }
  if (meta.timeBased && (!startTime || !endTime || !TIME_RE.test(startTime) || !TIME_RE.test(endTime))) {
    return c.json({ error: 'Detail jam wajib diisi dengan format yang benar' }, 400);
  }
  // TODO(lampiran): jenis requiresAttachment (Sakit) belum bisa dipaksa sebelum unggah berkas ke R2 ada.

  const overlap = await one(db.select({ id: leave_requests.id }).from(leave_requests).where(and(
    eq(leave_requests.employee_id, me.id),
    inArray(leave_requests.status, ACTIVE_STATUSES),
    lte(leave_requests.start_date, end),
    gte(leave_requests.end_date, start),
  )).limit(1));
  if (overlap) return c.json({ error: 'Tanggal ini bertumpang tindih dengan pengajuan Anda yang lain' }, 400);

  const balance = (await getBalances(db, me.id, Number(start.slice(0, 4)))).find((x) => x.type === type)!;
  if (balance.remaining !== null && days > balance.remaining) {
    return c.json({ error: `Kuota ${meta.label} tidak mencukupi: diajukan ${days} hari kerja, tersisa ${Math.max(balance.remaining, 0)} hari` }, 400);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const manager = me.manager_id
    ? await one(db.select({ name: employees.name }).from(employees).where(eq(employees.id, me.manager_id)).limit(1))
    : null;
  const notes = planSubmitted({
    requestId: id, requesterId: me.id, requesterName: me.name, brief: leaveBrief(type, start, end, days),
    managerId: me.manager_id, managerName: manager?.name ?? null, adminIds: await adminRecipientIds(db),
  });
  await batch(db, [
    db.insert(leave_requests).values({
      id, employee_id: me.id, leave_type: type, start_date: start, end_date: end,
      start_time: meta.timeBased ? startTime : null, end_time: meta.timeBased ? endTime : null,
      total_days: days, reason, status: me.manager_id ? 'pending_manager' : 'pending_hc',
      created_at: now, updated_at: now,
    }),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'leave.submitted', targetType: 'leave_request', targetId: id, details: { type, start, end, days } })),
    ...notifyStmts(db, notes),
  ]);
  return c.json({ id }, 201);
});

/** Batalkan selama masih menunggu. Baris tidak dihapus (jejak audit), statusnya jadi 'cancelled'. */
leave.post('/:id/cancel', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const id = c.req.param('id');

  const req = await one(db.select().from(leave_requests).where(and(eq(leave_requests.id, id), eq(leave_requests.employee_id, me.id))).limit(1));
  if (!req) return c.json({ error: 'Pengajuan tidak ditemukan' }, 404);
  if (!PENDING_STATUSES.includes(req.status)) return c.json({ error: 'Pengajuan sudah diproses, tidak dapat dibatalkan' }, 409);

  // Update bersyarat: mencegah balapan dengan persetujuan
  const done = await db.update(leave_requests)
    .set({ status: 'cancelled', updated_at: new Date().toISOString() })
    .where(and(eq(leave_requests.id, id), inArray(leave_requests.status, PENDING_STATUSES)))
    .returning({ id: leave_requests.id });
  if (!done.length) return c.json({ error: 'Pengajuan sudah diproses, tidak dapat dibatalkan' }, 409);

  await batch(db, [
    resolveStmt(db, id),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'leave.cancelled', targetType: 'leave_request', targetId: id })),
  ]);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- atasan

const withEmployee = (db: Db) =>
  db.select({ req: leave_requests, name: employees.name, dept: employees.dept, title: employees.title })
    .from(leave_requests).innerJoin(employees, eq(leave_requests.employee_id, employees.id));

const shape = (r: { req: LeaveRow; name: string | null; dept: string | null; title: string | null }) =>
  ({ ...r.req, employeeName: r.name, dept: r.dept, title: r.title });

/** `?tab=pending` (default): menunggu atasan ini. `?tab=history`: sudah diputuskan atasan ini atau diambil alih HC. */
leave.get('/approvals', async (c) => {
  const db = drizzle(c.env.DB);
  const meId = c.get('user').id;
  if (c.req.query('tab') === 'history') {
    const rows = await withEmployee(db).where(and(
      eq(employees.manager_id, meId),
      inArray(leave_requests.status, ['pending_hc', 'approved', 'rejected']),
      or(eq(leave_requests.manager_decided_by, meId), isNull(leave_requests.manager_decided_by)),
    )).orderBy(desc(leave_requests.updated_at)).limit(100);
    return c.json(rows.map(shape));
  }
  const rows = await withEmployee(db)
    .where(and(eq(employees.manager_id, meId), eq(leave_requests.status, 'pending_manager')))
    .orderBy(asc(leave_requests.created_at));
  return c.json(rows.map(shape));
});

function readDecision(b: Record<string, unknown>, field: 'notes' | 'reason') {
  const approve = b.approve;
  const text = typeof b[field] === 'string' ? (b[field] as string).trim().slice(0, NOTES_MAX) : '';
  return { approve: typeof approve === 'boolean' ? approve : null, text };
}

leave.post('/:id/manager-decision', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const id = c.req.param('id');
  const { approve, text: notes } = readDecision(await c.req.json().catch(() => ({})), 'notes');
  if (approve === null) return c.json({ error: 'Keputusan tidak valid' }, 400);

  const req = await one(db.select().from(leave_requests).where(eq(leave_requests.id, id)).limit(1));
  if (!req) return c.json({ error: 'Pengajuan tidak ditemukan' }, 404);
  if (req.status !== 'pending_manager') return c.json({ error: 'Pengajuan ini sudah diproses' }, 409);
  if (req.employee_id === me.id) return c.json({ error: 'Anda tidak dapat menyetujui pengajuan sendiri' }, 403);
  const requester = await one(db.select().from(employees).where(eq(employees.id, req.employee_id)).limit(1));
  if (!requester || requester.manager_id !== me.id) return c.json({ error: 'Anda tidak memiliki wewenang untuk pengajuan ini' }, 403);

  const now = new Date().toISOString();
  const claimed = await db.update(leave_requests).set({
    status: approve ? 'pending_hc' : 'rejected',
    manager_decided_by: me.id, manager_decided_at: now, manager_notes: notes || null, updated_at: now,
  }).where(and(eq(leave_requests.id, id), eq(leave_requests.status, 'pending_manager'))).returning({ id: leave_requests.id });
  if (!claimed.length) return c.json({ error: 'Pengajuan ini sudah diproses' }, 409);

  const notes_ = planManagerDecision({
    requestId: id, requesterId: requester.id, requesterName: requester.name, brief: brief(req),
    actorId: me.id, approved: approve, adminIds: await adminRecipientIds(db),
  });
  await batch(db, [
    db.insert(audit_log).values(auditRow({
      actorId: me.id, actorName: me.name, action: 'leave.manager_decision', targetType: 'leave_request', targetId: id, targetLabel: requester.name,
      details: { decision: approve ? 'setuju' : 'tolak', type: req.leave_type, start: req.start_date, end: req.end_date, days: req.total_days, notes: notes || undefined },
    })),
    resolveStmt(db, id, { exceptEmployeeId: requester.id }),
    ...notifyStmts(db, notes_),
  ]);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- HC / admin

/** Daftar untuk admin. `?status=pending_hc` (default) | `pending_manager` (tertahan di atasan) | `all`. */
leave.get('/admin', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const q = c.req.query('status') ?? 'pending_hc';
  const statuses: LeaveStatus[] = ['pending_manager', 'pending_hc', 'approved', 'rejected', 'cancelled'];
  const filter = q === 'all' ? undefined : statuses.includes(q as LeaveStatus) ? eq(leave_requests.status, q as LeaveStatus) : null;
  if (filter === null) return c.json({ error: 'Status tidak valid' }, 400);

  const rows = await db
    .select({ req: leave_requests, name: employees.name, dept: employees.dept, title: employees.title, managerId: employees.manager_id })
    .from(leave_requests).innerJoin(employees, eq(leave_requests.employee_id, employees.id))
    .where(filter).orderBy(q === 'all' ? desc(leave_requests.created_at) : asc(leave_requests.created_at)).limit(500);

  const managerIds = [...new Set(rows.filter((r) => r.req.status === 'pending_manager' && r.managerId).map((r) => r.managerId!))];
  const names = new Map<string, string>();
  if (managerIds.length) {
    for (const m of await db.select({ id: employees.id, name: employees.name }).from(employees).where(inArray(employees.id, managerIds))) names.set(m.id, m.name);
  }
  return c.json(rows.map((r) => ({
    ...shape(r),
    managerName: r.req.status === 'pending_manager' && r.managerId ? names.get(r.managerId) ?? null : null,
  })));
});

/** Kuota pengaju masih cukup untuk menyetujui? `remaining` sudah memotong pengajuan ini (statusnya pending). */
async function quotaError(db: Db, req: LeaveRow): Promise<string | null> {
  const b = (await getBalances(db, req.employee_id, Number(req.start_date.slice(0, 4)))).find((x) => x.type === req.leave_type);
  return b && b.remaining !== null && b.remaining < 0
    ? `Kuota ${req.leave_type} karyawan tidak mencukupi. Ubah jatah di menu Kuota Cuti atau tolak pengajuan.`
    : null;
}

async function hcDecide(c: import('hono').Context<AppEnv>, mode: 'normal' | 'override') {
  const db = drizzle(c.env.DB);
  const me = await loadActor(db, c.get('user').id);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const id = c.req.param('id') ?? '';
  const { approve, text } = readDecision(await c.req.json().catch(() => ({})), mode === 'override' ? 'reason' : 'notes');
  if (approve === null) return c.json({ error: 'Keputusan tidak valid' }, 400);
  if (mode === 'override' && !text) return c.json({ error: 'Alasan ambil alih wajib diisi' }, 400);

  const expected: LeaveStatus = mode === 'override' ? 'pending_manager' : 'pending_hc';
  const req = await one(db.select().from(leave_requests).where(eq(leave_requests.id, id)).limit(1));
  if (!req) return c.json({ error: 'Pengajuan tidak ditemukan' }, 404);
  if (req.status !== expected) {
    return c.json({ error: mode === 'override' ? 'Pengajuan ini sudah diproses atau tidak lagi menunggu atasan' : 'Pengajuan ini sudah diproses atau belum sampai tahap HC' }, 409);
  }
  if (req.employee_id === me.id) return c.json({ error: 'Anda tidak dapat menyetujui pengajuan sendiri' }, 403);
  if (approve) {
    const err = await quotaError(db, req);
    if (err) return c.json({ error: err }, 409);
  }
  const requester = await one(db.select().from(employees).where(eq(employees.id, req.employee_id)).limit(1));
  if (!requester) return c.json({ error: 'Karyawan pengaju tidak ditemukan' }, 404);

  const now = new Date().toISOString();
  const claimed = await db.update(leave_requests).set({
    status: approve ? 'approved' : 'rejected',
    hc_decided_by: me.id, hc_decided_at: now, updated_at: now,
    hc_notes: mode === 'normal' ? text || null : null,
    hc_override: mode === 'override',
    hc_override_reason: mode === 'override' ? text : null,
  }).where(and(eq(leave_requests.id, id), eq(leave_requests.status, expected))).returning({ id: leave_requests.id });
  if (!claimed.length) return c.json({ error: 'Pengajuan ini sudah diproses' }, 409);

  const base = { requestId: id, requesterId: requester.id, requesterName: requester.name, brief: brief(req), approved: approve };
  const notes = mode === 'override'
    ? planOverride({ ...base, actorId: me.id, managerId: requester.manager_id })
    : planHcDecision(base);
  await batch(db, [
    db.insert(audit_log).values(auditRow({
      actorId: me.id, actorName: me.name, action: mode === 'override' ? 'leave.hc_override' : 'leave.hc_decision',
      targetType: 'leave_request', targetId: id, targetLabel: requester.name,
      details: {
        decision: approve ? 'setuju' : 'tolak', type: req.leave_type, start: req.start_date, end: req.end_date, days: req.total_days,
        ...(mode === 'override' ? { reason: text, manager_id: requester.manager_id ?? undefined } : { notes: text || undefined }),
      },
    })),
    resolveStmt(db, id, { exceptEmployeeId: requester.id }),
    ...notifyStmts(db, notes),
  ]);
  return c.json({ ok: true });
}

leave.post('/:id/hc-decision', (c) => hcDecide(c, 'normal'));
/** HC mengambil alih pengajuan yang tertahan di atasan; hasilnya langsung final. Alasan wajib dan tercatat di audit. */
leave.post('/:id/hc-override', (c) => hcDecide(c, 'override'));
