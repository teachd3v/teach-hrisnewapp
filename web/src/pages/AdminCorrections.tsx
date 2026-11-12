import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileX } from 'lucide-react';
import { api } from '../lib/api';
import DecisionSheet from '../components/DecisionSheet';
import { fmtLongDate } from '../lib/attendance-types';
import { CORR_STATUS, corrTimes, type CorrectionItem } from '../lib/correction-types';
import { Button, Card, Chip, Empty, ErrorNote, Segmented, Spinner } from '../ui';

/** HC: antrean koreksi presensi (lupa masuk/pulang). */
export default function AdminCorrections() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [decision, setDecision] = useState<{ item: CorrectionItem; approve: boolean } | null>(null);
  const list = useQuery({ queryKey: ['corr-admin', tab], queryFn: () => api<CorrectionItem[]>(`/attendance-corrections/admin?status=${tab}`) });
  const decide = useMutation({
    mutationFn: ({ id, approve, notes }: { id: string; approve: boolean; notes: string }) => api(`/attendance-corrections/${id}/decision`, { method: 'POST', json: { approve, notes } }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['corr-admin'] }); void qc.invalidateQueries({ queryKey: ['notifications'] }); void qc.invalidateQueries({ queryKey: ['att-admin'] }); },
  });

  return (
    <div className="flex flex-col gap-4">
      <Segmented value={tab} onChange={setTab} options={[{ value: 'pending', label: 'Menunggu' }, { value: 'all', label: 'Semua' }]} />
      {list.isPending && <Spinner />}
      <ErrorNote error={list.error} />
      {list.data?.length === 0 && <Empty icon={<FileX className="size-10" />}>{tab === 'pending' ? 'Tidak ada koreksi yang menunggu.' : 'Belum ada pengajuan.'}</Empty>}
      <ul className="flex flex-col gap-3">
        {list.data?.map((c) => (
          <li key={c.id}>
            <Card accent={CORR_STATUS[c.status].tone}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{c.employeeName}</p><p className="text-sm text-muted">{fmtLongDate(c.date)}</p></div>
                {tab === 'all' && <Chip tone={CORR_STATUS[c.status].tone}>{CORR_STATUS[c.status].label}</Chip>}
              </div>
              <p className="mt-2 text-sm"><b>{corrTimes(c)}</b></p>
              <p className="text-sm text-muted">{c.kind === 'both' ? 'Tidak ada presensi pada tanggal itu (lupa masuk dan pulang).' : 'Jam masuk sudah tercatat; hanya jam pulang yang diisi.'}</p>
              <p className="mt-2 text-sm" data-selectable><span className="text-muted">Alasan: </span>{c.reason}</p>
              {c.decision_notes && <p className="mt-1 text-sm"><span className="text-muted">Catatan HC: </span>{c.decision_notes}</p>}
              {c.status === 'pending' && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Button variant="secondary" onClick={() => setDecision({ item: c, approve: false })}>Tolak</Button>
                  <Button onClick={() => setDecision({ item: c, approve: true })}>Setujui</Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <DecisionSheet
        open={Boolean(decision)} onClose={() => setDecision(null)} approve={decision?.approve ?? true}
        title={decision?.approve ? 'Setujui koreksi?' : 'Tolak koreksi?'}
        summary={decision ? `${decision.item.employeeName} · ${decision.item.date} · ${corrTimes(decision.item)}` : undefined}
        onConfirm={(notes) => decide.mutateAsync({ id: decision!.item.id, approve: decision!.approve, notes })}
      />
    </div>
  );
}
