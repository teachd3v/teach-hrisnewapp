import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { api } from '../lib/api';
import DecisionSheet from '../components/DecisionSheet';
import AttachmentLink from '../components/AttachmentLink';
import { STATUS_LABEL, STATUS_TONE, fmtRange, type LeaveItem } from '../lib/leave-types';
import { Button, Card, Chip, Empty, ErrorNote, Segmented, Spinner } from '../ui';

/** Persetujuan atasan langsung: tab Menunggu dan Riwayat. */
export default function Approvals() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [decision, setDecision] = useState<{ item: LeaveItem; approve: boolean } | null>(null);
  const list = useQuery({ queryKey: ['approvals', tab], queryFn: () => api<LeaveItem[]>(`/leave/approvals?tab=${tab}`) });
  const decide = useMutation({
    mutationFn: ({ id, approve, notes }: { id: string; approve: boolean; notes: string }) =>
      api(`/leave/${id}/manager-decision`, { method: 'POST', json: { approve, notes } }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['approvals'] }); void qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  return (
    <div className="flex flex-col gap-4">
      <Segmented value={tab} onChange={setTab} options={[{ value: 'pending', label: 'Menunggu' }, { value: 'history', label: 'Riwayat' }]} />
      {list.isPending && <Spinner />}
      <ErrorNote error={list.error} />
      {list.data?.length === 0 && <Empty icon={<ClipboardCheck className="size-10" />}>{tab === 'pending' ? 'Tidak ada pengajuan yang menunggu Anda.' : 'Belum ada riwayat.'}</Empty>}
      <ul className="flex flex-col gap-3">
        {list.data?.map((r) => (
          <li key={r.id}>
            <Card>
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{r.employeeName}</p><p className="text-sm text-muted">{r.leave_type}</p></div>
                {tab === 'history' && <Chip tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Chip>}
              </div>
              <p className="mt-2 text-sm">{fmtRange(r)} · <b>{r.total_days} hari</b>{r.start_time && <> · {r.start_time}–{r.end_time}</>}</p>
              {r.reason && <p className="mt-2 text-sm text-muted" data-selectable>{r.reason}</p>}
              {r.attachment_key && <div className="mt-1"><AttachmentLink fileKey={r.attachment_key} /></div>}
              {tab === 'history' && r.hc_override && <p className="mt-2 text-sm text-muted">Diambil alih HC.</p>}
              {tab === 'pending' && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Button variant="secondary" onClick={() => setDecision({ item: r, approve: false })}>Tolak</Button>
                  <Button onClick={() => setDecision({ item: r, approve: true })}>Setujui</Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <DecisionSheet
        open={Boolean(decision)} onClose={() => setDecision(null)} approve={decision?.approve ?? true}
        title={decision?.approve ? 'Setujui pengajuan?' : 'Tolak pengajuan?'}
        summary={decision ? `${decision.item.employeeName} · ${decision.item.leave_type} · ${fmtRange(decision.item)}` : undefined}
        onConfirm={(notes) => decide.mutateAsync({ id: decision!.item.id, approve: decision!.approve, notes })}
      />
    </div>
  );
}
