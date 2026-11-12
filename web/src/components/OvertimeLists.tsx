import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Inbox } from 'lucide-react';
import { fmtMinutes, overtimeLabel } from '@hris/shared';
import { api } from '../lib/api';
import { STATUS_LABEL, STATUS_TONE, fmtDate } from '../lib/leave-types';
import type { OvertimeItem } from '../lib/overtime';
import DecisionSheet from './DecisionSheet';
import { Button, Card, Chip, Empty, ErrorNote, Segmented, Sheet, Spinner } from '../ui';

const refreshAll = (qc: ReturnType<typeof useQueryClient>) => {
  for (const k of ['overtime-mine', 'overtime-approvals', 'overtime-admin', 'approvals', 'leave-meta', 'notifications']) void qc.invalidateQueries({ queryKey: [k] });
};

/** Warna penanda tepi kartu menurut status (dicabut HC = merah). */
const statusTone = (r: OvertimeItem) => (r.status === 'cancelled' && r.revoked_at ? 'bad' as const : STATUS_TONE[r.status]);

/** Ringkasan satu pengajuan: jenis, tanggal, jam, durasi, status. */
function Summary({ r, showEmployee, showStatus = true }: { r: OvertimeItem; showEmployee?: boolean; showStatus?: boolean }) {
  const revoked = r.status === 'cancelled' && Boolean(r.revoked_at);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          {showEmployee && <p className="font-semibold">{r.employeeName}</p>}
          <p className={showEmployee ? 'text-sm text-muted' : 'font-semibold'}>{overtimeLabel(r.kind)}</p>
        </div>
        {showStatus && <Chip tone={revoked ? 'bad' : STATUS_TONE[r.status]}>{revoked ? 'Dicabut HC' : STATUS_LABEL[r.status]}</Chip>}
      </div>
      <p className="mt-2 text-sm">{fmtDate(r.date)} · {r.start_time}–{r.end_time} · <b>{fmtMinutes(r.minutes)}</b></p>
    </>
  );
}

const Attendance = ({ r }: { r: OvertimeItem }) => (r.hasAttendance === undefined ? null : (
  <div className="mt-2"><Chip tone={r.hasAttendance ? 'ok' : 'warn'}>{r.hasAttendance ? 'Ada presensi pada tanggal ini' : 'Tidak ada presensi pada tanggal ini'}</Chip></div>
));

// ------------------------------------------------------------------ riwayat sendiri

export function OvertimeHistory() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['overtime-mine'], queryFn: () => api<OvertimeItem[]>('/overtime/mine') });
  const [toCancel, setToCancel] = useState<OvertimeItem | null>(null);
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/overtime/${id}/cancel`, { method: 'POST' }),
    onSettled: () => refreshAll(qc),
    onSuccess: () => setToCancel(null),
  });
  return (
    <div className="flex flex-col gap-3">
      {q.isPending && <Spinner />}
      <ErrorNote error={q.error} />
      {q.data?.length === 0 && <Empty icon={<Clock className="size-10" />}>Belum ada pengajuan overtime.</Empty>}
      <ul className="flex flex-col gap-3">
        {q.data?.map((r) => (
          <li key={r.id}>
            <Card accent={statusTone(r)}>
              <Summary r={r} />
              {r.manager_notes && <p className="mt-2 text-sm"><span className="text-muted">Atasan: </span>{r.manager_notes}</p>}
              {r.hc_override && <p className="mt-2 text-sm text-muted">Diputuskan langsung oleh HC.</p>}
              {r.hc_notes && <p className="mt-2 text-sm"><span className="text-muted">HC: </span>{r.hc_notes}</p>}
              {r.revoke_reason && <p className="mt-2 text-sm"><span className="text-muted">Alasan pencabutan: </span>{r.revoke_reason}</p>}
              {(r.status === 'pending_manager' || r.status === 'pending_hc') && <Button variant="secondary" className="mt-3 w-full" onClick={() => setToCancel(r)}>Batalkan pengajuan</Button>}
            </Card>
          </li>
        ))}
      </ul>
      <Sheet open={Boolean(toCancel)} onClose={() => setToCancel(null)} title="Batalkan pengajuan?">
        {toCancel && <p className="mb-4 text-muted">{overtimeLabel(toCancel.kind)} · {fmtDate(toCancel.date)}. Pengajuan yang dibatalkan tidak dapat dikembalikan.</p>}
        <ErrorNote error={cancel.error} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setToCancel(null)}>Kembali</Button>
          <Button variant="danger" loading={cancel.isPending} onClick={() => toCancel && cancel.mutate(toCancel.id)}>Batalkan</Button>
        </div>
      </Sheet>
    </div>
  );
}

// ------------------------------------------------------------------ persetujuan atasan

export function OvertimeApprovals() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [decision, setDecision] = useState<{ item: OvertimeItem; approve: boolean } | null>(null);
  const list = useQuery({ queryKey: ['overtime-approvals', tab], queryFn: () => api<OvertimeItem[]>(`/overtime/approvals?tab=${tab}`) });
  const decide = useMutation({
    mutationFn: ({ id, approve, notes }: { id: string; approve: boolean; notes: string }) => api(`/overtime/${id}/manager-decision`, { method: 'POST', json: { approve, notes } }),
    onSettled: () => refreshAll(qc),
  });
  return (
    <div className="flex flex-col gap-4">
      <Segmented value={tab} onChange={setTab} options={[{ value: 'pending', label: 'Menunggu' }, { value: 'history', label: 'Riwayat' }]} />
      {list.isPending && <Spinner />}
      <ErrorNote error={list.error} />
      {list.data?.length === 0 && <Empty icon={<Inbox className="size-10" />}>{tab === 'pending' ? 'Tidak ada overtime yang menunggu Anda.' : 'Belum ada riwayat.'}</Empty>}
      <ul className="flex flex-col gap-3">
        {list.data?.map((r) => (
          <li key={r.id}>
            <Card accent={statusTone(r)}>
              <Summary r={r} showEmployee showStatus={tab === 'history'} />
              {r.reason && <p className="mt-2 text-sm text-muted" data-selectable>{r.reason}</p>}
              {r.kind === 'hari_libur' && <Attendance r={r} />}
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
        title={decision?.approve ? 'Setujui overtime?' : 'Tolak overtime?'}
        summary={decision ? `${decision.item.employeeName} · ${overtimeLabel(decision.item.kind)} · ${fmtDate(decision.item.date)} ${decision.item.start_time}–${decision.item.end_time}` : undefined}
        onConfirm={(notes) => decide.mutateAsync({ id: decision!.item.id, approve: decision!.approve, notes })}
      />
    </div>
  );
}

// ------------------------------------------------------------------ HC

type AdminTab = 'pending_hc' | 'pending_manager' | 'approved' | 'all';

export function OvertimeAdmin() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<AdminTab>('pending_hc');
  const [decision, setDecision] = useState<{ item: OvertimeItem; approve: boolean } | null>(null);
  const [revoke, setRevoke] = useState<OvertimeItem | null>(null);
  const list = useQuery({ queryKey: ['overtime-admin', tab], queryFn: () => api<OvertimeItem[]>(`/overtime/admin?status=${tab}`) });
  const override = decision?.item.status === 'pending_manager';
  const decide = useMutation({
    mutationFn: ({ id, approve, text, override: ov }: { id: string; approve: boolean; text: string; override: boolean }) =>
      api(`/overtime/${id}/${ov ? 'hc-override' : 'hc-decision'}`, { method: 'POST', json: ov ? { approve, reason: text } : { approve, notes: text } }),
    onSettled: () => refreshAll(qc),
  });
  const revokeMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api(`/overtime/${id}/revoke`, { method: 'POST', json: { reason } }),
    onSettled: () => refreshAll(qc),
  });
  return (
    <div className="flex flex-col gap-4">
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'pending_hc', label: 'Menunggu HC' }, { value: 'pending_manager', label: 'Di atasan' }, { value: 'approved', label: 'Disetujui' }, { value: 'all', label: 'Semua' },
      ]} />
      {list.isPending && <Spinner />}
      <ErrorNote error={list.error} />
      {list.data?.length === 0 && <Empty icon={<Inbox className="size-10" />}>Tidak ada pengajuan overtime.</Empty>}
      <ul className="flex flex-col gap-3">
        {list.data?.map((r) => (
          <li key={r.id}>
            <Card accent={statusTone(r)}>
              <Summary r={r} showEmployee />
              {r.reason && <p className="mt-2 text-sm text-muted" data-selectable>{r.reason}</p>}
              {r.kind === 'hari_libur' && <Attendance r={r} />}
              {r.status === 'pending_manager' && <p className="mt-2 rounded-lg bg-warn-bg p-2 text-sm text-warn">Menunggu atasan{r.managerName ? ` (${r.managerName})` : ''}. Ambil alih bersifat final dan tercatat di audit.</p>}
              {r.hc_override && <p className="mt-2 text-sm text-muted">Ambil alih HC: {r.hc_override_reason}</p>}
              {r.revoke_reason && <p className="mt-2 text-sm"><span className="text-muted">Alasan pencabutan: </span>{r.revoke_reason}</p>}
              {(r.status === 'pending_hc' || r.status === 'pending_manager') && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Button variant="secondary" onClick={() => setDecision({ item: r, approve: false })}>{r.status === 'pending_manager' ? 'Tolak (final)' : 'Tolak'}</Button>
                  <Button onClick={() => setDecision({ item: r, approve: true })}>{r.status === 'pending_manager' ? 'Setujui (final)' : 'Setujui'}</Button>
                </div>
              )}
              {r.status === 'approved' && <Button variant="secondary" className="mt-3 w-full" onClick={() => setRevoke(r)}>Cabut persetujuan</Button>}
            </Card>
          </li>
        ))}
      </ul>
      <DecisionSheet
        open={Boolean(decision)} onClose={() => setDecision(null)} approve={decision?.approve ?? true}
        requireText={override} textLabel={override ? 'Alasan ambil alih' : 'Catatan'}
        title={`${override ? 'Ambil alih: ' : ''}${decision?.approve ? 'setujui' : 'tolak'} overtime?`}
        summary={decision ? `${decision.item.employeeName} · ${overtimeLabel(decision.item.kind)} · ${fmtDate(decision.item.date)}` : undefined}
        onConfirm={(text) => decide.mutateAsync({ id: decision!.item.id, approve: decision!.approve, text, override: Boolean(override) })}
      />
      <DecisionSheet
        open={Boolean(revoke)} onClose={() => setRevoke(null)} approve={false} requireText textLabel="Alasan pencabutan" confirmLabel="Cabut"
        title="Cabut persetujuan overtime?"
        summary={revoke ? `${revoke.employeeName} · ${overtimeLabel(revoke.kind)} · ${fmtDate(revoke.date)}. Kredit Ganti Hari dari overtime ini ikut dicabut; ditolak bila sudah terpakai.` : undefined}
        onConfirm={(reason) => revokeMut.mutateAsync({ id: revoke!.id, reason })}
      />
    </div>
  );
}
