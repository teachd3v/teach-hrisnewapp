import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { isAdmin } from '@hris/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Home() {
  const { user, logout } = useAuth();
  const notif = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ unread: number }>('/notifications'), refetchInterval: 60_000 });
  const unread = notif.data?.unread ?? 0;
  const links = [
    { to: '/cuti', label: 'Cuti' },
    { to: '/persetujuan', label: 'Persetujuan Cuti' },
    ...(user && isAdmin(user.role)
      ? [
          { to: '/admin/cuti', label: 'Cuti (HC)' },
          { to: '/admin/karyawan', label: 'Karyawan' },
          { to: '/admin/kuota', label: 'Kuota Cuti' },
          { to: '/admin/libur', label: 'Hari Libur' },
        ]
      : []),
    { to: '/notifikasi', label: unread ? `Notifikasi (${unread})` : 'Notifikasi' },
  ];
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">Beranda</h1>
      <p className="mt-2 text-sm">Halo, {user?.name}</p>
      <nav className="mt-4 flex flex-col gap-2">
        {links.map((l) => <Link key={l.to} to={l.to} className="rounded border p-3 text-sm">{l.label}</Link>)}
      </nav>
      <button className="mt-4 rounded border px-3 py-1 text-sm" onClick={() => void logout()}>Keluar</button>
    </main>
  );
}
