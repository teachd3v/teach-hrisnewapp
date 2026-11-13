// Panduan aplikasi: tur singkat di Beranda (components/Tour) dan petunjuk sekali-tampil per layar (components/FirstHint).
// Catatan "sudah dilihat" disimpan per akun di perangkat ini (localStorage); tidak ada yang dikirim ke server.

export type HintId = 'izin' | 'presensi' | 'notifikasi' | 'akun';
const HINT_IDS: HintId[] = ['izin', 'presensi', 'notifikasi', 'akun'];

const tourKey = (userId: string) => `hris.tour.v1.${userId}`;
const hintKey = (userId: string, id: HintId) => `hris.hint.${id}.${userId}`;

const has = (key: string) => { try { return localStorage.getItem(key) === '1'; } catch { return true; } }; // tanpa penyimpanan: jangan ulang-ulang panduan
const put = (key: string) => { try { localStorage.setItem(key, '1'); } catch { /* tidak diingat */ } };
const drop = (key: string) => { try { localStorage.removeItem(key); } catch { /* abaikan */ } };

export const tourSeen = (userId: string) => has(tourKey(userId));
export const markTourSeen = (userId: string) => put(tourKey(userId));
export const hintSeen = (userId: string, id: HintId) => has(hintKey(userId, id));
export const markHintSeen = (userId: string, id: HintId) => put(hintKey(userId, id));

// "Lihat panduan lagi" di Akun: tur diminta ulang (dibaca Tour saat Beranda tampil) dan petunjuk per layar muncul sekali lagi.
let requested = false;
export function requestTour(userId: string) {
  requested = true;
  HINT_IDS.forEach((id) => drop(hintKey(userId, id)));
}
export const tourRequested = () => requested;
export const clearTourRequest = () => { requested = false; };
