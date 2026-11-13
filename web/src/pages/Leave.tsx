import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, CalendarPlus, CheckCircle2, ChevronRight, ClipboardCheck, Clock } from 'lucide-react';
import { PENDING_STATUSES } from '@hris/shared';
import { api } from '../lib/api';
import { STATUS_LABEL, STATUS_TONE, fmtRange, leaveLabel, useLeaveTypes, type LeaveItem, type LeaveMeta } from '../lib/leave-types';
import AttachmentLink from '../components/AttachmentLink';
import { OvertimeHistory } from '../components/OvertimeLists';
import FirstHint from '../components/FirstHint';
import { Button, Card, Chip, Empty, ErrorNote, Segmented, Sheet, Spinner } from '../ui';
import { useBadges } from '../layouts';

/** Dua tombol aksi utama di atas: hijau seperti tombol Masuk di menu bawah. */
const ACTION = 'flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-punch-in px-2 text-sm font-medium text-white transition-opacity active:opacity-85';

/** Tab Izin: saldo ringkas dan riwayat pengajuan cuti serta overtime saya. Formulir ada di layar sendiri (/cuti/ajukan dan /cuti/overtime). */
export default function Leave() {
  const qc = useQueryClient();
  const flash = (useLocation().state as { flash?: string } | null)?.flash;
  const [params, setParams] = useSearchParams();
  const riwayat = params.get('riwayat') === 'overtime' ? 'overtime' : 'cuti';
  const year = new Date().getFullYear();
  const meta = useQuery({ queryKey: ['leave-meta', year], queryFn: () => api<LeaveMeta>(`/leave/meta?year=${year}`) });
  const mine = useQuery({ queryKey: ['leave-mine'], queryFn: () => api<LeaveItem[]>('/leave/mine') });
  const typeList = useLeaveTypes().data;
  const { approvals } = useBadges();
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
      <FirstHint id="izin">Ajukan lewat tombol "Ajukan izin" atau "Ajukan overtime". Status tiap pengajuan terlihat di Riwayat di bawah.</FirstHint>

      {balances.length > 0 && (
        <div className="-mx-4 -mb-4 flex snap-x gap-3 overflow-x-auto px-4 pb-6">
          {balances.map((b) => (
            <Card key={b.type} className="min-w-40 snap-start">
              <p className="text-sm text-muted">{b.label}</p>
              <p className="text-2xl font-bold">{b.remaining}<span className="text-sm font-medium text-muted"> hari</span></p>
              <p className="text-xs text-muted">terpakai {b.used}{b.pending ? ` · menunggu ${b.pending}` : ''}{b.jointDeducted ? ` · cuti bersama ${b.jointDeducted}` : ''} / {b.quota}</p>
              {b.overtimeCredit > 0 && <p className="text-xs text-muted">termasuk {b.overtimeCredit} hari dari overtime</p>}
              {b.expired > 0 && <p className="text-xs text-bad">{b.expired} hari hangus</p>}
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/cuti/ajukan" className={ACTION}><CalendarPlus className="size-4 shrink-0" aria-hidden="true" />Ajukan izin</Link>
        <Link to="/cuti/overtime" className={ACTION}><Clock className="size-4 shrink-0" aria-hidden="true" />Ajukan overtime</Link>
      </div>

      {meta.data?.isManager && (
        <Link to="/persetujuan" className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface shadow-card p-3 active:bg-sub">
          <ClipboardCheck className="size-5" aria-hidden="true" />
          <span className="flex-1 font-medium">Persetujuan bawahan</span>
          {approvals > 0 && <Chip tone="warn">{approvals} menunggu</Chip>}
          <ChevronRight className="size-5 text-muted" aria-hidden="true" />
        </Link>
      )}

      <h2 className="text-lg font-semibold">Riwayat</h2>
      <Segmented value={riwayat} onChange={(v) => setParams(v === 'overtime' ? { riwayat: 'overtime' } : {}, { replace: true })} options={[{ value: 'cuti', label: 'Cuti' }, { value: 'overtime', label: 'Overtime' }]} />
      {riwayat === 'overtime' ? <OvertimeHistory /> : <>
      {mine.isPending && <Spinner />}
      <ErrorNote error={mine.error} />
      {mine.data?.length === 0 && <Empty icon={<CalendarOff className="size-10" />}>Belum ada pengajuan cuti.</Empty>}
      <ul className="flex flex-col gap-3">
        {mine.data?.map((r) => (
          <li key={r.id}>
            <Card accent={STATUS_TONE[r.status]}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{leaveLabel(typeList, r.leave_type)}</p>
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
        {toCancel && <p className="mb-4 text-muted">{leaveLabel(typeList, toCancel.leave_type)} · {fmtRange(toCancel)}. Pengajuan yang dibatalkan tidak dapat dikembalikan.</p>}
        <ErrorNote error={cancel.error} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setToCancel(null)}>Kembali</Button>
          <Button variant="danger" loading={cancel.isPending} onClick={() => toCancel && cancel.mutate(toCancel.id)}>Batalkan</Button>
        </div>
      </Sheet>
      </>}
    </div>
  );
}
