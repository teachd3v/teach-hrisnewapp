import { isOutsideOffice } from '@hris/shared';

export interface PunchInfo { lat: number | null; lng: number | null; accuracy: number | null; distance: number | null; face: boolean | null; photo: string | null }
export interface AttendanceRec {
  id: string; employee_id: string; date: string; clock_in: string | null; clock_out: string | null;
  in: PunchInfo | null; out: PunchInfo | null;
}

const TZ = 'Asia/Jakarta';
export const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':') : '--:--');
export const fmtLongDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtShortDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

export const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

/** Penanda lokasi untuk satu presensi (masuk/pulang): teks selalu ada, bukan hanya warna. */
export function locationFlag(p: PunchInfo | null): { tone: 'ok' | 'warn' | 'neutral'; text: string } | null {
  if (!p) return null;
  if (p.distance == null) return { tone: 'warn', text: 'Tanpa lokasi' };
  if (isOutsideOffice(p.distance)) return { tone: 'warn', text: `Di luar kantor (${km(p.distance)})` };
  return { tone: 'ok', text: 'Di area kantor' };
}
