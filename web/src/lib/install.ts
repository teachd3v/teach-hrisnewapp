// Pasang PWA ke layar utama. Android (Chrome) menyediakan peristiwa `beforeinstallprompt` sehingga tombol bisa memunculkan dialog pasang;
// iPhone tidak punya API itu, jadi hanya bisa diberi panduan langkah.
import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // simpan; dialog dimunculkan dari tombol kita
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => { deferred = null; emit(); });
}

export type InstallState =
  | 'installed' // sudah berjalan sebagai aplikasi (layar penuh) atau di dalam Tauri
  | 'prompt' // Android: dialog pasang bawaan tersedia
  | 'ios' // iPhone/iPad di browser: panduan Bagikan > Tambahkan ke Layar Utama
  | 'android' // Android tanpa dialog bawaan (sudah ditolak sebelumnya, atau peramban lain): panduan lewat menu
  | 'desktop'; // komputer: tidak ditawarkan

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const android = () => /Android/i.test(navigator.userAgent);

// useSyncExternalStore membandingkan hasil snapshot dengan ===; string primitif aman.
function getInstallState(): InstallState {
  if ('__TAURI_INTERNALS__' in window || standalone()) return 'installed';
  if (deferred) return 'prompt';
  if (ios()) return 'ios';
  if (android()) return 'android';
  return 'desktop';
}

export const useInstallState = (): InstallState =>
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getInstallState,
    () => 'desktop',
  );

/** Munculkan dialog pasang bawaan Android. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const ev = deferred;
  deferred = null; // peristiwa hanya bisa dipakai sekali
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  emit();
  return outcome;
}

const DISMISS_KEY = 'hris.install.dismissed';
const SNOOZE_MS = 14 * 24 * 3600_000;
export const installDismissed = (): boolean => {
  try { const t = Number(localStorage.getItem(DISMISS_KEY)); return t > 0 && Date.now() - t < SNOOZE_MS; } catch { return false; }
};
export const dismissInstall = (): void => {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* abaikan */ }
};
