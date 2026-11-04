import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { api } from '../lib/api';
import DecisionSheet from '../components/DecisionSheet';
import AttachmentLink from '../components/AttachmentLink';
import { STATUS_LABEL, STATUS_TONE, fmtRange, type LeaveItem } from '../lib/leave-types';
import { Button, Card, Chip, Empty, ErrorNote, Segmented, Spinner } from '../ui';

type Tab = 'pending_hc' | 'pending_manager' | 'all';

export default function AdminLeave() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending_hc');
  const [decision, setDecision] = useState<{ item: LeaveItem; approve: boolean } | null>(null);
  const list = useQuery({ queryKey: ['admin-leave', tab], queryFn: () => api<LeaveItem[]>(`/leave/admin?status=${tab}`) });
  const decide = useMutation({
    mutationFn: ({ id, approve, text, override }: { id: string; approve: boolean; text: string; override: boolean }) =>
      api(`/leave/${id}/${override ? 'hc-override' : 'hc-decision'}`, { method: 'POST', json: override ? { approve, reason: text } : { approve, notes: text } }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['admin-leave'] }); void qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });
  const override = decision?.item.status === 'pending_manager';

  return (
    <div className="flex flex-col gap-4">
      <Segmented value={tab} onChange={setTab} options={[{ value: 'pending_hc', label: 'Menunggu HC' }, { value: 'pending_manager', label: 'Di atasan' }, { value: 'all', label: 'Semua' }]} />
      {list.isPending && <Spinner />}
      <ErrorNote error={list.error} />
      {list.data?.length === 0 && <Empty icon={<Inbox className="size-10" />}>Tidak ada pengajuan.</Empty>}
      <ul className="flex flex-col gap-3">
        {list.data?.map((r) => (
          <li key={r.id}>
            <Card>
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{r.employeeName}</p><p className="text-sm text-muted">{r.leave_type}</p></div>
                <Chip tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Chip>
              </div>
              <p className="mt-2 text-sm">{fmtRange(r)} · <b>{r.total_days} hari</b></p>
              {r.reason && <p className="mt-2 text-sm text-muted" data-selectable>{r.reason}</p>}
              {r.attachment_key && <div className="mt-1"><AttachmentLink fileKey={r.attachment_key} /></div>}
              {r.status === 'pending_manager' && <p className="mt-2 rounded-lg bg-warn-bg p-2 text-sm text-warn">Menunggu atasan{r.managerName ? ` (${r.managerName})` : ''}. Ambil alih bersifat final dan tercatat di audit.</p>}
              {r.hc_override && <p className="mt-2 text-sm text-muted">Ambil alih HC: {r.hc_override_reason}</p>}
              {(r.status === 'pending_hc' || r.status === 'pending_manager') && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Button variant="secondary" onClick={() => setDecision({ item: r, approve: false })}>{r.status === 'pending_manager' ? 'Tolak (final)' : 'Tolak'}</Button>
                  <Button onClick={() => setDecision({ item: r, approve: true })}>{r.status === 'pending_manager' ? 'Setujui (final)' : 'Setujui'}</Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <DecisionSheet
        open={Boolean(decision)} onClose={() => setDecision(null)} approve={decision?.approve ?? true}
        requireText={override} textLabel={override ? 'Alasan ambil alih' : 'Catatan'}
        title={`${override ? 'Ambil alih: ' : ''}${decision?.approve ? 'setujui' : 'tolak'} pengajuan?`}
        summary={decision ? `${decision.item.employeeName} · ${decision.item.leave_type} · ${fmtRange(decision.item)}` : undefined}
        onConfirm={(text) => decide.mutateAsync({ id: decision!.item.id, approve: decision!.approve, text, override: Boolean(override) })}
      />
    </div>
  );
}
