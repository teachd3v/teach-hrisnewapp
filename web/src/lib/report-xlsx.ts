import type { AttendanceReport } from '@hris/shared';
import { fmtLongDate } from './attendance-types';
import { buildXlsx, downloadXlsx } from './xlsx';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Susun berkas Excel (lembar Ringkasan per karyawan + lembar Rincian per hari) dari data rekap. */
export function reportToXlsx(rep: AttendanceReport): Uint8Array {
  const periode = rep.from === rep.to ? fmtLongDate(rep.from) : `${fmtLongDate(rep.from)} s.d. ${fmtLongDate(rep.to)}`;
  const preface = [
    'Rekap presensi dan cuti',
    `Periode: ${periode}`,
    `Departemen: ${rep.departmentName ?? 'Semua'}`,
    `Hari kerja dihitung sampai ${fmtLongDate(rep.cutoff)} (hari ini belum dihitung sebagai tidak hadir).`,
    `Aturan: ${rep.lateRule}; terlambat berizin = ada Izin Keterlambatan yang disetujui; hari kerja = Senin-Jumat di luar hari libur.`,
  ];

  const summary = {
    name: 'Ringkasan', preface,
    header: ['Nama', 'Departemen', 'Level', 'Hari kerja', 'Hadir', 'Tidak hadir', 'Terlambat (hari)', 'Total menit terlambat', 'Terlambat berizin (hari)', 'Belum pulang (hari)', 'Dikoreksi (hari)', 'Di luar kantor (hari)', 'Tanpa lokasi (hari)', 'Total jam kerja', 'Cuti Tahunan (hari)', 'Sakit (hari)', 'Dinas Luar Kota (hari)', 'Cuti lainnya (hari)', 'Izin terlambat (kali)', 'Izin pulang cepat (kali)'],
    rows: rep.summary.map((s) => [s.name, s.department, s.level, s.workdays, s.present, s.absent, s.lateDays, s.lateMinutes, s.lateExcusedDays, s.noClockOut, s.corrected, s.outsideOffice, s.noLocation, r2(s.workMinutes / 60), s.leaveAnnual, s.leaveSick, s.leaveDuty, s.leaveOther, s.izinLateCount, s.izinEarlyCount]),
    widths: [26, 16, 14, 11, 8, 12, 16, 20, 22, 18, 16, 20, 18, 14, 18, 12, 22, 18, 20, 22],
  };

  const detail = {
    name: 'Rincian',
    header: ['Tanggal', 'Hari', 'Nama', 'Departemen', 'Masuk', 'Pulang', 'Durasi', 'Menit terlambat', 'Status masuk', 'Keterangan', 'Dikoreksi', 'Lokasi masuk', 'Lokasi pulang'],
    rows: rep.daily.map((d) => [d.date, d.dayName, d.name, d.department, d.clockIn ?? '', d.clockOut ?? '', d.duration ?? '', d.lateMinutes || 0, d.lateStatus, d.note, d.corrected, d.locationIn, d.locationOut]),
    widths: [12, 10, 26, 16, 8, 8, 10, 16, 26, 34, 16, 26, 26],
  };
  return buildXlsx([summary, detail]);
}

export function downloadReport(rep: AttendanceReport) {
  downloadXlsx(reportToXlsx(rep), `rekap-presensi_${rep.from}_${rep.to}.xlsx`);
}
