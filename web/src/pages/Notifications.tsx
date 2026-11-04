import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Notif { id: string; title: string; body: string | null; href: string | null; created_at: string; read_at: string | null }

export default function Notifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ unread: number; items: Notif[] }>('/notifications') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST' }), onSuccess: refresh });
  const readOne = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }), onSuccess: refresh });

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notifikasi</h1>
        <Link to="/" className="text-sm underline">Beranda</Link>
      </header>
      {q.data && q.data.unread > 0 && <button className="self-start text-sm underline" onClick={() => readAll.mutate()}>Tandai semua dibaca</button>}
      {q.data?.items.length === 0 && <p className="text-sm text-gray-500">Belum ada notifikasi.</p>}
      {q.data?.items.map((n) => (
        <button
          key={n.id}
          className={`rounded border p-3 text-left text-sm ${n.read_at ? '' : 'border-black'}`}
          onClick={() => { readOne.mutate(n.id); if (n.href) navigate(n.href); }}
        >
          <div className="font-medium">{n.title}</div>
          {n.body && <div className="text-gray-600">{n.body}</div>}
        </button>
      ))}
    </main>
  );
}
