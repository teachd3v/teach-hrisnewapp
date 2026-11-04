import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import DecisionBox from '../components/DecisionBox';
import { STATUS_LABEL, fmtRange, type LeaveItem } from '../lib/leave-types';
import AttachmentLink from '../components/AttachmentLink';

const TABS = [
  { key: 'pending_hc', label: 'Menunggu HC' },
  { key: 'pending_manager', label: 'Tertahan di atasan' },
  { key: 'all', label: 'Semua' },
] as const;

export default function AdminLeave() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('pending_hc');
  const list = useQuery({ queryKey: ['admin-leave', tab], queryFn: () => api<LeaveItem[]>(`/leave/admin?status=${tab}`) });
  const decide = useMutation({
    mutationFn: ({ id, approve, text, override }: { id: string; approve: boolean; text: string; override: boolean }) =>
      api(`/leave/${id}/${override ? 'hc-override' : 'hc-decision'}`, { method: 'POST', json: override ? { approve, reason: text } : { approve, notes: text } }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['admin-leave'] }); void qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cuti (HC)</h1>
        <Link to="/" className="text-sm underline">Beranda</Link>
      </header>
      <div className="flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded border px-3 py-1 ${tab === t.key ? 'bg-black text-white' : ''}`}>{t.label}</button>
        ))}
      </div>
      {list.isError && <p role="alert" className="text-sm text-red-600">{(list.error as Error).message}</p>}
      {list.data?.length === 0 && <p className="text-sm text-gray-500">Tidak ada data.</p>}
      {list.data?.map((r) => (
        <article key={r.id} className="rounded border p-3 text-sm">
          <div className="flex justify-between"><b>{r.employeeName}</b><span>{r.leave_type}</span></div>
          <div className="text-gray-600">{fmtRange(r)} · {r.total_days} hari</div>
          <p className="mt-1">{r.reason}</p>
          {r.attachment_key && <AttachmentLink fileKey={r.attachment_key} />}
          {r.status === 'pending_hc' && (
            <DecisionBox onDecide={(approve, text) => decide.mutateAsync({ id: r.id, approve, text, override: false })} />
          )}
          {r.status === 'pending_manager' && (
            <>
              <p className="mt-1 text-xs text-amber-700">Menunggu atasan{r.managerName ? ` (${r.managerName})` : ''}. Ambil alih bersifat final dan tercatat di audit.</p>
              <DecisionBox requireText label="Alasan ambil alih (wajib)" approveLabel="Setujui (final)" rejectLabel="Tolak (final)"
                onDecide={(approve, text) => decide.mutateAsync({ id: r.id, approve, text, override: true })} />
            </>
          )}
          {r.status !== 'pending_hc' && r.status !== 'pending_manager' && (
            <div className="mt-1 text-xs text-gray-600">{STATUS_LABEL[r.status]}{r.hc_override ? ` · ambil alih HC: ${r.hc_override_reason}` : ''}</div>
          )}
        </article>
      ))}
    </main>
  );
}
