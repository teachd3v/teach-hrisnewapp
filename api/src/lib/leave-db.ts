// Akses database untuk fitur cuti: saldo, hari libur, daftar admin, dan penulisan notifikasi.
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, between, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import {
  ACTIONABLE_TYPES,
  ACTIVE_STATUSES,
  computeBalances,
  jointLeaveDeduction,
  type LeaveBalance,
  type LeaveStatus,
  type NotifyInput,
} from '@hris/shared';
import { employees, holidays, leave_quotas, leave_requests, notifications } from '../db/schema';
import { loadJointLeaveSettings } from './settings';

export type Db = DrizzleD1Database;

export async function loadHolidayDates(db: Db, start: string, end: string): Promise<Set<string>> {
  const rows = await db.select({ date: holidays.date }).from(holidays).where(between(holidays.date, start, end));
  return new Set(rows.map((r) => r.date));
}

/** Potongan cuti bersama untuk satu karyawan pada satu tahun; 0 bila pengaturan mati atau statusnya dikecualikan. */
async function jointDeductionOf(db: Db, employeeId: string, year: number): Promise<number> {
  const settings = await loadJointLeaveSettings(db);
  if (!settings.enabled) return 0;
  const [emp] = await db.select({ join_date: employees.join_date, status: employees.employment_status_id })
    .from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!emp || (emp.status && settings.exemptStatusIds.includes(emp.status))) return 0;
  const joint = await db.select({ date: holidays.date, type: holidays.type }).from(holidays)
    .where(and(between(holidays.date, `${year}-01-01`, `${year}-12-31`), eq(holidays.type, 'JOINT')));
  return jointLeaveDeduction(joint, emp.join_date, year);
}

export async function getBalances(db: Db, employeeId: string, year: number): Promise<LeaveBalance[]> {
  const [jointDeducted, quotaRows, usage] = await Promise.all([
    jointDeductionOf(db, employeeId, year),
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
  return computeBalances(
    new Map(quotaRows.map((r) => [r.leave_type, r.quota])),
    usage.map((u) => ({ type: u.type, status: u.status as LeaveStatus, days: Number(u.days) })),
    jointDeducted,
  );
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
