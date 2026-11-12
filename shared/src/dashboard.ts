// Bentuk data dashboard Beranda admin (API -> klien). Aturan hitung ada di api/src/lib/dashboard.ts.

export interface DayPerson { id: string; name: string; department: string }
export interface DaySnapshot {
  mode: 'day';
  date: string;
  isToday: boolean;
  /** nama hari libur / "Akhir pekan" / null (hari kerja) */
  dayOff: string | null;
  totals: {
    /** yang seharusnya hadir: hadir + belum presensi + tidak hadir (tanpa yang cuti/izin sehari penuh) */
    expected: number;
    present: number;
    onTime: number;
    late: number;
    lateExcused: number;
    /** hanya hari ini: belum presensi (hari belum selesai) */
    notYet: number;
    /** hari lampau: tanpa presensi dan tanpa cuti/izin sehari penuh */
    absent: number;
    onLeave: number;
    /** hari lampau: presensi masuk tanpa pulang */
    noClockOut: number;
  };
  late: (DayPerson & { clockIn: string; lateMinutes: number; excused: boolean })[];
  notYet: DayPerson[];
  absent: DayPerson[];
  onLeave: (DayPerson & { type: string })[];
}

export interface MonthSummary {
  mode: 'month';
  month: string;
  from: string;
  /** tanggal terakhir yang dihitung (maksimal kemarin; hari ini belum selesai) */
  through: string;
  totals: {
    employees: number;
    /** hari hadir pada hari kerja (sampai `through`) */
    present: number;
    /** hari kerja tanpa presensi dan tanpa cuti/izin sehari penuh */
    absent: number;
    leaveDays: number;
    lateDays: number;
    lateExcusedDays: number;
    lateMinutes: number;
    noClockOut: number;
    /** hadir / (hadir + tidak hadir); null bila belum ada hari kerja yang dihitung */
    rate: number | null;
  };
  topLate: { id: string; name: string; department: string; lateDays: number; lateMinutes: number }[];
  topAbsent: { id: string; name: string; department: string; absent: number }[];
}

