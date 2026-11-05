import { useEffect, useState } from 'react';

// __BUILD_ID__ ditanam saat build (vite.config.ts) dan sama dengan isi /version.json pada deploy yang sama.
// Aplikasi yang dibiarkan terbuka berhari-hari tetap memakai JS lama; hook ini mendeteksi deploy baru lalu menawarkan muat ulang.
const CHECK_EVERY_MS = 10 * 60_000;

export function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (__BUILD_ID__ === 'dev') return;
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (!stopped && id && id !== __BUILD_ID__) setAvailable(true);
      } catch { /* tanpa koneksi: cek lagi nanti */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, CHECK_EVERY_MS);
    void check();
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return available;
}
