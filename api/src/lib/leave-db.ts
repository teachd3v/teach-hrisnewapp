// Akses database untuk fitur cuti: saldo, hari libur, daftar admin, dan penulisan notifikasi.
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, between, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import {
  ACTIONABLE_TYPES,
  ACTIVE_STATUSES,
  LEAVE_KEYS,
  allocateLots,
  baseLot,
  compensationBalance,
  computeBalances,
  jointLeaveDeduction,
  leaveTypeAllowsStatus,
  overtimeLots,
  wibDate,
  type LeaveBalance,
  type LeaveStatus,
  type NotifyInput,
} from '@hris/shared';
import { employees, holidays, leave_quotas, leave_requests, notifications, overtime_requests } from '../db/schema';
import { loadLeaveTypes } from './leave-types';
import { loadJointLeaveSettings } from './settings';

export type Db = DrizzleD1Database;

export async function loadHolidayDates(db: Db, start: string, end: string): Promise<Set<string>> {
  const rows = await db.select({ date: holidays.date }).from(holidays).where(between(holidays.date, start, end));
  return new Set(rows.map((r) => r.date));
}

/** Potongan cuti bersama untuk satu karyawan pada satu tahun; 0 bila pengaturan mati atau statusnya dikecualikan. */
async function jointDeductionOf(db: Db, emp: { join_date: string | null; status: string | null } | undefined, year: number): Promise<number> {
  const settings = await loadJointLeaveSettings(db);
  if (!settings.enabled) return 0;
  if (!emp || (emp.status && settings.exemptStatusIds.includes(emp.status))) return 0;
  const joint = await db.select({ date: holidays.date, type: holidays.type }).from(holidays)
    .where(and(between(holidays.date, `${year}-01-01`, `${year}-12-31`), eq(holidays.type, 'JOINT')));
  return jointLeaveDeduction(joint, emp.join_date, year);
}

/**
 * Saldo Ganti Hari satu tahun dari lot dasar + kredit overtime yang disetujui (lihat shared/src/overtime.ts). Null bila kuota Ganti Hari
 * tanpa batas (tidak ada yang perlu dihitung). Kuota dasar tahun sebelumnya ikut dimuat karena kredit overtime berlaku sampai 31 Maret tahun berikutnya.
 */
async function compensationFor(db: Db, employeeId: string, year: number, asOf: string, defaultQuota: number | null) {
  const key = LEAVE_KEYS.compensation;
  const [quotaRows, overtime, uses] = await Promise.all([
    db.select().from(leave_quotas).where(and(eq(leave_quotas.employee_id, employeeId), eq(leave_quotas.leave_type, key), inArray(leave_quotas.year, [year - 1, year]))),
    db.select({ id: overtime_requests.id, kind: overtime_requests.kind, date: overtime_requests.date, minutes: overtime_requests.minutes }).from(overtime_requests)
      .where(and(eq(overtime_requests.employee_id, employeeId), eq(overtime_requests.status, 'approved'), between(overtime_requests.date, `${year - 1}-01-01`, `${year}-12-31`))),
    db.select({ start: leave_requests.start_date, days: leave_requests.total_days }).from(leave_requests)
      .where(and(eq(leave_requests.employee_id, employeeId), eq(leave_requests.leave_type, key), inArray(leave_requests.status, ACTIVE_STATUSES),
        between(leave_requests.start_date, `${year - 1}-01-01`, `${year}-12-31`))),
  ]);
  const quotaOf = (y: number) => quotaRows.find((r) => r.year === y)?.quota ?? defaultQuota;
  const prev = quotaOf(year - 1);
  const current = quotaOf(year);
  if (prev === null || current === null) return null;
  return compensationBalance({ year, asOf, baseQuota: { prev, current }, overtime, uses });
}

/**
 * Total hari pemakaian Ganti Hari yang tidak tertutup lot (kuota dasar + kredit overtime) pada tahun-1 sampai tahun+1 dari `year`.
 * `excludeOvertimeId` menghitung seolah overtime itu tidak ada (untuk memeriksa apakah pencabutannya aman). 0 bila kuota tanpa batas.
 */
export async function compensationShortfall(db: Db, employeeId: string, year: number, excludeOvertimeId?: string): Promise<number> {
  const key = LEAVE_KEYS.compensation;
  const types = await loadLeaveTypes(db);
  const defaultQuota = types.find((t) => t.key === key)?.defaultQuota ?? null;
  const years = [year - 1, year, year + 1];
  const [quotaRows, overtime, uses] = await Promise.all([
    db.select().from(leave_quotas).where(and(eq(leave_quotas.employee_id, employeeId), eq(leave_quotas.leave_type, key), inArray(leave_quotas.year, years))),
    db.select({ id: overtime_requests.id, kind: overtime_requests.kind, date: overtime_requests.date, minutes: overtime_requests.minutes }).from(overtime_requests)
      .where(and(eq(overtime_requests.employee_id, employeeId), eq(overtime_requests.status, 'approved'), between(overtime_requests.date, `${year - 1}-01-01`, `${year + 1}-12-31`))),
    db.select({ start: leave_requests.start_date, days: leave_requests.total_days }).from(leave_requests)
      .where(and(eq(leave_requests.employee_id, employeeId), eq(leave_requests.leave_type, key), inArray(leave_requests.status, ACTIVE_STATUSES),
        between(leave_requests.start_date, `${year - 1}-01-01`, `${year + 1}-12-31`))),
  ]);
  const bases = [];
  for (const y of years) {
    const q = quotaRows.find((r) => r.year === y)?.quota ?? defaultQuota;
    if (q === null) return 0;
    bases.push(baseLot(y, q));
  }
  return allocateLots([...bases, ...overtimeLots(overtime.filter((o) => o.id !== excludeOvertimeId))], uses).shortfall;
}

/** Tanggal acuan bawaan: hari ini (tahun berjalan), akhir tahun (tahun lalu), atau awal tahun (tahun depan). */
export function defaultAsOf(year: number, today = wibDate()): string {
  const cur = Number(today.slice(0, 4));
  return year === cur ? today : year < cur ? `${year}-12-31` : `${year}-01-01`;
}

/**
 * Saldo per jenis cuti. Jenis nonaktif hanya ikut bila masih punya pemakaian/potongan tahun itu (agar saldonya tetap terlihat);
 * jenis nonaktif yang tidak dipakai disembunyikan. Jenis yang dibatasi status lain (mis. Cuti Besar khusus karyawan tetap)
 * disembunyikan dari karyawan yang tidak berhak, kecuali sudah punya pemakaian.
 */
export async function getBalances(db: Db, employeeId: string, year: number, asOf: string = defaultAsOf(year)): Promise<LeaveBalance[]> {
  const [emp] = await db.select({ join_date: employees.join_date, status: employees.employment_status_id })
    .from(employees).where(eq(employees.id, employeeId)).limit(1);
  const [types, jointDeducted, quotaRows, usage] = await Promise.all([
    loadLeaveTypes(db),
    jointDeductionOf(db, emp, year),
    db.select().from(leave_quotas).where(and(eq(leave_quotas.employee_id, employeeId), eq(leave_quotas.year, year))),
    db
      .select({
        type: leave_requests.leave_type,
        status: leave_requests.status,
        days: sql<number>`coalesce(sum(${leave_requests.total_days}), 0)`,
      })
      .from(leave_requests)
      .where(and(
        eq(leave_requests.employee_id, employeeId),
        gte(leave_requests.start_date, `${year}-01-01`),
        lte(leave_requests.start_date, `${year}-12-31`),
        inArray(leave_requests.status, ACTIVE_STATUSES),
      ))
      .groupBy(leave_requests.leave_type, leave_requests.status),
  ]);
  const all = computeBalances(
    types,
    new Map(quotaRows.map((r) => [r.leave_type, r.quota])),
    usage.map((u) => ({ type: u.type, status: u.status as LeaveStatus, days: Number(u.days) })),
    jointDeducted,
  );
  // Ganti Hari: kuota = dasar + kredit overtime (dengan masa berlaku), sisa dinilai pada tanggal acuan.
  const compType = types.find((t) => t.key === LEAVE_KEYS.compensation);
  const compIdx = all.findIndex((b) => b.type === LEAVE_KEYS.compensation);
  if (compType && compIdx >= 0) {
    const defaultQuota = all[compIdx]!.explicit ? all[compIdx]!.quota : compType.defaultQuota;
    const comp = await compensationFor(db, employeeId, year, asOf, defaultQuota);
    if (comp) {
      const b = all[compIdx]!;
      all[compIdx] = { ...b, quota: comp.quota, overtimeCredit: comp.overtimeCredit, expired: comp.expired, shortfall: comp.shortfall, remaining: comp.remaining };
    }
  }
  const visible = new Set(types.filter((t) => t.active && leaveTypeAllowsStatus(t, emp?.status)).map((t) => t.key));
  return all.filter((b) => visible.has(b.type) || b.used + b.pending + b.jointDeducted > 0);
}

/** Id semua admin aktif (termasuk super admin). */
export async function adminRecipientIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: employees.id }).from(employees)
    .where(and(eq(employees.active, true), inArray(employees.role, ['admin', 'super_admin'])));
  return rows.map((r) => r.id);
}

/** Satu baris per (penerima, jenis, pengajuan); di-chunk karena D1 membatasi jumlah parameter per pernyataan. */
export function notifyStmts(db: Db, items: NotifyInput[]) {
  const seen = new Set<string>();
  const now = new Date().toISOString();
  const rows: (typeof notifications.$inferInsert)[] = [];
  for (const i of items) {
    const key = `${i.employeeId}|${i.type}|${i.entityId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      id: crypto.randomUUID(), employee_id: i.employeeId, type: i.type, title: i.title,
      body: i.body ?? null, href: i.href ?? null, entity_id: i.entityId ?? null, created_at: now,
    });
  }
  const stmts = [];
  for (let n = 0; n < rows.length; n += 10) stmts.push(db.insert(notifications).values(rows.slice(n, n + 10)));
  return stmts;
}

/**
 * Tandai selesai notifikasi "perlu aksi" untuk satu pengajuan. `exceptEmployeeId`: penerima yang dikecualikan
 * (pengaju, yang notifikasinya hanya pemberitahuan). Letakkan SEBELUM notifyStmts agar notifikasi baru tidak ikut tertandai.
 */
export function resolveStmt(db: Db, entityId: string, opts: { exceptEmployeeId?: string } = {}) {
  return db.update(notifications).set({ read_at: new Date().toISOString() }).where(and(
    eq(notifications.entity_id, entityId),
    isNull(notifications.read_at),
    inArray(notifications.type, ACTIONABLE_TYPES),
    opts.exceptEmployeeId ? ne(notifications.employee_id, opts.exceptEmployeeId) : undefined,
  ));
}
