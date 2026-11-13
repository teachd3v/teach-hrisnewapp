import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { isAdmin } from '@hris/shared';
import { useAuth } from '../lib/auth';
import { clearTourRequest, markTourSeen, tourRequested, tourSeen, type TourId } from '../lib/guide';
import { useToday } from '../pages/Attendance';
import { Button } from '../ui';

/** `target` = nilai atribut `data-tour` pada elemen yang disorot. `lift`: ruang ekstra di atas sorotan (tombol presensi menonjol ke atas). */
interface CoachStep { target: string; text: string; lift?: number }
/** Tombol utama di titik terakhir (aksi langsung); tanpa ini titik terakhir hanya "Mengerti". */
interface FinalAction { label: string; dismiss: string; run: () => void }

const PAD = 4;
const GAP = 14;
const DIM = 'rgba(15, 23, 42, 0.62)';

interface Box { x: number; y: number; w: number; h: number; W: number; H: number }

/**
 * Rangkaian titik sorot: layar diredupkan, satu elemen asli disorot, dan gelembung satu kalimat menjelaskannya. Elemen yang berada di
 * luar layar digulir masuk dulu. "Lewati" di setiap titik dan Esc menutup. Induknya harus `relative` (dipasang di TabLayout).
 */
function CoachMarks({ steps, finalAction, onClose }: { steps: CoachStep[]; finalAction?: FinalAction; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const s = steps[step]!;
  const last = step === steps.length - 1;

  useLayoutEffect(() => {
    let tries = 0;
    let timer = 0;
    const measure = () => {
      const host = root.current;
      const el = document.querySelector(`[data-tour="${s.target}"]`);
      if (!host) return;
      if (!el) {
        // Sasaran belum ada di layar: coba lagi sebentar; bila tetap tidak ada, lewati titik ini.
        if (++tries <= 5) timer = window.setTimeout(measure, 120);
        else if (last) onClose();
        else setStep(step + 1);
        return;
      }
      const a = host.getBoundingClientRect(), b = el.getBoundingClientRect();
      setBox({ x: b.left - a.left, y: b.top - a.top, w: b.width, h: b.height, W: a.width, H: a.height });
    };
    setBox(null);
    document.querySelector(`[data-tour="${s.target}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' });
    measure();
    window.addEventListener('resize', measure);
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Gelembung baru ada setelah sasaran terukur, jadi fokus dipindah saat ukurannya tersedia.
  const measured = box !== null;
  useEffect(() => { if (measured) bubble.current?.focus(); }, [step, measured]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hole = box && { left: box.x - PAD, top: box.y - PAD - (s.lift ?? 0), width: box.w + PAD * 2, height: box.h + PAD * 2 + (s.lift ?? 0) };
  const bw = box ? Math.min(288, box.W - 24) : 0;
  const cx = box ? box.x + box.w / 2 : 0;
  const left = box ? Math.max(12, Math.min(cx - bw / 2, box.W - bw - 12)) : 0;
  // Gelembung ditaruh di sisi sorotan yang ruangnya lebih lapang.
  const above = Boolean(hole && box) && hole!.top >= box!.H - (hole!.top + hole!.height);

  return (
    <div ref={root} className="absolute inset-0 z-40 overflow-hidden">
      {hole && box && (
        <>
          <div aria-hidden="true" className="absolute rounded-2xl ring-2 ring-white/80" style={{ ...hole, boxShadow: `0 0 0 9999px ${DIM}` }} />
          <div ref={bubble} role="dialog" aria-modal="true" aria-label="Panduan singkat" tabIndex={-1}
            className="screen-in absolute rounded-2xl bg-surface p-4 shadow-card outline-none"
            style={{ left, width: bw, ...(above ? { bottom: box.H - hole.top + GAP } : { top: hole.top + hole.height + GAP }) }}>
            <p className="text-xs font-semibold text-muted">{step + 1} dari {steps.length}</p>
            <p className="mt-1 font-medium" aria-live="polite">{s.text}</p>
            {last ? (
              <div className="mt-3 flex flex-col gap-1">
                {finalAction
                  ? <><Button onClick={() => { onClose(); finalAction.run(); }}>{finalAction.label}</Button><Button variant="ghost" onClick={onClose}>{finalAction.dismiss}</Button></>
                  : <Button onClick={onClose}>Mengerti</Button>}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={onClose}>Lewati</Button>
                <Button onClick={() => setStep(step + 1)}>Lanjut</Button>
              </div>
            )}
            <span aria-hidden="true" className={`absolute size-3 rotate-45 bg-surface ${above ? '-bottom-1.5' : '-top-1.5'}`} style={{ left: Math.max(18, Math.min(cx - left, bw - 18)) - 6 }} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Kapan sebuah tur tampil: di layar `at`, sekali per akun di perangkat ini (atau bila diminta ulang dari Akun > Lihat panduan lagi).
 * Mulai sebentar setelah layar tampil; berpindah layar di tengah tur menutupnya tanpa menandai selesai.
 */
function useTour(id: TourId, at: string, allowed = true) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [active, setActive] = useState(false);
  const userId = user?.id;
  const here = pathname === at;

  useEffect(() => {
    if (!userId || !allowed || active || !here) return;
    if (!tourRequested(id) && tourSeen(userId, id)) return;
    const t = setTimeout(() => { clearTourRequest(id); setActive(true); }, 500);
    return () => clearTimeout(t);
  }, [userId, allowed, active, here, id]);

  useEffect(() => { if (!here && active) setActive(false); }, [here, active]);

  const close = useCallback(() => {
    if (userId) markTourSeen(userId, id);
    setActive(false);
  }, [userId, id]);
  return [active, close] as const;
}

/**
 * Tur Beranda: tiga titik di menu bawah (tombol presensi, tab Izin, tab Akun). Untuk karyawan baru muncul tepat setelah penyiapan akun;
 * untuk karyawan lama saat Beranda pertama dibuka. Titik terakhir mengajak presensi hanya bila hari itu belum presensi masuk.
 */
export function HomeTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = useToday();
  const [active, close] = useTour('home', '/');
  if (!active) return null;
  const admin = Boolean(user && isAdmin(user.role));
  const steps: CoachStep[] = [
    { target: 'punch', text: 'Satu ketukan untuk presensi masuk dan pulang.', lift: 22 },
    { target: 'izin', text: 'Ajukan izin, cuti, dan overtime di sini.' },
    { target: 'akun', text: admin ? 'Notifikasi, wajah, wallpaper, menu Admin, dan panduan ini ada di Akun.' : 'Notifikasi, wajah, wallpaper, dan panduan ini ada di Akun.' },
  ];
  const canPunchIn = Boolean(today.data) && !today.data!.record?.clock_in;
  return <CoachMarks steps={steps} onClose={close} finalAction={canPunchIn ? { label: 'Presensi sekarang', dismiss: 'Nanti saja', run: () => navigate('/presensi/ambil/in') } : undefined} />;
}

/**
 * Tur admin/HC: menu Admin di Akun, kelompok demi kelompok (sasarannya kartu kelompok di pages/Account.tsx), lalu tab Ringkasan di
 * Beranda. Muncul saat admin pertama membuka Akun. Kelompok Sistem hanya untuk super admin.
 */
export function AdminTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const admin = Boolean(user && isAdmin(user.role));
  const [active, close] = useTour('admin', '/akun', admin);
  if (!active || !user) return null;
  const steps: CoachStep[] = [
    { target: 'admin-approvals', text: 'Pekerjaan harian HC: setujui izin dan overtime, koreksi presensi, dan pendaftaran wajah. Angka merah berarti ada yang menunggu.' },
    { target: 'admin-attendance', text: 'Pantau presensi harian semua karyawan dan unduh rekap Excel dari sini.' },
    { target: 'admin-data', text: 'Tambah atau ubah data karyawan, kuota cuti, dan hari libur.' },
    ...(user.role === 'super_admin' ? [{ target: 'admin-system', text: 'Khusus super admin: pengaturan presensi (lokasi, jam, verifikasi wajah) dan log audit.' }] : []),
    { target: 'beranda', text: 'Di Beranda, tab Ringkasan menampilkan kehadiran dan antrean hari ini.' },
  ];
  // Tab Beranda yang dipilih disimpan di perangkat (lihat usePersisted di Home), jadi cukup ditulis sebelum berpindah.
  const openOverview = () => { try { localStorage.setItem('hris.homeTab', 'overview'); } catch { /* tetap pindah */ } navigate('/'); };
  return <CoachMarks steps={steps} onClose={close} finalAction={{ label: 'Buka Ringkasan', dismiss: 'Mengerti', run: openOverview }} />;
}
