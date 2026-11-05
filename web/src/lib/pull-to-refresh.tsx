import { useEffect, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

// Tarik-untuk-segarkan buatan sendiri. Versi bawaan browser sengaja dimatikan (overscroll-behavior) karena memuat ulang seluruh
// halaman; ini hanya memuat ulang data layar yang aktif (TanStack Query), tanpa kedipan dan tanpa kehilangan isian form.

const THRESHOLD = 64; // jarak tarik (setelah redaman) yang memicu muat ulang
const MAX_PULL = 96;
const DAMPING = 0.5;
const MIN_SPIN_MS = 600; // indikator tidak berkedip bila data datang sangat cepat
const IGNORE = 'input,textarea,select,[role=dialog],[data-no-ptr]';

export function usePullToRefresh(ref: RefObject<HTMLElement | null>) {
  const qc = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startY = 0, current = 0, tracking = false, busy = false;

    const onStart = (e: TouchEvent) => {
      if (busy || el.scrollTop > 0 || e.touches.length !== 1) return;
      if ((e.target as HTMLElement).closest(IGNORE)) return;
      startY = e.touches[0]!.clientY; current = 0; tracking = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0]!.clientY - startY;
      if (dy <= 0 || el.scrollTop > 0) { if (current) { current = 0; setPull(0); } return; }
      current = Math.min(MAX_PULL, dy * DAMPING);
      setPull(current);
    };
    const onEnd = async () => {
      if (!tracking) return;
      tracking = false;
      const fire = current >= THRESHOLD;
      current = 0;
      if (!fire) { setPull(0); return; }
      busy = true; setRefreshing(true); setPull(THRESHOLD);
      const t0 = Date.now();
      try { await qc.refetchQueries({ type: 'active' }); } catch { /* galat ditampilkan oleh layar masing-masing */ }
      const rest = MIN_SPIN_MS - (Date.now() - t0);
      if (rest > 0) await new Promise((r) => setTimeout(r, rest));
      setRefreshing(false); setPull(0); busy = false;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, qc]);

  return { pull, refreshing };
}

export function PullIndicator({ pull, refreshing }: { pull: number; refreshing: boolean }) {
  const visible = pull > 4 || refreshing;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center" aria-hidden={!refreshing}>
      <span role={refreshing ? 'status' : undefined} className="sr-only">{refreshing ? 'Memuat ulang…' : ''}</span>
      <div
        className="mt-2 grid size-10 place-items-center rounded-full border border-line bg-surface shadow-md"
        style={{ transform: `translateY(${Math.max(0, pull - 40)}px)`, opacity: visible ? Math.min(1, pull / 32) || 1 : 0, transition: pull === 0 || refreshing ? 'transform 200ms ease-out, opacity 200ms' : 'none' }}
      >
        <RefreshCw className={`size-5 ${refreshing ? 'animate-spin' : ''}`} style={refreshing ? undefined : { transform: `rotate(${(pull / THRESHOLD) * 270}deg)` }} aria-hidden="true" />
      </div>
    </div>
  );
}
