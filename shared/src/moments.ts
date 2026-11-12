// Momen karyawan untuk dashboard Beranda admin: ulang tahun, ulang tahun kerja (masa kerja), dan Long Service Award (LSA).
// Fungsi murni (tanpa akses database); semua tanggal kalender WIB dalam bentuk YYYY-MM-DD. Dipakai server (penentu) dan klien (tampilan).

/** Tonggak masa kerja (tahun) yang mendapat LSA. */
export const LSA_YEARS: readonly number[] = [5, 7, 10, 14, 20];
/** Daftar LSA ke depan: bulan berjalan ditambah sekian bulan berikutnya. */
export const LSA_MONTHS_AHEAD = 3;

export interface MomentPerson { id: string; name: string; department: string; birthDate: string | null; joinDate: string | null }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, '0');

/** Tanggal `ymd` pada tahun `year`; 29 Februari di tahun bukan kabisat jatuh pada 28 Februari. */
export function dateInYear(ymd: string, year: number): string {
  const m = Number(ymd.slice(5, 7)), d = Number(ymd.slice(8, 10));
  const day = m === 2 && d === 29 && !isLeap(year) ? 28 : d;
  return `${year}-${pad(m)}-${pad(day)}`;
}

/** Tanggal valid berbentuk YYYY-MM-DD (menolak 2026-02-30 dan sejenisnya). */
export function validYmd(v: string | null | undefined): v is string {
  if (!v || !ISO.test(v)) return false;
  const y = Number(v.slice(0, 4)), m = Number(v.slice(5, 7)), d = Number(v.slice(8, 10));
  return y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= lastDayOf(y, m);
}

/** Bulan YYYY-MM digeser `n` bulan. */
export function addMonths(ym: string, n: number): string {
  const total = Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}
export const monthFirst = (ym: string) => `${ym}-01`;
export const monthLast = (ym: string) => `${ym}-${pad(lastDayOf(Number(ym.slice(0, 4)), Number(ym.slice(5, 7))))}`;

export interface BirthdayItem { id: string; name: string; department: string; /** tanggal pada bulan yang diminta (tanpa tahun lahir) */ date: string; today: boolean }
export interface AnniversaryItem { id: string; name: string; department: string; date: string; years: number; today: boolean; lsa: boolean }
export interface LsaItem { id: string; name: string; department: string; date: string; years: number; /** 'lewat' = sudah lewat bulan ini, 'hari_ini', 'akan_datang' */ status: 'lewat' | 'hari_ini' | 'akan_datang'; daysUntil: number }

const byDateThenName = <T extends { date: string; name: string }>(a: T, b: T) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name);

/** Ulang tahun pada bulan `ym`. Hanya tanggal dan bulan yang dikembalikan (tahun lahir dan usia tidak ditampilkan). */
export function birthdaysInMonth(people: readonly MomentPerson[], ym: string, today: string): BirthdayItem[] {
  const year = Number(ym.slice(0, 4)), month = ym.slice(5, 7);
  const out: BirthdayItem[] = [];
  for (const p of people) {
    if (!validYmd(p.birthDate) || p.birthDate.slice(5, 7) !== month) continue;
    const date = dateInYear(p.birthDate, year);
    out.push({ id: p.id, name: p.name, department: p.department, date, today: date === today });
  }
  return out.sort(byDateThenName);
}

/** Ulang tahun kerja pada bulan `ym` (minimal 1 tahun). `lsa` = tahunnya termasuk tonggak LSA. */
export function anniversariesInMonth(people: readonly MomentPerson[], ym: string, today: string): AnniversaryItem[] {
  const year = Number(ym.slice(0, 4)), month = ym.slice(5, 7);
  const out: AnniversaryItem[] = [];
  for (const p of people) {
    if (!validYmd(p.joinDate) || p.joinDate.slice(5, 7) !== month) continue;
    const years = year - Number(p.joinDate.slice(0, 4));
    if (years < 1) continue;
    const date = dateInYear(p.joinDate, year);
    out.push({ id: p.id, name: p.name, department: p.department, date, years, today: date === today, lsa: LSA_YEARS.includes(years) });
  }
  return out.sort(byDateThenName);
}

const dayDiff = (a: string, b: string) => Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86_400_000);

/** LSA yang jatuh dari awal bulan ini sampai akhir bulan ke-`monthsAhead` berikutnya, urut tanggal. */
export function lsaWindow(people: readonly MomentPerson[], today: string, monthsAhead = LSA_MONTHS_AHEAD): LsaItem[] {
  const ym = today.slice(0, 7);
  const from = monthFirst(ym), to = monthLast(addMonths(ym, monthsAhead));
  const out: LsaItem[] = [];
  for (const p of people) {
    if (!validYmd(p.joinDate)) continue;
    const joinYear = Number(p.joinDate.slice(0, 4));
    for (const years of LSA_YEARS) {
      const date = dateInYear(p.joinDate, joinYear + years);
      if (date < from || date > to) continue;
      out.push({ id: p.id, name: p.name, department: p.department, date, years, status: date < today ? 'lewat' : date === today ? 'hari_ini' : 'akan_datang', daysUntil: dayDiff(date, today) });
    }
  }
  return out.sort(byDateThenName);
}

/** Jumlah karyawan yang belum punya tanggal lahir / tanggal masuk (agar daftar yang kosong tidak disangka "tidak ada"). */
export function missingDates(people: readonly MomentPerson[]): { birthDate: number; joinDate: number } {
  return { birthDate: people.filter((p) => !validYmd(p.birthDate)).length, joinDate: people.filter((p) => !validYmd(p.joinDate)).length };
}
