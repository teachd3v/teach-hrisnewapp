// Ringkasan untuk dashboard Beranda admin. Memakai aturan yang sama dengan Rekap Excel (jam masuk berefektif-tanggal, izin terlambat,
// hari libur, cuti sehari penuh), supaya angka di Beranda tidak bertentangan dengan Excel. Tidak diaudit tiap muat (hanya agregat dan nama).
import { and, eq, gte, lte } from 'drizzle-orm';
import { LEAVE_KEYS, isWeekendDate, lateMinutes, wibSecondsOfDay, type AttendanceReport, type DayPerson, type DaySnapshot, type MonthSummary } from '@hris/shared';
import { attendances, employees, holidays, leave_requests, master_options } from '../db/schema';
import type { Db } from './leave-db';
import { loadPolicies } from './attendance-policy';
import { loadLeaveTypes, timeBasedKeys } from './leave-types';
import { buildReport } from './report';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (iso: string) => { const s = wibSecondsOfDay(iso); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}`; };

/** Keadaan kehadiran satu tanggal (WIB). `date` harus <= `today`. */
export async function buildDaySnapshot(db: Db, date: string, today: string): Promise<DaySnapshot> {
  const [policies, types, opts, emps, attRows, leaves, hols] = await Promise.all([
    loadPolicies(db),
    loadLeaveTypes(db),
    db.select().from(master_options),
    db.select().from(employees),
    db.select().from(attendances).where(eq(attendances.date, date)),
    db.select().from(leave_requests).where(and(eq(leave_requests.status, 'approved'), lte(leave_requests.start_date, date), gte(leave_requests.end_date, date))),
    db.select().from(holidays).where(eq(holidays.date, date)),
  ]);
  const timeBased = timeBasedKeys(types);
  const dept = new Map(opts.map((o) => [o.id, o.name]));
  const att = new Map(attRows.map((r) => [r.employee_id, r]));
  const holiday = hols[0]?.name ?? null;
  const weekend = isWeekendDate(date);
  const workday = !weekend && !holiday;
  const isToday = date === today;

  const out: DaySnapshot = {
    mode: 'day', date, isToday, dayOff: holiday ? `Libur: ${holiday}` : weekend ? 'Akhir pekan' : null,
    totals: { expected: 0, present: 0, onTime: 0, late: 0, lateExcused: 0, notYet: 0, absent: 0, onLeave: 0, noClockOut: 0 },
    late: [], notYet: [], absent: [], onLeave: [],
  };
  const people = emps.filter((e) => e.active || att.has(e.id)).sort((a, b) => a.name.localeCompare(b.name));
  for (const e of people) {
    const who: DayPerson = { id: e.id, name: e.name, department: dept.get(e.department_id ?? '') ?? '' };
    const joined = !e.join_date || e.join_date <= date;
    const mine = leaves.filter((l) => l.employee_id === e.id);
    const fullLeave = mine.find((l) => !timeBased.has(l.leave_type));
    const excused = mine.some((l) => l.leave_type === LEAVE_KEYS.lateIn);
    const row = att.get(e.id);

    if (row?.clock_in) {
      out.totals.present += 1;
      const late = workday ? lateMinutes(row.clock_in, policies) : 0;
      if (late > 0 && excused) { out.totals.lateExcused += 1; out.late.push({ ...who, clockIn: hhmm(row.clock_in), lateMinutes: late, excused: true }); }
      else if (late > 0) { out.totals.late += 1; out.late.push({ ...who, clockIn: hhmm(row.clock_in), lateMinutes: late, excused: false }); }
      else out.totals.onTime += 1;
      if (!row.clock_out && !isToday) out.totals.noClockOut += 1;
    } else if (workday && joined) {
      if (fullLeave) { out.totals.onLeave += 1; out.onLeave.push({ ...who, type: fullLeave.leave_type }); }
      else if (isToday) { out.totals.notYet += 1; out.notYet.push(who); }
      else { out.totals.absent += 1; out.absent.push(who); }
    }
  }
  // "Seharusnya hadir": yang hadir pada hari kerja, ditambah yang belum presensi/tidak hadir (cuti/izin sehari penuh tidak dihitung).
  out.totals.expected = workday ? out.totals.present + out.totals.notYet + out.totals.absent : 0;
  out.late.sort((a, b) => b.lateMinutes - a.lateMinutes);
  return out;
}

/** Ringkasan bulanan dari hasil `buildReport` yang sama dengan Rekap Excel. `last` <= hari ini. */
export async function buildMonthSummary(db: Db, month: string, last: string, today: string): Promise<MonthSummary> {
  const from = `${month}-01`;
  const report: AttendanceReport = await buildReport(db, from, last, null, today);
  const cutoff = report.cutoff;
  const sum = <K extends keyof (typeof report.summary)[number]>(k: K) => report.summary.reduce((t, r) => t + (r[k] as number), 0);
  // Hadir pada hari kerja (lateStatus kosong = bukan hari kerja) dan cuti/izin sehari penuh; hanya sampai cutoff agar sebanding dengan "tidak hadir".
  const present = report.daily.filter((d) => d.date <= cutoff && d.clockIn !== null && d.lateStatus !== '').length;
  const leaveDays = report.daily.filter((d) => d.date <= cutoff && d.clockIn === null && d.note.startsWith('Cuti/izin:')).length;
  const absent = sum('absent');
  return {
    mode: 'month', month, from, through: cutoff,
    totals: {
      employees: report.summary.length, present, absent, leaveDays, lateDays: sum('lateDays'), lateExcusedDays: sum('lateExcusedDays'),
      lateMinutes: sum('lateMinutes'), noClockOut: sum('noClockOut'), rate: present + absent > 0 ? present / (present + absent) : null,
    },
    topLate: report.summary.filter((r) => r.lateDays > 0).sort((a, b) => b.lateDays - a.lateDays || b.lateMinutes - a.lateMinutes).slice(0, 5)
      .map((r) => ({ id: r.employeeId, name: r.name, department: r.department, lateDays: r.lateDays, lateMinutes: r.lateMinutes })),
    topAbsent: report.summary.filter((r) => r.absent > 0).sort((a, b) => b.absent - a.absent).slice(0, 5)
      .map((r) => ({ id: r.employeeId, name: r.name, department: r.department, absent: r.absent })),
  };
}
