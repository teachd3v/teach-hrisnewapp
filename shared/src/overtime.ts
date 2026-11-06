// Overtime (Lembur dan Kerja di Hari Libur) dan kredit Ganti Hari. Fungsi murni, dipakai server (penentu) dan klien (pratinjau).
//
// Kredit overtime yang disetujui HC mengisi kuota Ganti Hari secara otomatis. Saldo dihitung saat dibaca dari "lot" kuota:
//   - lot dasar: kuota Ganti Hari tahun itu (bawaan atau khusus), berlaku 1 Jan sampai 31 Des tahun itu;
//   - lot overtime: kredit yang berlaku sejak tanggal overtime sampai 31 Maret tahun berikutnya (3 bulan di tahun depan).
// Pemakaian Ganti Hari (menurut tanggal mulai) mengambil dari lot yang paling cepat kedaluwarsa lebih dulu.
import { parseIsoDate } from './leave';

export type OvertimeKind = 'lembur' | 'hari_libur';
export const OVERTIME_KINDS: readonly { key: OvertimeKind; label: string; hint: string }[] = [
  { key: 'lembur', label: 'Lembur', hint: 'Bekerja melebihi jam kerja pada hari kerja.' },
  { key: 'hari_libur', label: 'Kerja di Hari Libur', hint: 'Bekerja pada akhir pekan atau hari libur.' },
];
export const overtimeLabel = (k: string) => OVERTIME_KINDS.find((x) => x.key === k)?.label ?? k;

/** Aturan (satu tempat agar mudah diubah). Semua dalam menit. */
export const OVERTIME_MIN_MINUTES = 4 * 60; // minimal 4 jam per pengajuan, kedua jenis
export const OVERTIME_MAX_MINUTES = 16 * 60;
export const FULL_DAY_MINUTES = 6 * 60; // Kerja di Hari Libur: 6 jam atau lebih = 1 hari; 4 sampai kurang dari 6 jam = 0,5 hari
export const LEMBUR_BLOCK_MINUTES = 4 * 60; // Lembur: tiap 4 jam (dijumlahkan per tahun) = 0,5 hari
export const OVERTIME_DAYS_BACK = 14;
export const OVERTIME_DAYS_AHEAD = 7;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const dayMs = 86_400_000;
const dateShift = (ymd: string, n: number) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + n * dayMs).toISOString().slice(0, 10);
const isWeekendIso = (ymd: string) => { const d = new Date(`${ymd}T00:00:00Z`).getUTCDay(); return d === 0 || d === 6; };

/** Menit antara dua jam HH:MM pada tanggal yang sama; null bila format salah atau selesai tidak setelah mulai. */
export function minutesBetween(start: string, end: string): number | null {
  if (!HHMM.test(start) || !HHMM.test(end)) return null;
  const m = toMinutes(end) - toMinutes(start);
  return m > 0 ? m : null;
}

/** Kredit hari untuk satu pengajuan Kerja di Hari Libur (0 bila di bawah minimal). */
export function holidayWorkCredit(minutes: number): number {
  if (minutes < OVERTIME_MIN_MINUTES) return 0;
  return minutes >= FULL_DAY_MINUTES ? 1 : 0.5;
}

/** Kredit hari dari total menit lembur yang dijumlahkan: tiap blok 4 jam = 0,5 hari, sisa terbawa. */
export const lemburCreditDays = (totalMinutes: number) => Math.floor(totalMinutes / LEMBUR_BLOCK_MINUTES) * 0.5;

/**
 * Validasi pengajuan overtime; mengembalikan pesan galat atau null. `today` = tanggal WIB hari ini.
 * `offDay` = tanggal itu akhir pekan atau hari libur (tabel Hari Libur). Lembur hanya di hari kerja; Kerja di Hari Libur hanya di hari non-kerja.
 */
export function validateOvertime(
  input: { kind: string; date: string; startTime: string; endTime: string },
  today: string,
  isHoliday: boolean,
): string | null {
  if (input.kind !== 'lembur' && input.kind !== 'hari_libur') return 'Jenis overtime tidak valid';
  if (!parseIsoDate(input.date)) return 'Tanggal tidak valid';
  if (input.date < dateShift(today, -OVERTIME_DAYS_BACK)) return `Overtime hanya dapat diajukan sampai ${OVERTIME_DAYS_BACK} hari ke belakang`;
  if (input.date > dateShift(today, OVERTIME_DAYS_AHEAD)) return `Overtime hanya dapat diajukan sampai ${OVERTIME_DAYS_AHEAD} hari ke depan`;
  const minutes = minutesBetween(input.startTime, input.endTime);
  if (minutes === null) return 'Jam mulai dan selesai wajib diisi (selesai harus setelah mulai)';
  if (minutes < OVERTIME_MIN_MINUTES) return `Overtime minimal ${OVERTIME_MIN_MINUTES / 60} jam per pengajuan`;
  if (minutes > OVERTIME_MAX_MINUTES) return `Overtime maksimal ${OVERTIME_MAX_MINUTES / 60} jam per pengajuan`;
  const off = isWeekendIso(input.date) || isHoliday;
  if (input.kind === 'lembur' && off) return 'Lembur hanya untuk hari kerja. Untuk akhir pekan atau hari libur, pilih Kerja di Hari Libur';
  if (input.kind === 'hari_libur' && !off) return 'Kerja di Hari Libur hanya untuk akhir pekan atau hari libur. Untuk hari kerja, pilih Lembur';
  return null;
}

/** "3 jam 30 menit". */
export const fmtMinutes = (m: number) => `${Math.floor(m / 60)} jam${m % 60 ? ` ${m % 60} menit` : ''}`;

/** Pratinjau kredit satu pengajuan untuk ditampilkan di form. Lembur bergantung pada jumlah jam yang sudah terkumpul, jadi hanya keterangan. */
export function creditPreview(kind: string, minutes: number): string {
  if (kind === 'hari_libur') return `Perkiraan kredit: ${holidayWorkCredit(minutes)} hari Ganti Hari`;
  return `Jam lembur dijumlahkan tiap tahun: tiap ${LEMBUR_BLOCK_MINUTES / 60} jam menjadi 0,5 hari Ganti Hari (sisa jam terbawa)`;
}

// ------------------------------------------------------------------ lot kuota Ganti Hari

export interface Lot { start: string; expiry: string; days: number; source: 'base' | 'overtime' }
export interface OvertimeCreditRow { id: string; kind: string; date: string; minutes: number }
export interface Use { start: string; days: number }

/** Berlaku sampai 31 Maret tahun berikutnya. */
export const overtimeExpiry = (date: string) => `${Number(date.slice(0, 4)) + 1}-03-31`;

/**
 * Lot dari overtime yang disetujui. Kerja di Hari Libur: satu lot per pengajuan. Lembur: menit dijumlahkan per tahun (urut tanggal, lalu id);
 * lot dibuat pada pengajuan yang menyelesaikan tiap blok 4 jam, sebesar kenaikan kredit kumulatif.
 */
export function overtimeLots(rows: readonly OvertimeCreditRow[]): Lot[] {
  const lots: Lot[] = [];
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const lemburMinutes = new Map<string, number>(); // tahun -> menit kumulatif
  for (const r of sorted) {
    if (r.kind === 'hari_libur') {
      const days = holidayWorkCredit(r.minutes);
      if (days > 0) lots.push({ start: r.date, expiry: overtimeExpiry(r.date), days, source: 'overtime' });
    } else if (r.kind === 'lembur') {
      const year = r.date.slice(0, 4);
      const before = lemburMinutes.get(year) ?? 0;
      const after = before + r.minutes;
      lemburMinutes.set(year, after);
      const gained = lemburCreditDays(after) - lemburCreditDays(before);
      if (gained > 0) lots.push({ start: r.date, expiry: overtimeExpiry(r.date), days: gained, source: 'overtime' });
    }
  }
  return lots;
}

export const baseLot = (year: number, quota: number): Lot => ({ start: `${year}-01-01`, expiry: `${year}-12-31`, days: quota, source: 'base' });

/**
 * Alokasikan pemakaian ke lot: urut tanggal mulai; tiap pemakaian mengambil dari lot yang berlaku pada tanggal itu dengan kedaluwarsa paling cepat.
 * `left[i]` = sisa lot ke-i; `shortfall` = hari yang tidak dapat ditutup lot mana pun.
 */
export function allocateLots(lots: readonly Lot[], uses: readonly Use[], opts: { until?: string } = {}): { left: number[]; shortfall: number } {
  const left = lots.map((l) => l.days);
  let shortfall = 0;
  const ordered = [...uses].sort((a, b) => a.start.localeCompare(b.start));
  for (const u of ordered) {
    if (opts.until && u.start > opts.until) continue;
    let need = u.days;
    const order = lots.map((_, i) => i).filter((i) => lots[i]!.start <= u.start && u.start <= lots[i]!.expiry)
      .sort((a, b) => lots[a]!.expiry.localeCompare(lots[b]!.expiry) || lots[a]!.start.localeCompare(lots[b]!.start) || a - b);
    for (const i of order) {
      if (need <= 0) break;
      const take = Math.min(left[i]!, need);
      left[i]! -= take;
      need -= take;
    }
    if (need > 0) shortfall += need;
  }
  return { left, shortfall };
}

/** Sisa lot yang berlaku pada `date` (sudah mulai dan belum kedaluwarsa). */
export const availableOn = (lots: readonly Lot[], left: readonly number[], date: string) =>
  lots.reduce((a, l, i) => a + (l.start <= date && date <= l.expiry ? left[i]! : 0), 0);

export interface CompensationInput {
  year: number;
  /** tanggal acuan sisa (WIB); pemakaian baru dinilai pada tanggal mulainya */
  asOf: string;
  /** kuota dasar Ganti Hari per tahun (bawaan atau khusus): tahun sebelumnya dan tahun ini */
  baseQuota: { prev: number; current: number };
  overtime: readonly OvertimeCreditRow[];
  /** pemakaian Ganti Hari aktif (disetujui + menunggu) dengan tanggal mulai di tahun sebelumnya atau tahun ini */
  uses: readonly Use[];
}

export interface CompensationBalance {
  /** kuota tahun ini: dasar + kredit overtime (tahun ini + bawaan dari tahun lalu) */
  quota: number;
  /** bagian kuota yang berasal dari overtime */
  overtimeCredit: number;
  /** kredit yang sudah hangus (kedaluwarsa tanpa terpakai) per tanggal acuan */
  expired: number;
  /** sisa yang dapat dipakai pada tanggal acuan */
  remaining: number;
  /** hari pemakaian yang tidak tertutup lot (kredit dicabut atau berkurang); > 0 berarti kelebihan */
  shortfall: number;
}

/** Saldo Ganti Hari satu tahun dari lot dasar dan lot overtime (lihat komentar di atas file). */
export function compensationBalance(inp: CompensationInput): CompensationBalance {
  const { year } = inp;
  const lots: Lot[] = [baseLot(year - 1, inp.baseQuota.prev), baseLot(year, inp.baseQuota.current), ...overtimeLots(inp.overtime)];
  const { left, shortfall } = allocateLots(lots, inp.uses);
  // Bawaan dari tahun lalu: sisa lot overtime tahun lalu pada 31 Des tahun lalu (setelah pemakaian sampai saat itu).
  const atNewYear = allocateLots(lots, inp.uses, { until: `${year - 1}-12-31` }).left;
  const prefix = `${year}-`;
  let overtimeCredit = 0;
  let expired = 0;
  lots.forEach((l, i) => {
    if (l.source !== 'overtime') return;
    if (l.start.startsWith(prefix)) overtimeCredit += l.days;
    else if (l.start.startsWith(`${year - 1}-`)) overtimeCredit += atNewYear[i]!;
    if (l.expiry < inp.asOf) expired += left[i]!;
  });
  return {
    quota: inp.baseQuota.current + overtimeCredit,
    overtimeCredit,
    expired,
    remaining: availableOn(lots, left, inp.asOf),
    shortfall,
  };
}
