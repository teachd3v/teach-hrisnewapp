import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import DecisionBox from '../components/DecisionBox';
import { STATUS_LABEL, fmtRange, type LeaveItem } from '../lib/leave-types';
import AttachmentLink from '../components/AttachmentLink';

/** Persetujuan atasan langsung: tab Menunggu dan Riwayat. */
export default function Approvals() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const list = useQuery({ queryKey: ['approvals', tab], queryFn: () => api<LeaveItem[]>(`/leave/approvals?tab=${tab}`) });
  const decide = useMutation({
    mutationFn: ({ id, approve, notes }: { id: string; approve: boolean; notes: string }) =>
      api(`/leave/${id}/manager-decision`, { method: 'POST', json: { approve, notes } }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['approvals'] }); void qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Persetujuan Cuti</h1>
        <Link to="/" className="text-sm underline">Beranda</Link>
      </header>
      <div className="flex gap-2 text-sm">
        {(['pending', 'history'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded border px-3 py-1 ${tab === t ? 'bg-black text-white' : ''}`}>{t === 'pending' ? 'Menunggu' : 'Riwayat'}</button>
        ))}
      </div>
      {list.isError && <p role="alert" className="text-sm text-red-600">{(list.error as Error).message}</p>}
      {list.data?.length === 0 && <p className="text-sm text-gray-500">{tab === 'pending' ? 'Tidak ada pengajuan yang menunggu.' : 'Belum ada riwayat.'}</p>}
      {list.data?.map((r) => (
        <article key={r.id} className="rounded border p-3 text-sm">
          <div className="flex justify-between"><b>{r.employeeName}</b><span>{r.leave_type}</span></div>
          <div className="text-gray-600">{fmtRange(r)} · {r.total_days} hari</div>
          {r.start_time && <div className="text-xs">Jam {r.start_time}–{r.end_time}</div>}
          <p className="mt-1">{r.reason}</p>
          {r.attachment_key && <AttachmentLink fileKey={r.attachment_key} />}
          {tab === 'pending' ? (
            <DecisionBox onDecide={(approve, notes) => decide.mutateAsync({ id: r.id, approve, notes })} />
          ) : (
            <div className="mt-1 text-xs text-gray-600">{STATUS_LABEL[r.status]}{r.hc_override ? ' · diambil alih HC' : ''}</div>
          )}
        </article>
      ))}
    </main>
  );
}
