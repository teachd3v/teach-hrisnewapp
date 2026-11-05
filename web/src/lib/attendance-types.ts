import { isOutsideOffice } from '@hris/shared';

export interface PunchInfo { lat: number | null; lng: number | null; accuracy: number | null; distance: number | null; face: boolean | null; photo: string | null; corrected?: boolean }
export interface DayFlags { lateMinutes?: number; lateExcused: boolean; leaveType: string | null; dayOff: string | null }
export interface AttendanceRec {
  id: string; employee_id: string; date: string; clock_in: string | null; clock_out: string | null;
  in: PunchInfo | null; out: PunchInfo | null; flags: DayFlags & { lateMinutes: number };
}

export const fmtLate = (m: number) => (m < 60 ? `${m} mnt` : `${Math.floor(m / 60)}j ${m % 60}m`);

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

/** Penanda waktu & hari untuk satu presensi. Teks selalu ada (warna bukan satu-satunya penanda). */
export function dayChips(f: DayFlags & { lateMinutes?: number }): { tone: Tone; text: string }[] {
  const out: { tone: Tone; text: string }[] = [];
  const late = f.lateMinutes ?? 0;
  if (late > 0) out.push(f.lateExcused ? { tone: 'info', text: `Terlambat ${fmtLate(late)} (izin disetujui)` } : { tone: 'bad', text: `Terlambat ${fmtLate(late)}` });
  if (f.leaveType) out.push({ tone: 'info', text: `Disetujui: ${f.leaveType}` });
  if (f.dayOff) out.push({ tone: 'neutral', text: f.dayOff === 'Akhir pekan' ? 'Akhir pekan' : `Libur: ${f.dayOff}` });
  return out;
}

/** Semua penanda satu presensi: waktu/hari + hasil koreksi HC (tanpa foto/lokasi). */
export function recordChips(r: AttendanceRec): { tone: Tone; text: string }[] {
  const out = dayChips(r.flags);
  if (r.in?.corrected && r.out?.corrected) out.push({ tone: 'info', text: 'Dikoreksi HC' });
  else if (r.out?.corrected) out.push({ tone: 'info', text: 'Jam pulang dikoreksi HC' });
  else if (r.in?.corrected) out.push({ tone: 'info', text: 'Jam masuk dikoreksi HC' });
  return out;
}

const TZ = 'Asia/Jakarta';
export const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':') : '--:--');
export const fmtLongDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtShortDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

export const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

/** Penanda lokasi untuk satu presensi (masuk/pulang): teks selalu ada, bukan hanya warna. */
export function locationFlag(p: PunchInfo | null): { tone: 'ok' | 'warn' | 'neutral'; text: string } | null {
  if (!p || p.corrected) return null; // hasil koreksi HC tidak punya lokasi; sudah ada penanda "Dikoreksi"
  if (p.distance == null) return { tone: 'warn', text: 'Tanpa lokasi' };
  if (isOutsideOffice(p.distance)) return { tone: 'warn', text: `Di luar kantor (${km(p.distance)})` };
  return { tone: 'ok', text: 'Di area kantor' };
}
