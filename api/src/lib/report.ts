// Rekap presensi + cuti untuk rentang tanggal. Memakai aturan yang sama dengan layar (jam masuk 09:00, izin terlambat, hari libur, koreksi),
// jadi angka di Excel konsisten dengan yang dilihat HC di aplikasi.
import { and, between, eq, gte, inArray, lte } from 'drizzle-orm';
import {
  LEAVE_TYPES, calculateLeaveDuration, isOutsideOffice, isWeekendDate, lateMinutes, wibSecondsOfDay, workDuration,
  type AttendanceReport, type ReportDailyRow, type ReportSummaryRow,
} from '@hris/shared';
import { attendances, employees, holidays, leave_requests, master_options } from '../db/schema';
import type { Db } from './leave-db';

const TIME_BASED = new Set<string>(LEAVE_TYPES.filter((t) => t.timeBased).map((t) => t.key));
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (iso: string) => { const s = wibSecondsOfDay(iso); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}`; };
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

function datesOf(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${first}T00:00:00Z`); d <= new Date(`${last}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

const locText = (distance: number | null | undefined, hasPunch: boolean, corrected: boolean) =>
  !hasPunch ? '' : corrected ? 'Dikoreksi (tanpa lokasi)' : distance == null ? 'Tanpa lokasi' : isOutsideOffice(distance) ? `Di luar kantor (${km(distance)})` : 'Di area kantor';

export async function buildReport(db: Db, first: string, last: string, departmentId: string | null, today: string): Promise<AttendanceReport> {
  const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  const cutoff = yesterday < last ? yesterday : last;
  const days = datesOf(first, last);

  const [opts, emps, attRows, leaves, hols] = await Promise.all([
    db.select().from(master_options),
    db.select().from(employees),
    db.select().from(attendances).where(and(gte(attendances.date, first), lte(attendances.date, last))),
    db.select().from(leave_requests).where(and(eq(leave_requests.status, 'approved'), lte(leave_requests.start_date, last), gte(leave_requests.end_date, first))),
    db.select().from(holidays).where(between(holidays.date, first, last)),
  ]);
  const name = new Map(opts.map((o) => [o.id, o.name]));
  const holiday = new Map(hols.map((h) => [h.date, h.name]));
  const holidaySet = new Set(holiday.keys());
  const att = new Map(attRows.map((r) => [`${r.employee_id}|${r.date}`, r]));
  const hasAtt = new Set(attRows.map((r) => r.employee_id));

  const list = emps
    .filter((e) => (e.active || hasAtt.has(e.id)) && (!departmentId || e.department_id === departmentId))
    .sort((a, b) => a.name.localeCompare(b.name));

  const summary: ReportSummaryRow[] = [];
  const daily: ReportDailyRow[] = [];

  for (const e of list) {
    const myLeaves = leaves.filter((l) => l.employee_id === e.id);
    const s: ReportSummaryRow = {
      employeeId: e.id, name: e.name, department: name.get(e.department_id ?? '') ?? '', level: name.get(e.level_id ?? '') ?? '',
      workdays: 0, present: 0, absent: 0, lateDays: 0, lateMinutes: 0, lateExcusedDays: 0, noClockOut: 0, corrected: 0, outsideOffice: 0, noLocation: 0,
      workMinutes: 0, leaveAnnual: 0, leaveSick: 0, leaveDuty: 0, leaveOther: 0, izinLateCount: 0, izinEarlyCount: 0,
    };

    // Cuti disetujui yang jatuh di rentang ini (hari kerja), dikelompokkan per jenis.
    for (const l of myLeaves) {
      const clipFrom = l.start_date > first ? l.start_date : first;
      const clipTo = l.end_date < last ? l.end_date : last;
      if (l.leave_type === 'Izin Terlambat') { s.izinLateCount += 1; continue; }
      if (l.leave_type === 'Izin Pulang Cepat') { s.izinEarlyCount += 1; continue; }
      const n = calculateLeaveDuration(l.leave_type as never, clipFrom, clipTo, holidaySet);
      if (l.leave_type === 'Cuti Tahunan') s.leaveAnnual += n;
      else if (l.leave_type === 'Sakit') s.leaveSick += n;
      else if (l.leave_type === 'Dinas Luar Kota') s.leaveDuty += n;
      else s.leaveOther += n;
    }

    for (const date of days) {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      const hol = holiday.get(date);
      const weekend = isWeekendDate(date);
      const workday = !weekend && !hol;
      const joined = !e.join_date || e.join_date <= date;
      const fullLeave = myLeaves.find((l) => !TIME_BASED.has(l.leave_type) && l.start_date <= date && l.end_date >= date);
      const excused = myLeaves.some((l) => l.leave_type === 'Izin Terlambat' && l.start_date <= date && l.end_date >= date);
      const row = att.get(`${e.id}|${date}`);
      const dayNote = hol ? `Libur: ${hol}` : weekend ? 'Akhir pekan' : '';

      if (workday && joined && date <= cutoff) s.workdays += 1;

      if (row?.clock_in) {
        s.present += 1;
        // Batas 09:00 hanya berlaku di hari kerja; akhir pekan/libur tidak dihitung terlambat.
        const late = workday ? lateMinutes(row.clock_in) : 0;
        if (late > 0 && excused) s.lateExcusedDays += 1;
        else if (late > 0) { s.lateDays += 1; s.lateMinutes += late; }
        if (!row.clock_out && date <= cutoff) s.noClockOut += 1;
        if (row.clock_in_corrected || row.clock_out_corrected) s.corrected += 1;
        if (isOutsideOffice(row.clock_in_distance)) s.outsideOffice += 1;
        if (!row.clock_in_corrected && row.clock_in_distance == null) s.noLocation += 1;
        if (row.clock_out) s.workMinutes += Math.max(0, Math.round((new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 60_000));

        const corr = row.clock_in_corrected && row.clock_out_corrected ? 'Masuk & pulang' : row.clock_out_corrected ? 'Pulang' : row.clock_in_corrected ? 'Masuk' : '';
        daily.push({
          date, dayName: DAY_NAMES[dow]!, employeeId: e.id, name: e.name, department: s.department,
          clockIn: hhmm(row.clock_in), clockOut: row.clock_out ? hhmm(row.clock_out) : null, duration: workDuration(row.clock_in, row.clock_out),
          lateMinutes: late, lateStatus: !workday ? '' : late > 0 ? (excused ? 'Terlambat (izin disetujui)' : 'Terlambat') : 'Tepat waktu',
          note: [dayNote, fullLeave ? `Disetujui: ${fullLeave.leave_type}` : ''].filter(Boolean).join('; '), corrected: corr,
          locationIn: locText(row.clock_in_distance, true, row.clock_in_corrected), locationOut: locText(row.clock_out_distance, Boolean(row.clock_out), row.clock_out_corrected),
        });
      } else if (workday && joined && date <= cutoff) {
        if (fullLeave) {
          daily.push({ date, dayName: DAY_NAMES[dow]!, employeeId: e.id, name: e.name, department: s.department, clockIn: null, clockOut: null, duration: null, lateMinutes: 0, lateStatus: '', note: `Cuti/izin: ${fullLeave.leave_type}`, corrected: '', locationIn: '', locationOut: '' });
        } else {
          s.absent += 1;
          daily.push({ date, dayName: DAY_NAMES[dow]!, employeeId: e.id, name: e.name, department: s.department, clockIn: null, clockOut: null, duration: null, lateMinutes: 0, lateStatus: '', note: 'Tidak hadir', corrected: '', locationIn: '', locationOut: '' });
        }
      }
    }
    summary.push(s);
  }

  daily.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return { from: first, to: last, cutoff, departmentName: departmentId ? name.get(departmentId) ?? null : null, summary, daily };
}

/** Dipakai untuk memastikan id departemen yang diminta benar-benar ada. */
export async function departmentExists(db: Db, id: string): Promise<boolean> {
  const r = await db.select({ id: master_options.id }).from(master_options).where(and(eq(master_options.id, id), inArray(master_options.kind, ['department']))).limit(1);
  return r.length > 0;
}
