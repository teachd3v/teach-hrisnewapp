// Web Push di sisi perangkat (browser). Aplikasi Tauri memakai FCM (menyusul), jadi di sana modul ini tidak aktif.
import { api } from './api';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type PushState =
  | 'tauri' // aplikasi native: notifikasi lewat FCM (belum tersedia)
  | 'ios-needs-install' // iPhone: push web hanya untuk aplikasi yang ditambahkan ke Layar Utama
  | 'unsupported'
  | 'denied' // izin diblokir di pengaturan browser
  | 'off'
  | 'on';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const pushApiAvailable = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushState> {
  if (isTauri) return 'tauri';
  if (!pushApiAvailable()) return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted' && (await currentSubscription())) return 'on';
  return 'off';
}

const urlB64ToBytes = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
};

const toServer = (sub: PushSubscription) => {
  const j = sub.toJSON();
  return { endpoint: sub.endpoint, keys: { p256dh: j.keys?.p256dh, auth: j.keys?.auth } };
};

/** Harus dipanggil dari ketukan pengguna (syarat browser untuk meminta izin). */
export async function enablePush(): Promise<void> {
  if (!pushApiAvailable()) throw new Error('Perangkat ini belum mendukung notifikasi push.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Izin notifikasi tidak diberikan. Aktifkan di pengaturan browser untuk situs ini.');
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>('/push/config');
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(publicKey) }));
  await api('/push/subscribe', { method: 'POST', json: toServer(sub) });
}

/** Matikan di perangkat ini: hapus di server dan berhenti berlangganan di browser. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api('/push/unsubscribe', { method: 'POST', json: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Dipanggil sebelum keluar akun: langganan perangkat dilepas dari akun ini (HP bersama tidak menerima notifikasi akun lain). */
export async function detachFromServer(): Promise<void> {
  try {
    if (isTauri || !pushApiAvailable()) return;
    const sub = await currentSubscription();
    if (sub) await api('/push/unsubscribe', { method: 'POST', json: { endpoint: sub.endpoint } });
  } catch { /* abaikan: keluar akun tetap berjalan */ }
}

/** Setelah masuk: bila izin sudah diberikan dan perangkat berlangganan, daftarkan ke akun yang sedang masuk (tanpa meminta izin lagi). */
export async function syncPushSubscription(): Promise<void> {
  try {
    if (isTauri || !pushApiAvailable() || Notification.permission !== 'granted') return;
    const sub = await currentSubscription();
    if (sub) await api('/push/subscribe', { method: 'POST', json: toServer(sub) });
  } catch { /* abaikan */ }
}

export const sendTestPush = () => api<{ sent: number }>('/push/test', { method: 'POST' });
