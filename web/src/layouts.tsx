import { useRef, type ReactNode } from 'react';
import { Outlet, NavLink, useLocation, useMatches, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarDays, ChevronLeft, House, ScanFace, UserRound } from 'lucide-react';
import { api } from './lib/api';
import { cx } from './ui';
import { PullIndicator, usePullToRefresh } from './lib/pull-to-refresh';
import { useUpdateAvailable } from './lib/version';

/** Area isi bergulir + tarik-untuk-segarkan. Dipasang ulang per rute (animasi masuk + pendengar sentuh baru). */
function Screen({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const { pull, refreshing } = usePullToRefresh(ref);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PullIndicator pull={pull} refreshing={refreshing} />
      <main ref={ref} className="screen-in flex flex-1 flex-col overflow-y-auto overscroll-contain px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] py-4">{children}</main>
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

export interface RouteHandle { title?: string; back?: string }

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

const TABS = [
  { to: '/', label: 'Beranda', icon: House, end: true },
  { to: '/presensi', label: 'Presensi', icon: ScanFace },
  { to: '/cuti', label: 'Izin', icon: CalendarDays },
  { to: '/notifikasi', label: 'Notifikasi', icon: Bell },
  { to: '/akun', label: 'Akun', icon: UserRound },
] as const;

/** Layar akar: judul, isi bergulir, tab bar bawah (maks. 5 tujuan). */
export function TabLayout() {
  const { title } = useTitle();
  const { unread, approvals } = useBadges();
  const location = useLocation();
  // Pengajuan (cuti dan overtime) menunggu persetujuan saya ditandai di tab Izin.
  const counts: Record<string, number> = { '/cuti': approvals, '/notifikasi': unread };
  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-bg">
      <header className="pt-safe pl-safe pr-safe border-b border-line bg-surface">
        <h1 className="flex h-14 items-center px-4 text-xl font-bold">{title}</h1>
      </header>
      <UpdateBanner />
      <Screen key={location.pathname}><Outlet /></Screen>
      <nav aria-label="Menu utama" className="pb-safe pl-safe pr-safe border-t border-line bg-surface">
        <ul className="grid grid-cols-5">
          {TABS.map(({ to, label, icon: Icon, ...rest }) => (
            <li key={to}>
              <NavLink to={to} end={'end' in rest} aria-label={counts[to] ? `${label}, ${counts[to]} baru` : label}
                className={({ isActive }) => cx('relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs transition-colors active:bg-sub', isActive ? 'font-bold text-fg' : 'font-medium text-muted')}>
                {({ isActive }) => (
                  <>
                    <span className="relative"><Icon className="size-6" strokeWidth={isActive ? 2.5 : 1.75} aria-hidden="true" /><Badge n={counts[to] ?? 0} /></span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Layar dalam: tombol kembali, tanpa tab bar. Kembali ke riwayat; bila dibuka langsung (tautan dalam) ke layar induk. */
export function StackLayout() {
  const { title, back = '/' } = useTitle();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = () => (location.key === 'default' ? navigate(back, { replace: true }) : navigate(-1));
  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-bg">
      <header className="pt-safe pl-safe pr-safe border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-1 pr-4">
          <button onClick={goBack} aria-label="Kembali" className="grid size-12 place-items-center rounded-full text-fg active:bg-sub"><ChevronLeft className="size-7" aria-hidden="true" /></button>
          <h1 className="truncate text-lg font-semibold">{title}</h1>
        </div>
      </header>
      <UpdateBanner />
      <Screen key={location.pathname}><Outlet /></Screen>
    </div>
  );
}
