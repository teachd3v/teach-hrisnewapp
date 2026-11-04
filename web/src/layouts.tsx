import { Outlet, NavLink, useLocation, useMatches, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarDays, ChevronLeft, ClipboardCheck, House, UserRound } from 'lucide-react';
import { api } from './lib/api';
import { cx } from './ui';

export interface RouteHandle { title?: string; back?: string }

export function useTitle(): RouteHandle {
  const matches = useMatches();
  return ([...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title)?.handle as RouteHandle | undefined) ?? {};
}

/** Jumlah notifikasi belum dibaca dan pengajuan menunggu persetujuan saya (untuk lencana tab). */
export function useBadges() {
  const notif = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ unread: number; items: unknown[] }>('/notifications'), refetchInterval: 60_000 });
  const approvals = useQuery({ queryKey: ['approvals', 'pending'], queryFn: () => api<unknown[]>('/leave/approvals?tab=pending'), refetchInterval: 60_000 });
  return { unread: notif.data?.unread ?? 0, approvals: approvals.data?.length ?? 0 };
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span aria-hidden="true" className="absolute -top-1 left-1/2 ml-1 grid min-w-5 place-items-center rounded-full bg-bad px-1 text-[11px] font-bold leading-5 text-white">{n > 99 ? '99+' : n}</span>
  );
}

const TABS = [
  { to: '/', label: 'Beranda', icon: House, end: true },
  { to: '/cuti', label: 'Cuti', icon: CalendarDays },
  { to: '/persetujuan', label: 'Persetujuan', icon: ClipboardCheck },
  { to: '/notifikasi', label: 'Notifikasi', icon: Bell },
  { to: '/akun', label: 'Akun', icon: UserRound },
] as const;

/** Layar akar: judul, isi bergulir, tab bar bawah (maks. 5 tujuan). */
export function TabLayout() {
  const { title } = useTitle();
  const { unread, approvals } = useBadges();
  const location = useLocation();
  const counts: Record<string, number> = { '/persetujuan': approvals, '/notifikasi': unread };
  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-bg">
      <header className="pt-safe pl-safe pr-safe border-b border-line bg-surface">
        <h1 className="flex h-14 items-center px-4 text-xl font-bold">{title}</h1>
      </header>
      <main key={location.pathname} className="screen-in flex flex-1 flex-col overflow-y-auto overscroll-contain px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] py-4">
        <Outlet />
      </main>
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
      <main key={location.pathname} className="screen-in flex flex-1 flex-col overflow-y-auto overscroll-contain px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] py-4">
        <Outlet />
      </main>
    </div>
  );
}
