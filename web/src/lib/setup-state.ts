// Penyiapan akun (notifikasi, wajah, wallpaper, nama panggilan) wajib sekali per akun di perangkat ini.
// Ditandai selesai saat langkah terakhir dilalui; "Ulangi penyiapan akun" di Akun tidak mengubah tanda ini.
const key = (userId: string) => `hris.setup.done.v2.${userId}`;

/** Tanpa penyimpanan (mode privat, dll.) jangan memaksa, supaya tidak terjebak di layar penyiapan. */
export const setupDone = (userId: string) => { try { return localStorage.getItem(key(userId)) === '1'; } catch { return true; } };
export const markSetupDone = (userId: string) => { try { localStorage.setItem(key(userId), '1'); } catch { /* tidak diingat */ } };
