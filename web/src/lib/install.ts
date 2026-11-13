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
  if (ios()) return 'ios';
  // Chrome/Edge di komputer juga mengirim `beforeinstallprompt`. Pemasangan hanya ditawarkan (dan di halaman masuk: diwajibkan) di HP,
  // jadi dialog bawaan hanya dihitung di Android; di komputer keadaannya tetap 'desktop' walau peristiwa itu ada.
  if (android()) return deferred ? 'prompt' : 'android';
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
