// Aturan pengingat terjadwal (waktu dalam detik sejak tengah malam WIB). Penjadwal ada di cron/ (Worker kecil) yang memanggil
// /api/internal/cron tiap 5 menit; semua logika dan dedup ada di api/src/lib/reminders.ts.
import { WORK_START_SECONDS } from './attendance';

/** Pengingat "belum presensi masuk": dari jam ini sampai batas masuk. */
export const REMIND_IN_FROM_SECONDS = 8 * 3600 + 45 * 60;
export const REMIND_IN_UNTIL_SECONDS = WORK_START_SECONDS;
/** Pengingat "belum presensi pulang": sekian jam setelah presensi masuk, paling lambat jam ini. */
export const REMIND_OUT_AFTER_HOURS = 8;
export const REMIND_OUT_UNTIL_SECONDS = 23 * 3600;
/** Pengingat pengajuan menunggu: pengajuan yang menunggu lebih lama dari ini, dikirim pada jendela pagi. */
export const NUDGE_AFTER_HOURS = 24;
export const NUDGE_FROM_SECONDS = 9 * 3600 + 30 * 60;
export const NUDGE_UNTIL_SECONDS = 12 * 3600;

export type ReminderKind = 'att_in' | 'att_out' | 'approvals';
