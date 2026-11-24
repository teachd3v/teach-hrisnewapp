import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CheckCircle2, ScanFace, Trash2 } from 'lucide-react';
import type { FaceSettings } from '@hris/shared';
import { api } from '../lib/api';
import { fmtDate } from '../lib/leave-types';
import type { FaceTemplateInfo } from '../lib/face-status';
import AttachmentLink from '../components/AttachmentLink';
import { Button, Card, Chip, Empty, ErrorNote, Sheet, Spinner, Textarea } from '../ui';

/** `live`: skor wajah asli saat pendaftaran (0-1); null bila tidak tersedia. */
interface PendingRow extends FaceTemplateInfo { employeeId: string; name: string; photoKey: string; ktpKey: string | null; live: number | null; replacing: boolean }
interface ApprovedRow extends FaceTemplateInfo { employeeId: string; name: string }
interface MissingRow { id: string; name: string }
interface AdminData { settings: FaceSettings; coverage: { enrolled: number; active: number; outdated?: number }; missing?: MissingRow[]; pending: PendingRow[]; approved: ApprovedRow[] }

/** HC: antrean pendaftaran wajah (cocokkan foto referensi dengan KTP), daftar yang aktif, pengingat daftar ulang, dan reset. */
export default function AdminFace() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['face-admin'], queryFn: () => api<AdminData>('/face/admin') });
  const [deciding, setDeciding] = useState<{ row: PendingRow; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [resetting, setResetting] = useState<ApprovedRow | null>(null);
  const [confirmRemind, setConfirmRemind] = useState(false);
  const [remindResult, setRemindResult] = useState<{ notified: number; pushed: number } | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['face-admin'] }); void qc.invalidateQueries({ queryKey: ['face-status'] }); void qc.invalidateQueries({ queryKey: ['notifications'] }); };

  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean; note: string }) => api(`/face/${v.id}/decision`, { method: 'POST', json: { approve: v.approve, note: v.note } }),
    onSuccess: () => { setDeciding(null); setNote(''); refresh(); },
  });
  const reset = useMutation({
    mutationFn: (employeeId: string) => api(`/face/employee/${employeeId}`, { method: 'DELETE' }),
    onSuccess: () => { setResetting(null); refresh(); },
  });
  const remind = useMutation({
    mutationFn: () => api<{ ok: true; notified: number; pushed: number }>('/face/remind-reenroll', { method: 'POST' }),
    onSuccess: (res) => { setConfirmRemind(false); setRemindResult({ notified: res.notified, pushed: res.pushed }); refresh(); },
  });

  if (q.isPending) return <Spinner />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const d = q.data;
  const missing = d.missing ?? [];
  const modeText = d.settings.mode === 'off' ? 'Verifikasi wajah belum diaktifkan (Akun > Pengaturan presensi).' : 'Verifikasi wajah aktif: hasil hanya ditandai, presensi tidak ditolak.';

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-2">
        <p className="font-semibold">Terdaftar {d.coverage.enrolled} dari {d.coverage.active} karyawan aktif</p>
        <p className="text-sm text-muted">{modeText}</p>
        {(d.coverage.outdated ?? 0) > 0 && (
          <p className="rounded-xl bg-warn-bg p-2.5 text-sm text-warn">
            {d.coverage.outdated} karyawan masih memakai pendaftaran model lama dan perlu daftar ulang 1 foto.
          </p>
        )}
        {remindResult && (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-ok-bg p-2.5 text-sm font-medium text-ok">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            Pengingat terkirim ke {remindResult.notified} karyawan ({remindResult.pushed} notifikasi push HP).
          </p>
        )}
        {d.settings.mode !== 'off' && missing.length > 0 && (
          <Button variant="secondary" onClick={() => { remind.reset(); setRemindResult(null); setConfirmRemind(true); }}>
            <BellRing className="size-5" aria-hidden="true" />Kirim pengingat daftar ulang ({missing.length} orang)
          </Button>
        )}
      </Card>

      <section aria-labelledby="pend-h" className="flex flex-col gap-3">
        <h2 id="pend-h" className="text-lg font-semibold">Menunggu pencocokan ({d.pending.length})</h2>
        {d.pending.length === 0 && <Empty icon={<ScanFace className="size-10" />}>Tidak ada pendaftaran yang menunggu.</Empty>}
        <ul className="flex flex-col gap-2">
          {d.pending.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-2 !p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{r.name}</p>
                  <span className="text-xs text-muted">{fmtDate(r.createdAt.slice(0, 10))}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Chip tone="info">{r.sampleCount} sampel</Chip>
                  {r.replacing && <Chip tone="warn">Menggantikan pendaftaran lama</Chip>}
                  {!r.ktpKey && <Chip tone="bad">KTP belum diunggah</Chip>}
                  {r.live !== null && r.live < d.settings.liveThreshold && <Chip tone="warn">Diduga foto/layar, periksa lebih teliti</Chip>}
                </div>
                <div className="flex flex-wrap gap-x-4">
                  <AttachmentLink fileKey={r.photoKey} label="Lihat foto wajah" />
                  {r.ktpKey && <AttachmentLink fileKey={r.ktpKey} label="Lihat KTP" />}
                </div>
                <p className="text-xs text-muted">Bandingkan wajah pada foto dengan foto di KTP. Akses Anda ke foto dan KTP tercatat di log audit.</p>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="secondary" onClick={() => { setNote(''); decide.reset(); setDeciding({ row: r, approve: false }); }}>Tolak</Button>
                  <Button onClick={() => { setNote(''); decide.reset(); setDeciding({ row: r, approve: true }); }}>Setujui</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="appr-h" className="flex flex-col gap-3">
        <h2 id="appr-h" className="text-lg font-semibold">Aktif ({d.approved.length})</h2>
        <ul className="flex flex-col gap-2">
          {d.approved.map((r) => (
            <li key={r.id}>
              <Card className="flex items-center gap-3 !p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="text-xs text-muted">Disetujui {r.decidedAt ? fmtDate(r.decidedAt.slice(0, 10)) : '-'} · {r.sampleCount} sampel</p>
                </div>
                <Button variant="secondary" onClick={() => { reset.reset(); setResetting(r); }}><Trash2 className="size-5" aria-hidden="true" />Reset</Button>
              </Card>
            </li>
          ))}
          {d.approved.length === 0 && <p className="text-sm text-muted">Belum ada karyawan yang aktif.</p>}
        </ul>
      </section>

      <Sheet open={Boolean(deciding)} onClose={() => setDeciding(null)} title={deciding?.approve ? `Setujui ${deciding.row.name}?` : `Tolak ${deciding?.row.name ?? ''}?`}>
        {deciding && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">{deciding.approve ? 'Wajah pada foto sudah sesuai dengan KTP. Verifikasi presensi akan memakai pendaftaran ini.' : 'Tulis alasan agar karyawan tahu apa yang perlu diperbaiki (mis. foto buram, wajah tidak sesuai KTP).'}</p>
            {!deciding.approve && <Textarea aria-label="Alasan penolakan" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
            <ErrorNote error={decide.error} />
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setDeciding(null)}>Batal</Button>
              <Button variant={deciding.approve ? 'primary' : 'danger'} loading={decide.isPending} disabled={!deciding.approve && !note.trim()} onClick={() => decide.mutate({ id: deciding.row.id, approve: deciding.approve, note })}>{deciding.approve ? 'Setujui' : 'Tolak'}</Button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={Boolean(resetting)} onClose={() => setResetting(null)} title={`Reset wajah ${resetting?.name ?? ''}?`}>
        {resetting && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">Template dan foto referensi dihapus permanen. Karyawan perlu mendaftar ulang; sampai saat itu presensinya ditandai "wajah tidak dinilai".</p>
            <ErrorNote error={reset.error} />
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setResetting(null)}>Batal</Button>
              <Button variant="danger" loading={reset.isPending} onClick={() => reset.mutate(resetting.employeeId)}>Reset</Button>
            </div>
          </div>
        )}
      </Sheet>
      <Sheet open={confirmRemind} onClose={() => setConfirmRemind(false)} title={`Kirim pengingat ke ${missing.length} karyawan?`}>
        <div className="flex flex-col gap-3">
          <p className="text-sm">Notifikasi aplikasi dan push HP akan dikirim ke karyawan aktif yang belum mengirim pendaftaran wajah terbaru (yang sudah mengirim atau disetujui tidak dikirimi lagi):</p>
          <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-xl bg-sub px-3 text-sm">
            {missing.map((m) => <li key={m.id} className="py-2">{m.name}</li>)}
          </ul>
          <ErrorNote error={remind.error} />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setConfirmRemind(false)}>Batal</Button>
            <Button loading={remind.isPending} onClick={() => remind.mutate()}>Kirim sekarang</Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
