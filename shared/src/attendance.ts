import type { NotifyInput } from './leave-notifications';

// Presensi: zona waktu WIB, jarak ke kantor. Dipakai server (penentu) dan klien (tampilan).

/** Kantor. Sementara konstanta; geofence hanya dicatat (tidak memblokir). Pindah ke pengaturan bila perlu. */
export const OFFICE = { lat: -6.4733643, lng: 106.7274949, radiusM: 1000 } as const;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Tanggal kalender WIB (YYYY-MM-DD) dari waktu UTC. */
export const wibDate = (now: Date | number = Date.now()): string => new Date(new Date(now).getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);

/** Jarak (meter) dua titik koordinat, rumus haversine. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const distanceToOffice = (p: { lat: number; lng: number }) => distanceMeters(p, OFFICE);
export const isOutsideOffice = (distanceM: number | null | undefined) => distanceM != null && distanceM > OFFICE.radiusM;

/** Koordinat valid (rentang bumi). */
export const validLatLng = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Durasi kerja "7j 32m" dari dua waktu ISO. */
export function workDuration(inIso: string | null, outIso: string | null): string | null {
  if (!inIso || !outIso) return null;
  const mins = Math.max(0, Math.round((new Date(outIso).getTime() - new Date(inIso).getTime()) / 60_000));
  return `${Math.floor(mins / 60)}j ${mins % 60}m`;
}

/** Jam masuk paling lambat 09:00 WIB, tanpa toleransi (lewat dari 09:00:00 = terlambat). */
export const WORK_START_SECONDS = 9 * 3600;
export const WORK_START_LABEL = '09:00';

/** Detik sejak tengah malam WIB dari waktu ISO. */
export function wibSecondsOfDay(iso: string): number {
  const d = new Date(new Date(iso).getTime() + WIB_OFFSET_MS);
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

/** Menit keterlambatan (pembulatan ke atas), atau 0 bila tepat waktu. */
export function lateMinutes(clockInIso: string | null): number {
  if (!clockInIso) return 0;
  const over = wibSecondsOfDay(clockInIso) - WORK_START_SECONDS;
  return over > 0 ? Math.ceil(over / 60) : 0;
}

/** Akhir pekan (Sabtu/Minggu) untuk tanggal kalender YYYY-MM-DD. */
export const isWeekendDate = (ymd: string) => {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
};

export interface AttendanceFlags {
  /** menit terlambat (0 = tepat waktu) */
  lateMinutes: number;
  /** terlambat tetapi ada izin keterlambatan yang disetujui pada tanggal itu */
  lateExcused: boolean;
  /** jenis pengajuan lain yang disetujui pada tanggal itu (cuti, sakit, dinas luar kota, dst.) */
  leaveType: string | null;
  /** nama hari libur, "Akhir pekan", atau null */
  dayOff: string | null;
}

/** HH:MM WIB pada tanggal WIB -> waktu ISO UTC. */
export const wibToIso = (ymd: string, hhmm: string): string => new Date(`${ymd}T${hhmm}:00+07:00`).toISOString();
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Koreksi presensi boleh diajukan sampai sekian hari kalender ke belakang. */
export const CORRECTION_MAX_DAYS_BACK = 7;

/** Tanggal WIB n hari sebelum tanggal WIB `ymd`. */
export const wibDateMinusDays = (ymd: string, n: number): string => new Date(new Date(`${ymd}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

// ----- notifikasi koreksi presensi (tanpa alasan; sama seperti cuti)
const shortDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const correctionBrief = (date: string, inTime: string | null, outTime: string) => `${shortDate(date)} (${inTime ? `masuk ${inTime}, ` : ''}pulang ${outTime})`;

export function planCorrectionRequested(ref: { id: string; requesterId: string; requesterName: string; brief: string; adminIds: string[] }): NotifyInput[] {
  return ref.adminIds.filter((id) => id !== ref.requesterId).map((id) => ({
    employeeId: id, type: 'attendance.correction_requested' as const, title: `Koreksi presensi dari ${ref.requesterName}`,
    body: `${ref.brief}. Menunggu persetujuan HC.`, href: '/admin/koreksi-presensi', entityId: ref.id,
  }));
}

export function planCorrectionDecided(ref: { id: string; requesterId: string; brief: string; approved: boolean }): NotifyInput[] {
  return [{
    employeeId: ref.requesterId, type: 'attendance.correction_decided', title: ref.approved ? 'Koreksi presensi disetujui' : 'Koreksi presensi ditolak',
    body: ref.brief, href: '/presensi', entityId: ref.id,
  }];
}
