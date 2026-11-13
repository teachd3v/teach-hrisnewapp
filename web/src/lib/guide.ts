// Panduan aplikasi: tur singkat (components/Tour) dan petunjuk sekali-tampil per layar (components/FirstHint).
// Catatan "sudah dilihat" disimpan per akun di perangkat ini (localStorage); tidak ada yang dikirim ke server.

/** `home`: tur menu bawah di Beranda (semua karyawan). `admin`: tur menu Admin di Akun (admin/HC dan super admin). */
export type TourId = 'home' | 'admin';
export type HintId = 'izin' | 'presensi' | 'notifikasi' | 'akun';
const HINT_IDS: HintId[] = ['izin', 'presensi', 'notifikasi', 'akun'];

// Kunci tur Beranda dipertahankan dari versi pertama supaya yang sudah melihatnya tidak mengulang.
const tourKey = (userId: string, id: TourId) => (id === 'home' ? `hris.tour.v1.${userId}` : `hris.tour.${id}.v1.${userId}`);
const hintKey = (userId: string, id: HintId) => `hris.hint.${id}.${userId}`;

const has = (key: string) => { try { return localStorage.getItem(key) === '1'; } catch { return true; } }; // tanpa penyimpanan: jangan ulang-ulang panduan
const put = (key: string) => { try { localStorage.setItem(key, '1'); } catch { /* tidak diingat */ } };
const drop = (key: string) => { try { localStorage.removeItem(key); } catch { /* abaikan */ } };

export const tourSeen = (userId: string, id: TourId) => has(tourKey(userId, id));
export const markTourSeen = (userId: string, id: TourId) => put(tourKey(userId, id));
export const hintSeen = (userId: string, id: HintId) => has(hintKey(userId, id));
export const markHintSeen = (userId: string, id: HintId) => put(hintKey(userId, id));

// "Lihat panduan lagi" di Akun: tur Beranda diminta ulang sekarang, tur admin muncul lagi saat Akun dibuka berikutnya,
// dan petunjuk per layar tampil sekali lagi.
const requested = new Set<TourId>();
export function requestTour(userId: string) {
  requested.add('home');
  drop(tourKey(userId, 'admin'));
  HINT_IDS.forEach((id) => drop(hintKey(userId, id)));
}
export const tourRequested = (id: TourId) => requested.has(id);
export const clearTourRequest = (id: TourId) => { requested.delete(id); };
