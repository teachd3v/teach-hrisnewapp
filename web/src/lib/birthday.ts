import { todayWib } from './week';

// Ulang tahun dihitung di server (`birthdayToday`), jadi tanggal lahir tidak perlu dikirim ke klien.

const seenKey = (userId: string, year: string) => `hris.bday.${year}.${userId}`;
const candleKey = (userId: string, date: string) => `hris.bday.candle.${date}.${userId}`;

const has = (key: string) => { try { return localStorage.getItem(key) === '1'; } catch { return true; } };
const put = (key: string) => { try { localStorage.setItem(key, '1'); } catch { /* tidak diingat */ } };

/** Ucapan sudah pernah tampil untuk akun ini pada tahun ini di perangkat ini. Tanpa penyimpanan: anggap sudah tampil supaya tidak berulang. */
export const birthdaySeen = (userId: string) => has(seenKey(userId, todayWib().slice(0, 4)));
export const markBirthdaySeen = (userId: string) => put(seenKey(userId, todayWib().slice(0, 4)));

/** Lilin sudah ditiup untuk presensi masuk hari ini (sekali per hari). */
export const candleBlown = (userId: string) => has(candleKey(userId, todayWib()));
export const markCandleBlown = (userId: string) => put(candleKey(userId, todayWib()));

/** Hapus catatan ucapan dan lilin hari ini di perangkat ini, supaya gimmick muncul lagi (untuk uji coba di Akun). */
export function resetBirthdayGimmick(userId: string) {
  const today = todayWib();
  const keys = [seenKey(userId, today.slice(0, 4)), candleKey(userId, today)];
  for (const k of keys) { try { localStorage.removeItem(k); } catch { /* abaikan */ } }
}
