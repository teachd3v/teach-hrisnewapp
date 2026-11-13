import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { clearTourRequest, markTourSeen, tourRequested, tourSeen } from '../lib/guide';
import { useToday } from '../pages/Attendance';
import { Button } from '../ui';

/** `target` = nilai `data-tour` pada elemen menu bawah (layouts.tsx). `lift`: ruang ekstra di atas sorotan (tombol presensi menonjol ke atas). */
const STEPS: { target: string; text: string; lift?: number }[] = [
  { target: 'punch', text: 'Satu ketukan untuk presensi masuk dan pulang.', lift: 22 },
  { target: 'izin', text: 'Ajukan izin, cuti, dan overtime di sini.' },
  { target: 'akun', text: 'Notifikasi, wajah, wallpaper, dan panduan ini ada di Akun.' },
];
const PAD = 4;
const DIM = 'rgba(15, 23, 42, 0.62)';

interface Box { x: number; y: number; w: number; h: number; W: number; H: number }

/**
 * Tur singkat di Beranda: tiga titik yang menyorot menu bawah yang asli, satu per satu. Muncul sekali per akun di perangkat ini
 * (setelah penyiapan akun untuk karyawan baru, atau saat Beranda pertama dibuka untuk karyawan lama), dan bisa diulang dari
 * Akun > Lihat panduan lagi. Bisa dilewati kapan saja (tombol Lewati atau Esc). Dipasang di TabLayout; induknya harus `relative`.
 */
export default function Tour() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const today = useToday();
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const userId = user?.id;

  // Mulai sebentar setelah Beranda tampil. Permintaan dari Akun baru dihapus saat tur benar-benar mulai.
  useEffect(() => {
    if (!userId || step !== null || pathname !== '/') return;
    if (!tourRequested() && tourSeen(userId)) return;
    const t = setTimeout(() => { clearTourRequest(); setStep(0); }, 500);
    return () => clearTimeout(t);
  }, [userId, pathname, step]);

  // Berpindah layar di tengah tur (mis. tombol kembali HP): tutup tanpa menandai selesai.
  useEffect(() => { if (pathname !== '/' && step !== null) { setStep(null); setBox(null); } }, [pathname, step]);

  const finish = useCallback(() => {
    if (userId) markTourSeen(userId);
    setStep(null);
    setBox(null);
  }, [userId]);

  useLayoutEffect(() => {
    if (step === null) return;
    const measure = () => {
      const host = root.current;
      const el = document.querySelector(`[data-tour="${STEPS[step]!.target}"]`);
      if (!host || !el) return;
      const a = host.getBoundingClientRect(), b = el.getBoundingClientRect();
      setBox({ x: b.left - a.left, y: b.top - a.top, w: b.width, h: b.height, W: a.width, H: a.height });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [step]);

  // Gelembung baru ada setelah sasaran terukur, jadi fokus dipindah saat ukurannya tersedia (bukan hanya saat titik berganti).
  const measured = box !== null;
  useEffect(() => { if (measured) bubble.current?.focus(); }, [step, measured]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, finish]);

  if (step === null) return null;
  const s = STEPS[step]!;
  const last = step === STEPS.length - 1;
  // Ajakan langsung presensi hanya bila hari ini memang belum presensi masuk.
  const canPunchIn = Boolean(today.data) && !today.data!.record?.clock_in;

  const hole = box && { left: box.x - PAD, top: box.y - PAD - (s.lift ?? 0), width: box.w + PAD * 2, height: box.h + PAD * 2 + (s.lift ?? 0) };
  const bw = box ? Math.min(288, box.W - 24) : 0;
  const cx = box ? box.x + box.w / 2 : 0;
  const left = box ? Math.max(12, Math.min(cx - bw / 2, box.W - bw - 12)) : 0;

  return (
    <div ref={root} className="absolute inset-0 z-40 overflow-hidden">
      {hole && box && (
        <>
          <div aria-hidden="true" className="absolute rounded-2xl ring-2 ring-white/80" style={{ ...hole, boxShadow: `0 0 0 9999px ${DIM}` }} />
          <div ref={bubble} role="dialog" aria-modal="true" aria-label="Panduan singkat" tabIndex={-1}
            className="screen-in absolute rounded-2xl bg-surface p-4 shadow-card outline-none" style={{ left, width: bw, bottom: box.H - hole.top + 14 }}>
            <p className="text-xs font-semibold text-muted">{step + 1} dari {STEPS.length}</p>
            <p className="mt-1 font-medium" aria-live="polite">{s.text}</p>
            {last ? (
              <div className="mt-3 flex flex-col gap-1">
                {canPunchIn
                  ? <><Button onClick={() => { finish(); navigate('/presensi/ambil/in'); }}>Presensi sekarang</Button><Button variant="ghost" onClick={finish}>Nanti saja</Button></>
                  : <Button onClick={finish}>Mengerti</Button>}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={finish}>Lewati</Button>
                <Button onClick={() => setStep(step + 1)}>Lanjut</Button>
              </div>
            )}
            <span aria-hidden="true" className="absolute -bottom-1.5 size-3 rotate-45 bg-surface" style={{ left: Math.max(18, Math.min(cx - left, bw - 18)) - 6 }} />
          </div>
        </>
      )}
    </div>
  );
}
