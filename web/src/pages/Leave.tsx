import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, CalendarPlus, CheckCircle2 } from 'lucide-react';
import { PENDING_STATUSES } from '@hris/shared';
import { api } from '../lib/api';
import { STATUS_LABEL, STATUS_TONE, fmtRange, type LeaveItem, type LeaveMeta } from '../lib/leave-types';
import AttachmentLink from '../components/AttachmentLink';
import { Button, Card, Chip, Empty, ErrorNote, Sheet, Spinner } from '../ui';

/** Tab Cuti: saldo ringkas dan riwayat pengajuan saya. Form pengajuan ada di layar sendiri (/cuti/ajukan). */
export default function Leave() {
  const qc = useQueryClient();
  const flash = (useLocation().state as { flash?: string } | null)?.flash;
  const year = new Date().getFullYear();
  const meta = useQuery({ queryKey: ['leave-meta', year], queryFn: () => api<LeaveMeta>(`/leave/meta?year=${year}`) });
  const mine = useQuery({ queryKey: ['leave-mine'], queryFn: () => api<LeaveItem[]>('/leave/mine') });
  const [toCancel, setToCancel] = useState<LeaveItem | null>(null);
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/leave/${id}/cancel`, { method: 'POST' }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['leave-mine'] }); void qc.invalidateQueries({ queryKey: ['leave-meta'] }); },
    onSuccess: () => setToCancel(null),
  });

  const balances = meta.data?.balances.filter((b) => b.quota !== null) ?? [];
  return (
    <div className="flex flex-1 flex-col gap-4">
      {flash && <p role="status" className="flex items-center gap-2 rounded-xl bg-ok-bg p-3 text-sm font-medium text-ok"><CheckCircle2 className="size-5" aria-hidden="true" />{flash}</p>}

      {balances.length > 0 && (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
          {balances.map((b) => (
            <Card key={b.type} className="min-w-40 snap-start">
              <p className="text-sm text-muted">{b.type}</p>
              <p className="text-2xl font-bold">{b.remaining}<span className="text-sm font-medium text-muted"> hari</span></p>
              <p className="text-xs text-muted">terpakai {b.used}{b.pending ? ` · menunggu ${b.pending}` : ''} / {b.quota}</p>
            </Card>
          ))}
        </div>
      )}

      <Link to="/cuti/ajukan"><Button className="w-full"><CalendarPlus className="size-5" aria-hidden="true" />Ajukan cuti</Button></Link>

      <h2 className="text-lg font-semibold">Riwayat</h2>
      {mine.isPending && <Spinner />}
      <ErrorNote error={mine.error} />
      {mine.data?.length === 0 && <Empty icon={<CalendarOff className="size-10" />}>Belum ada pengajuan cuti.</Empty>}
      <ul className="flex flex-col gap-3">
        {mine.data?.map((r) => (
          <li key={r.id}>
            <Card>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{r.leave_type}</p>
                <Chip tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Chip>
              </div>
              <p className="mt-1 text-sm text-muted">{fmtRange(r)} · {r.total_days} hari</p>
              {r.manager_notes && <p className="mt-2 text-sm"><span className="text-muted">Atasan: </span>{r.manager_notes}</p>}
              {r.hc_override && <p className="mt-2 text-sm text-muted">Diputuskan langsung oleh HC.</p>}
              {r.hc_notes && <p className="mt-2 text-sm"><span className="text-muted">HC: </span>{r.hc_notes}</p>}
              {r.attachment_key && <div className="mt-1"><AttachmentLink fileKey={r.attachment_key} /></div>}
              {PENDING_STATUSES.includes(r.status) && <Button variant="secondary" className="mt-3 w-full" onClick={() => setToCancel(r)}>Batalkan pengajuan</Button>}
            </Card>
          </li>
        ))}
      </ul>

      <Sheet open={Boolean(toCancel)} onClose={() => setToCancel(null)} title="Batalkan pengajuan?">
        {toCancel && <p className="mb-4 text-muted">{toCancel.leave_type} · {fmtRange(toCancel)}. Pengajuan yang dibatalkan tidak dapat dikembalikan.</p>}
        <ErrorNote error={cancel.error} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setToCancel(null)}>Kembali</Button>
          <Button variant="danger" loading={cancel.isPending} onClick={() => toCancel && cancel.mutate(toCancel.id)}>Batalkan</Button>
        </div>
      </Sheet>
    </div>
  );
}
