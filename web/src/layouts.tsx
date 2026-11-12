import { useRef, type ReactNode } from 'react';
import { Link, Outlet, NavLink, useLocation, useMatches, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarDays, ChevronLeft, CircleCheck, House, ScanFace, UserRound } from 'lucide-react';
import { api } from './lib/api';
import { useToday } from './pages/Attendance';
import { cx } from './ui';
import WallpaperLayer from './components/WallpaperLayer';
import { PullIndicator, usePullToRefresh } from './lib/pull-to-refresh';
import { useUpdateAvailable } from './lib/version';

/** Area isi bergulir + tarik-untuk-segarkan. Dipasang ulang per rute (animasi masuk + pendengar sentuh baru). */
function Screen({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const { pull, refreshing } = usePullToRefresh(ref);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PullIndicator pull={pull} refreshing={refreshing} />
      <main ref={ref} className="screen-in flex flex-1 flex-col overflow-y-auto overscroll-contain px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] pb-6 pt-4">{children}</main>
    </div>
  );
}

/** Muncul bila ada deploy baru; memuat ulang mengambil JS terbaru. */
function UpdateBanner() {
  const available = useUpdateAvailable();
  if (!available) return null;
  return (
    <div role="status" className="pl-safe pr-safe flex items-center justify-between gap-3 bg-primary px-4 py-2 text-sm text-white">
      <span>Ada pembaruan aplikasi.</span>
      <button onClick={() => location.reload()} className="min-h-10 rounded-lg bg-white/15 px-3 font-semibold active:bg-white/25">Muat ulang</button>
    </div>
  );
}

/** `bare`: layar akar tanpa bilah judul (isinya memuat sapaan/judul sendiri). */
/** `plain`: layar dalam tanpa wallpaper (mis. kartu hari ini, agar kartu yang dibagikan terlihat jelas tanpa latar yang sama). */
export interface RouteHandle { title?: string; back?: string; bare?: boolean; plain?: boolean }

export function useTitle(): RouteHandle {
  const matches = useMatches();
  return ([...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title)?.handle as RouteHandle | undefined) ?? {};
}

/** Jumlah notifikasi belum dibaca dan pengajuan menunggu persetujuan saya (untuk lencana tab). */
export function useBadges() {
  const notif = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ unread: number; items: unknown[] }>('/notifications'), refetchInterval: 60_000 });
  const approvals = useQuery({ queryKey: ['approvals', 'pending'], queryFn: () => api<unknown[]>('/leave/approvals?tab=pending'), refetchInterval: 60_000 });
  const overtime = useQuery({ queryKey: ['overtime-approvals', 'pending'], queryFn: () => api<unknown[]>('/overtime/approvals?tab=pending'), refetchInterval: 60_000 });
  return { unread: notif.data?.unread ?? 0, approvals: (approvals.data?.length ?? 0) + (overtime.data?.length ?? 0) };
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span aria-hidden="true" className="absolute -top-1 left-1/2 ml-1 grid min-w-5 place-items-center rounded-full bg-bad px-1 text-[11px] font-bold leading-5 text-white">{n > 99 ? '99+' : n}</span>
  );
}

const TABS_LEFT = [
  { to: '/', label: 'Beranda', icon: House, end: true },
  { to: '/cuti', label: 'Izin', icon: CalendarDays },
] as const;
const TABS_RIGHT = [
  { to: '/notifikasi', label: 'Notifikasi', icon: Bell },
  { to: '/akun', label: 'Akun', icon: UserRound },
] as const;

/** Tombol presensi di tengah menu bawah: satu ketukan langsung ke kamera sesuai keadaan hari ini (masuk, pulang, atau riwayat bila selesai). */
function PunchTab() {
  const today = useToday();
  const r = today.data?.record;
  const state = !today.data ? 'load' : !r?.clock_in ? 'in' : !r.clock_out ? 'out' : 'done';
  const cfg = {
    load: { to: '/presensi', label: 'Presensi', aria: 'Presensi', Icon: ScanFace, bg: 'bg-primary' },
    in: { to: '/presensi/ambil/in', label: 'Masuk', aria: 'Presensi masuk', Icon: ScanFace, bg: 'bg-punch-in' },
    out: { to: '/presensi/ambil/out', label: 'Pulang', aria: 'Presensi pulang', Icon: ScanFace, bg: 'bg-punch-out' },
    done: { to: '/presensi/selesai', label: 'Selesai', aria: 'Presensi hari ini selesai, buka kartu hari ini', Icon: CircleCheck, bg: 'bg-blue-600' },
  }[state];
  const text = state === 'in' ? 'text-punch-in' : state === 'out' ? 'text-punch-out' : state === 'done' ? 'text-blue-700' : 'text-muted';
  return (
    <li>
      <Link to={cfg.to} aria-label={cfg.aria} className="relative flex min-h-16 items-end justify-center pb-[11px]">
        <span className={cx('absolute -top-5 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-full border-4 border-surface text-white shadow-lg transition-transform active:scale-95', cfg.bg)}>
          <cfg.Icon className="size-7" aria-hidden="true" />
        </span>
        <span className={cx('text-xs font-bold', text)}>{cfg.label}</span>
      </Link>
    </li>
  );
}

function NavItem({ to, label, icon: Icon, end, count }: { to: string; label: string; icon: typeof House; end?: boolean; count: number }) {
  return (
    <li>
      <NavLink to={to} end={end} aria-label={count ? `${label}, ${count} baru` : label}
        className={({ isActive }) => cx('relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs transition-colors active:bg-sub', isActive ? 'font-bold text-info' : 'font-medium text-muted')}>
        {({ isActive }) => (
          <>
            {isActive && <span className="absolute inset-x-[22%] top-0 h-[3px] rounded-b-full bg-info" aria-hidden="true" />}
            <span className="relative"><Icon className="size-6" strokeWidth={isActive ? 2.5 : 1.75} aria-hidden="true" /><Badge n={count} /></span>
            {label}
          </>
        )}
      </NavLink>
    </li>
  );
}

/** Layar akar: judul, isi bergulir, tab bar bawah (maks. 5 tujuan). */
export function TabLayout() {
  const { title, bare } = useTitle();
  const { unread, approvals } = useBadges();
  const location = useLocation();
  // Pengajuan (cuti dan overtime) menunggu persetujuan saya ditandai di tab Izin.
  const counts: Record<string, number> = { '/cuti': approvals, '/notifikasi': unread };
  return (
    <div className="relative isolate mx-auto flex h-dvh max-w-md flex-col bg-app">
      <WallpaperLayer />
      {bare ? <div className="pt-safe" /> : (
        <header className="pt-safe pl-safe pr-safe">
          <h1 className="flex h-14 items-center px-4 text-2xl font-extrabold">{title}</h1>
        </header>
      )}
      <UpdateBanner />
      <Screen key={location.pathname}><Outlet /></Screen>
      <nav aria-label="Menu utama" className="pb-safe pl-safe pr-safe rounded-t-3xl bg-surface shadow-[0_-8px_24px_rgba(30,41,59,0.08)]">
        <ul className="grid grid-cols-5">
          {TABS_LEFT.map((t) => <NavItem key={t.to} {...t} end={'end' in t} count={counts[t.to] ?? 0} />)}
          <PunchTab />
          {TABS_RIGHT.map((t) => <NavItem key={t.to} {...t} count={counts[t.to] ?? 0} />)}
        </ul>
      </nav>
    </div>
  );
}

/** Layar dalam: tombol kembali, tanpa tab bar. Kembali ke riwayat; bila dibuka langsung (tautan dalam) ke layar induk. */
export function StackLayout() {
  const { title, back = '/', plain } = useTitle();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = () => (location.key === 'default' ? navigate(back, { replace: true }) : navigate(-1));
  return (
    <div className="relative isolate mx-auto flex h-dvh max-w-md flex-col bg-app">
      {!plain && <WallpaperLayer />}
      <header className="pt-safe pl-safe pr-safe">
        <div className="flex h-16 items-center gap-3 px-4">
          <button onClick={goBack} aria-label="Kembali" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-fg shadow-card active:bg-sub"><ChevronLeft className="size-6" aria-hidden="true" /></button>
          <h1 className="truncate text-xl font-extrabold">{title}</h1>
        </div>
      </header>
      <UpdateBanner />
      <Screen key={location.pathname}><Outlet /></Screen>
    </div>
  );
}
