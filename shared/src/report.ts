// Bentuk data rekap presensi + cuti untuk rentang tanggal bebas (API -> klien -> berkas Excel). Aturan hitung ada di api/src/lib/report.ts.

export interface ReportSummaryRow {
  employeeId: string;
  name: string;
  department: string;
  level: string;
  /** hari kerja (Sen-Jum di luar libur) sejak masuk kerja sampai tanggal batas */
  workdays: number;
  /** hari ada presensi masuk (termasuk akhir pekan/libur) */
  present: number;
  /** hari kerja tanpa presensi dan tanpa cuti/izin sehari penuh yang disetujui */
  absent: number;
  lateDays: number;
  lateMinutes: number;
  /** terlambat tetapi izin keterlambatan disetujui */
  lateExcusedDays: number;
  /** presensi masuk tanpa pulang (hari yang sudah lewat) */
  noClockOut: number;
  corrected: number;
  outsideOffice: number;
  noLocation: number;
  workMinutes: number;
  leaveAnnual: number;
  leaveSick: number;
  leaveDuty: number;
  leaveOther: number;
  izinLateCount: number;
  izinEarlyCount: number;
  /** total menit lembur yang disetujui pada rentang ini */
  overtimeMinutes: number;
  /** jumlah hari Kerja di Hari Libur yang disetujui pada rentang ini */
  holidayWorkDays: number;
}

export interface ReportDailyRow {
  date: string;
  dayName: string;
  employeeId: string;
  name: string;
  department: string;
  clockIn: string | null; // HH:MM WIB
  clockOut: string | null;
  duration: string | null; // "7j 32m"
  lateMinutes: number;
  /** "Tepat waktu" | "Terlambat" | "Terlambat (izin disetujui)" | "" */
  lateStatus: string;
  /** "Tidak hadir", "Cuti: ...", "Libur: ...", "Akhir pekan" atau "" */
  note: string;
  corrected: string; // "Masuk", "Pulang", "Masuk & pulang" atau ""
  locationIn: string;
  locationOut: string;
}

/** Rentang rekap paling lebar (hari), agar berkas dan waktu hitung tetap wajar. */
export const REPORT_MAX_DAYS = 92;
export const REPORT_MIN_DATE = '2024-01-01';

export interface AttendanceReport {
  from: string; // YYYY-MM-DD
  to: string;
  /** tanggal terakhir yang dihitung untuk "tidak hadir" (maksimal kemarin; hari ini belum selesai) */
  cutoff: string;
  departmentName: string | null;
  /** aturan jam masuk yang berlaku pada rentang ini (teks, bisa berisi perubahan di tengah rentang) */
  lateRule: string;
  summary: ReportSummaryRow[];
  daily: ReportDailyRow[];
}
