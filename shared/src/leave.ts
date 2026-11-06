// Aturan cuti yang dipakai bersama oleh klien (form) dan server (validasi).
// Jenis cuti dikelola super admin di Data master (tabel leave_types); `key` adalah pengenal tetap yang disimpan di pengajuan dan kuota.

/** Pengenal tetap sebuah jenis cuti. Jenis bawaan memakai nama lama ('Cuti Tahunan', ...); jenis baru memakai UUID. */
export type LeaveCategory = string;

export interface LeaveTypeMeta {
  key: LeaveCategory;
  /** nama yang ditampilkan (dapat diubah) */
  label: string;
  description: string;
  /** kuota bawaan per tahun; null = tanpa batas */
  defaultQuota: number | null;
  requiresAttachment: boolean;
  /** izin per jam: satu tanggal + jam mulai/selesai, dihitung 1 hari kerja */
  timeBased: boolean;
  gender: 'Laki-laki' | 'Perempuan' | null;
  /** id master status kepegawaian yang boleh mengajukan; null = semua status */
  allowedStatusIds: string[] | null;
  active: boolean;
  /** jenis bawaan sistem: tidak dapat dihapus; perilaku tertentu (presensi, laporan, potongan cuti bersama) bergantung padanya */
  system: boolean;
  sortOrder: number;
}

/** Pengenal jenis bawaan yang perilakunya dipakai di bagian lain (presensi, pengingat, laporan, potongan cuti bersama). */
export const LEAVE_KEYS = {
  annual: 'Cuti Tahunan',
  sick: 'Sakit',
  duty: 'Dinas Luar Kota',
  lateIn: 'Izin Terlambat',
  earlyOut: 'Izin Pulang Cepat',
} as const;

export const GENDERS = ['Laki-laki', 'Perempuan'] as const;

/** Apakah karyawan berstatus `statusId` boleh mengajukan jenis ini? Jenis tanpa batasan status terbuka untuk semua, termasuk yang statusnya kosong. */
export const leaveTypeAllowsStatus = (t: Pick<LeaveTypeMeta, 'allowedStatusIds'>, statusId: string | null | undefined) =>
  !t.allowedStatusIds || (Boolean(statusId) && t.allowedStatusIds.includes(statusId!));

/** Kuota bawaan/khusus: 0-366 hari, kelipatan 0,5. */
export const isValidQuota = (q: unknown): q is number =>
  typeof q === 'number' && Number.isFinite(q) && q >= 0 && q <= 366 && q * 2 === Math.round(q * 2);

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(s: string): Date | null {
  if (!ISO_DATE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

export type HolidayDates = ReadonlySet<string>;

export const HOLIDAY_TYPES = [
  { key: 'NATIONAL', label: 'Libur Nasional' },
  { key: 'JOINT', label: 'Cuti Bersama' },
] as const;

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
/** Hari non-kerja: Sabtu, Minggu, atau tanggal yang terdaftar sebagai hari libur. */
const isOffDay = (d: Date, holidays?: HolidayDates) => isWeekend(d) || (holidays?.has(isoOf(d)) ?? false);

/** Durasi dalam hari kerja: Senin-Jumat di luar hari libur. Izin jam-jaman (`timeBased`) = 1 (satu tanggal kerja). */
export function calculateLeaveDuration(timeBased: boolean, start: string, end: string, holidays?: HolidayDates): number {
  const s = parseIsoDate(start);
  const e = parseIsoDate(end);
  if (!s || !e || s > e) return 0;

  if (timeBased) {
    // Izin per jam: hanya satu tanggal, dan harus hari kerja
    return s.getTime() === e.getTime() && !isOffDay(s, holidays) ? 1 : 0;
  }

  let days = 0;
  for (const d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!isOffDay(d, holidays)) days++;
  }
  return days;
}

/** Validasi tanggal pengajuan; mengembalikan pesan error atau null. Dipakai klien dan server. */
export function validateLeaveDates(meta: Pick<LeaveTypeMeta, 'timeBased' | 'label'>, start: string, end: string, holidays?: HolidayDates): string | null {
  const s = parseIsoDate(start);
  const e = parseIsoDate(end);
  if (!s || !e) return 'Format tanggal tidak valid';
  if (e < s) return 'Tanggal akhir harus setelah atau sama dengan tanggal mulai';

  if (meta.timeBased) {
    if (start !== end) return `${meta.label} hanya dapat diajukan untuk satu tanggal`;
    if (isWeekend(s)) return `${meta.label} tidak dapat diajukan pada hari Sabtu atau Minggu`;
    if (isOffDay(s, holidays)) return `${meta.label} tidak dapat diajukan pada hari libur`;
    return null;
  }
  if (calculateLeaveDuration(false, start, end, holidays) <= 0) {
    return 'Rentang tanggal hanya berisi Sabtu/Minggu atau hari libur. Pilih tanggal yang mencakup hari kerja';
  }
  return null;
}

/** Hari libur yang jatuh di hari kerja pada rentang ini (untuk keterangan di form). */
export function holidaysInRange(start: string, end: string, holidays: ReadonlyMap<string, { name: string }>) {
  const s = parseIsoDate(start);
  const e = parseIsoDate(end);
  if (!s || !e || s > e) return [];
  const out: { date: string; name: string }[] = [];
  for (const d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const h = holidays.get(isoOf(d));
    if (h && !isWeekend(d)) out.push({ date: isoOf(d), name: h.name });
  }
  return out;
}
