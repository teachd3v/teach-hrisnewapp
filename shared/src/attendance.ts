import type { NotifyInput } from './leave-notifications';

// Presensi: zona waktu WIB, jarak ke kantor. Dipakai server (penentu) dan klien (tampilan).

/** Lokasi kantor (tabel office_locations, dikelola super admin). */
export interface OfficeLocation { id: string; name: string; lat: number; lng: number; radiusM: number; active: boolean }

/** Aturan presensi yang berlaku mulai `effectiveFrom` (tanggal WIB). Mode 'flag' = lokasi hanya ditandai; 'block' = di luar radius ditolak. */
export interface AttendancePolicy { effectiveFrom: string; workStart: string; graceMinutes: number; locationMode: 'flag' | 'block' }

/** Aturan bila belum ada satu pun di database (sama dengan perilaku sebelum pengaturan dibuat). */
export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicy = { effectiveFrom: '0001-01-01', workStart: '09:00', graceMinutes: 0, locationMode: 'flag' };

/** Margin akurasi GPS yang ditambahkan ke radius pada mode 'block' (maksimal sekian meter). */
export const GPS_MARGIN_MAX_M = 100;

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

/** Lokasi aktif terdekat dari titik `p` dan jaraknya (meter); null bila tidak ada lokasi aktif. */
export function nearestOffice(p: { lat: number; lng: number }, offices: readonly OfficeLocation[]): { office: OfficeLocation; distance: number } | null {
  let best: { office: OfficeLocation; distance: number } | null = null;
  for (const o of offices) {
    if (!o.active) continue;
    const distance = distanceMeters(p, o);
    if (!best || distance < best.distance) best = { office: o, distance };
  }
  return best;
}

/**
 * Penilaian lokasi saat presensi. `outside` = di luar radius (snapshot yang disimpan). `blocked` = harus ditolak pada mode 'block':
 * di luar radius ditambah margin akurasi GPS (maks. GPS_MARGIN_MAX_M). Tanpa lokasi aktif tidak ada penilaian (null).
 */
export function assessLocation(
  p: { lat: number; lng: number } | null,
  accuracyM: number | null,
  offices: readonly OfficeLocation[],
): { distance: number; outside: boolean; blocked: boolean; office: OfficeLocation } | null {
  if (!p) return null;
  const near = nearestOffice(p, offices);
  if (!near) return null;
  const margin = Math.min(Math.max(accuracyM ?? 0, 0), GPS_MARGIN_MAX_M);
  return { distance: near.distance, office: near.office, outside: near.distance > near.office.radiusM, blocked: near.distance > near.office.radiusM + margin };
}

/** Koordinat valid (rentang bumi). */
export const validLatLng = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Durasi kerja "7j 32m" dari dua waktu ISO. */
export function workDuration(inIso: string | null, outIso: string | null): string | null {
  if (!inIso || !outIso) return null;
  const mins = Math.max(0, Math.round((new Date(outIso).getTime() - new Date(inIso).getTime()) / 60_000));
  return `${Math.floor(mins / 60)}j ${mins % 60}m`;
}

/** Aturan yang berlaku pada tanggal WIB `ymd`: yang `effectiveFrom`-nya terbaru dan <= tanggal itu; bila tidak ada, bawaan. */
export function policyFor(policies: readonly AttendancePolicy[], ymd: string): AttendancePolicy {
  let best: AttendancePolicy | null = null;
  for (const p of policies) if (p.effectiveFrom <= ymd && (!best || p.effectiveFrom > best.effectiveFrom)) best = p;
  return best ?? DEFAULT_ATTENDANCE_POLICY;
}

/** Ringkasan satu baris sebuah aturan, mis. "batas masuk 09:00 WIB, toleransi 5 menit". */
export const policyText = (p: Pick<AttendancePolicy, 'workStart' | 'graceMinutes'>) =>
  `batas masuk ${p.workStart} WIB${p.graceMinutes > 0 ? `, toleransi ${p.graceMinutes} menit` : ', tanpa toleransi'}`;

/** "09:00" -> detik sejak tengah malam. */
export const hhmmToSeconds = (hhmm: string) => Number(hhmm.slice(0, 2)) * 3600 + Number(hhmm.slice(3, 5)) * 60;
export const policyStartSeconds = (p: Pick<AttendancePolicy, 'workStart'>) => hhmmToSeconds(p.workStart);

/** Detik sejak tengah malam WIB dari waktu ISO. */
export function wibSecondsOfDay(iso: string): number {
  const d = new Date(new Date(iso).getTime() + WIB_OFFSET_MS);
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

/**
 * Menit keterlambatan (pembulatan ke atas), atau 0 bila tepat waktu. Memakai aturan yang berlaku pada tanggal presensi (WIB).
 * Terlambat bila lewat jam masuk + toleransi; menit dihitung dari jam masuk.
 */
export function lateMinutes(clockInIso: string | null, policies: readonly AttendancePolicy[]): number {
  if (!clockInIso) return 0;
  const policy = policyFor(policies, wibDate(new Date(clockInIso)));
  const over = wibSecondsOfDay(clockInIso) - policyStartSeconds(policy);
  return over > policy.graceMinutes * 60 ? Math.ceil(over / 60) : 0;
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
