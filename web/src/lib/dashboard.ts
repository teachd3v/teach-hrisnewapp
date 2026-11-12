import { useQuery } from '@tanstack/react-query';
import type { AnniversaryItem, BirthdayItem, DaySnapshot, LsaItem, MonthSummary } from '@hris/shared';
import { api } from './api';

export interface PeopleMoments {
  month: string;
  today: string;
  birthdays: BirthdayItem[];
  anniversaries: AnniversaryItem[];
  lsa: LsaItem[];
  missing: { birthDate: number; joinDate: number };
  total: number;
}

/** Tanggal hari ini (WIB) dari jam perangkat; hanya untuk batas pilihan tanggal, angka resmi dihitung server. */
export const wibToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export const useDayAttendance = (date: string) =>
  useQuery({ queryKey: ['dash-day', date], queryFn: () => api<DaySnapshot>(`/dashboard/attendance?mode=day&date=${date}`), staleTime: 30_000, refetchInterval: date === wibToday() ? 60_000 : false });

export const useMonthAttendance = (month: string) =>
  useQuery({ queryKey: ['dash-month', month], queryFn: () => api<MonthSummary>(`/dashboard/attendance?mode=month&month=${month}`), staleTime: 60_000 });

export const usePeopleMoments = () =>
  useQuery({ queryKey: ['dash-people'], queryFn: () => api<PeopleMoments>('/dashboard/people'), staleTime: 5 * 60_000 });

const ID_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const monthLabel = (ym: string) => `${ID_MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
/** "12 Nov" dari YYYY-MM-DD (tanpa tahun). */
export const dayMonth = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
/** "Kam, 12 Nov 2026". */
export const dayLabel = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const shiftDay = (ymd: string, n: number) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const shiftMonth = (ym: string, n: number) => { const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
