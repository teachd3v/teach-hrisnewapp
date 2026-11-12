import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Empty, ErrorNote, Spinner } from '../ui';

interface Notif { id: string; title: string; body: string | null; href: string | null; created_at: string; read_at: string | null }

const when = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Notifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ unread: number; items: Notif[] }>('/notifications') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST' }), onSuccess: refresh });
  const readOne = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }), onSuccess: refresh });

  return (
    <div className="flex flex-col gap-3">
      {q.isPending && <Spinner />}
      <ErrorNote error={q.error} />
      {q.data && q.data.unread > 0 && <Button variant="secondary" loading={readAll.isPending} onClick={() => readAll.mutate()}>Tandai semua dibaca ({q.data.unread})</Button>}
      {q.data?.items.length === 0 && <Empty icon={<BellOff className="size-10" />}>Belum ada notifikasi.</Empty>}
      <ul className="flex flex-col gap-2">
        {q.data?.items.map((n) => (
          <li key={n.id}>
            <button onClick={() => { if (!n.read_at) readOne.mutate(n.id); if (n.href) navigate(n.href); }}
              className="relative flex min-h-16 w-full items-start gap-3 overflow-hidden rounded-2xl bg-surface p-3 pl-5 text-left shadow-card active:bg-sub">
              {!n.read_at && <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-blue-600" aria-hidden="true" />}
              <span className="flex-1">
                <span className={`block ${n.read_at ? 'font-medium' : 'font-bold'}`}>{n.read_at ? '' : <span className="sr-only">Belum dibaca: </span>}{n.title}</span>
                {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                <span className="block text-xs text-muted">{when(n.created_at)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
