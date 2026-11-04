// Aturan cuti yang dipakai bersama oleh klien (form) dan server (validasi).
export type LeaveCategory =
  | 'Cuti Tahunan'
  | 'Cuti Ayah'
  | 'Cuti Berkabung'
  | 'Cuti Melahirkan'
  | 'Cuti Pernikahan'
  | 'Cuti Unpaid'
  | 'Sakit'
  | 'Ganti Hari'
  | 'Izin Terlambat'
  | 'Izin Pulang Cepat'
  | 'Dinas Luar Kota';

export const LEAVE_TYPES: {
  key: LeaveCategory;
  label: string;
  desc: string;
  requiresAttachment?: boolean;
  timeBased?: boolean;
  gender?: 'Laki-laki' | 'Perempuan';
}[] = [
  { key: 'Cuti Tahunan', label: 'Cuti Tahunan', desc: 'Mengurangi jatah cuti tahunan reguler.' },
  { key: 'Cuti Ayah', label: 'Cuti Ayah', desc: 'Khusus karyawan laki-laki untuk kelahiran anak.', gender: 'Laki-laki' },
  { key: 'Cuti Berkabung', label: 'Cuti Berkabung', desc: 'Untuk duka cita keluarga inti wafat.' },
  { key: 'Cuti Melahirkan', label: 'Cuti Melahirkan', desc: 'Khusus karyawan perempuan.', gender: 'Perempuan' },
  { key: 'Cuti Pernikahan', label: 'Cuti Pernikahan', desc: 'Untuk hari pernikahan karyawan.' },
  { key: 'Cuti Unpaid', label: 'Cuti Diluar Tanggungan (Unpaid)', desc: 'Tidak memotong kuota tahunan, gaji dipotong.' },
  { key: 'Sakit', label: 'Izin Sakit', desc: 'Memerlukan surat keterangan dokter.', requiresAttachment: true },
  { key: 'Ganti Hari', label: 'Ganti Hari', desc: 'Mengambil kompensasi dari masuk di hari libur.' },
  { key: 'Izin Terlambat', label: 'Izin Keterlambatan masuk', desc: 'Memerlukan detail jam estimasi kehadiran.', timeBased: true },
  { key: 'Izin Pulang Cepat', label: 'Izin Pulang Cepat', desc: 'Memerlukan detail jam estimasi pulang.', timeBased: true },
  { key: 'Dinas Luar Kota', label: 'Dinas Luar Kota / SPD', desc: 'Perjalanan dinas resmi luar kota.' },
];

export const LEAVE_TYPE_KEYS = LEAVE_TYPES.map((t) => t.key);

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

/** Durasi dalam hari kerja: Senin-Jumat di luar hari libur. Izin jam-jaman = 1 (satu tanggal kerja). */
export function calculateLeaveDuration(type: LeaveCategory, start: string, end: string, holidays?: HolidayDates): number {
  const s = parseIsoDate(start);
  const e = parseIsoDate(end);
  if (!s || !e || s > e) return 0;

  if (type === 'Izin Terlambat' || type === 'Izin Pulang Cepat') {
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
export function validateLeaveDates(type: LeaveCategory, start: string, end: string, holidays?: HolidayDates): string | null {
  const s = parseIsoDate(start);
  const e = parseIsoDate(end);
  if (!s || !e) return 'Format tanggal tidak valid';
  if (e < s) return 'Tanggal akhir harus setelah atau sama dengan tanggal mulai';

  const meta = LEAVE_TYPES.find((t) => t.key === type);
  if (meta?.timeBased) {
    if (start !== end) return `${meta.label} hanya dapat diajukan untuk satu tanggal`;
    if (isWeekend(s)) return `${meta.label} tidak dapat diajukan pada hari Sabtu atau Minggu`;
    if (isOffDay(s, holidays)) return `${meta.label} tidak dapat diajukan pada hari libur`;
    return null;
  }
  if (calculateLeaveDuration(type, start, end, holidays) <= 0) {
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
