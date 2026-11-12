import { useQueries } from '@tanstack/react-query';
import { api } from './api';
import type { AttendanceRec, Tone } from './attendance-types';

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Tanggal hari ini menurut WIB (YYYY-MM-DD). */
export const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);

export const WEEKDAY_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'] as const;

/** Senin sampai Jumat pekan yang memuat `d` (Sabtu/Minggu dianggap bagian dari pekan yang baru berakhir). */
export function workWeek(d: string): string[] {
  const dow = new Date(toMs(d)).getUTCDay(); // 0 = Minggu
  const mon = addDays(d, -(dow === 0 ? 6 : dow - 1));
  return [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
}

/** Penanda satu hari dari data presensi; hari tanpa presensi tidak diberi penanda (tidak diketahui apakah libur, izin, atau tidak hadir). */
export function dotFor(rec: AttendanceRec | undefined): Tone | null {
  if (!rec?.clock_in) return null;
  const f = rec.flags;
  if (f.lateExcused || f.leaveType) return 'info';
  return f.lateMinutes > 0 ? 'warn' : 'ok';
}

/** Presensi saya untuk daftar tanggal (satu permintaan per bulan yang tersentuh; berbagi cache dengan daftar bulanan). */
export function useRecordsByDate(dates: string[]) {
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
  const results = useQueries({ queries: months.map((m) => ({ queryKey: ['att-mine', m], queryFn: () => api<AttendanceRec[]>(`/attendance/mine?month=${m}`) })) });
  const byDate = new Map<string, AttendanceRec>();
  for (const r of results) for (const rec of r.data ?? []) byDate.set(rec.date, rec);
  return { byDate, all: [...byDate.values()], pending: results.some((r) => r.isPending) };
}
