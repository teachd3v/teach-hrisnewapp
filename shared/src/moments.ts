// Momen karyawan untuk dashboard Beranda admin: ulang tahun, ulang tahun kerja (masa kerja), dan Long Service Award (LSA).
// Fungsi murni (tanpa akses database); semua tanggal kalender WIB dalam bentuk YYYY-MM-DD. Dipakai server (penentu) dan klien (tampilan).

/** Tonggak masa kerja (tahun) yang mendapat LSA. */
export const LSA_YEARS: readonly number[] = [5, 7, 10, 14, 15, 20, 21];

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
/** Ulang tahun pada tanggal `today` (YYYY-MM-DD, WIB): hanya bulan dan tanggal yang dibandingkan. */
export function isBirthdayOn(birthDate: string | null | undefined, today: string): boolean {
  return validYmd(birthDate) && birthDate.slice(5) === today.slice(5);
}

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

export interface BirthdayItem { id: string; name: string; department: string; /** tanggal ulang tahun pada bulan yang diminta */ date: string; /** usia yang dicapai pada ulang tahun tersebut (tahun) */ age: number; today: boolean }
export interface AnniversaryItem { id: string; name: string; department: string; date: string; years: number; today: boolean; lsa: boolean }
export interface LsaItem { id: string; name: string; department: string; /** tanggal tonggak LSA tercapai */ date: string; /** tanggal masuk karyawan */ joinDate: string; years: number; /** 'lewat' = sudah lewat, 'hari_ini', 'akan_datang' */ status: 'lewat' | 'hari_ini' | 'akan_datang'; daysUntil: number }

const byDateThenName = <T extends { date: string; name: string }>(a: T, b: T) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name);

/** Ulang tahun pada bulan `ym`, beserta usia yang dicapai pada tahun tersebut. */
export function birthdaysInMonth(people: readonly MomentPerson[], ym: string, today: string): BirthdayItem[] {
  const year = Number(ym.slice(0, 4)), month = ym.slice(5, 7);
  const out: BirthdayItem[] = [];
  for (const p of people) {
    if (!validYmd(p.birthDate) || p.birthDate.slice(5, 7) !== month) continue;
    const date = dateInYear(p.birthDate, year);
    const age = year - Number(p.birthDate.slice(0, 4));
    out.push({ id: p.id, name: p.name, department: p.department, date, age, today: date === today });
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

/** Semua tonggak LSA setiap karyawan (tanpa batas bulan), urut tanggal. Status menandai yang sudah lewat, hari ini, dan yang akan datang. */
export function lsaAll(people: readonly MomentPerson[], today: string): LsaItem[] {
  const out: LsaItem[] = [];
  for (const p of people) {
    if (!validYmd(p.joinDate)) continue;
    const joinYear = Number(p.joinDate.slice(0, 4));
    for (const years of LSA_YEARS) {
      const date = dateInYear(p.joinDate, joinYear + years);
      out.push({ id: p.id, name: p.name, department: p.department, date, joinDate: p.joinDate, years, status: date < today ? 'lewat' : date === today ? 'hari_ini' : 'akan_datang', daysUntil: dayDiff(date, today) });
    }
  }
  return out.sort(byDateThenName);
}

export interface Tenure { years: number; months: number; days: number }

/** Lama bekerja sejak `joinDate` sampai `today` (keduanya YYYY-MM-DD, WIB), dalam tahun-bulan-hari kalender. null bila tanggal tidak valid atau belum masuk. */
export function tenureOf(joinDate: string | null | undefined, today: string): Tenure | null {
  if (!validYmd(joinDate) || !validYmd(today) || joinDate > today) return null;
  let years = Number(today.slice(0, 4)) - Number(joinDate.slice(0, 4));
  let months = Number(today.slice(5, 7)) - Number(joinDate.slice(5, 7));
  let days = Number(today.slice(8, 10)) - Number(joinDate.slice(8, 10));
  // pinjam hari dari bulan-bulan sebelum `today` sampai selisih hari tidak negatif (mis. 31 Jan -> 1 Mar)
  let cy = Number(today.slice(0, 4)), cm = Number(today.slice(5, 7));
  while (days < 0) {
    cm -= 1;
    if (cm === 0) { cm = 12; cy -= 1; }
    days += lastDayOf(cy, cm);
    months -= 1;
  }
  if (months < 0) { months += 12; years -= 1; }
  return { years, months, days };
}

/** Teks ringkas: "3 thn 2 bln" bila sudah setahun, selain itu "5 bln 12 hari". */
export function formatTenure(t: Tenure | null): string | null {
  if (!t) return null;
  if (t.years > 0) return `${t.years} thn ${t.months} bln`;
  if (t.months > 0) return `${t.months} bln ${t.days} hari`;
  return `${t.days} hari`;
}

/** Jumlah karyawan yang belum punya tanggal lahir / tanggal masuk (agar daftar yang kosong tidak disangka "tidak ada"). */
export function missingDates(people: readonly MomentPerson[]): { birthDate: number; joinDate: number } {
  return { birthDate: people.filter((p) => !validYmd(p.birthDate)).length, joinDate: people.filter((p) => !validYmd(p.joinDate)).length };
}
