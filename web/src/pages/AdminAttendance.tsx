import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { workDuration } from '@hris/shared';
import { api } from '../lib/api';
import AttachmentLink from '../components/AttachmentLink';
import { faceChip, recordChips, fmtLongDate, fmtTime, locationFlag, type AttendanceRec } from '../lib/attendance-types';
import { Button, Card, Chip, Empty, ErrorNote, Field, Input, Sheet, Spinner } from '../ui';

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

type FlagChip = { tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral'; text: string };
type FaceTries = Record<'in' | 'out', { total: number; failed: number }> | null;
/** Penanda satu baris presensi (dipakai daftar HP dan tabel desktop). */
const flagsFor = (r: AttendanceRec | null, faceTries: FaceTries): FlagChip[] => [...(r ? recordChips(r) : []), ...[locationFlag(r?.in ?? null), locationFlag(r?.out ?? null)].filter((x) => x && x.tone === 'warn'), faceChip(r?.in ?? null, 'Masuk'), faceChip(r?.out ?? null, 'Pulang'),
                // Percobaan verifikasi wajah yang gagal sebelum presensi dikirim (hanya terlihat oleh HC).
                ...(['in', 'out'] as const).map((k) => (faceTries && faceTries[k].failed > 0 ? { tone: 'warn', text: `${k === 'in' ? 'Masuk' : 'Pulang'}: ${faceTries[k].failed} percobaan wajah gagal (dari ${faceTries[k].total})` } : null))].filter(Boolean) as { tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral'; text: string }[];

type CancelTarget = { employeeId: string; name: string; type: 'in' | 'out'; time: string };

/** Tautan kecil "Batalkan" di sebelah jam masuk/pulang. Nonaktif bila belum boleh (pulang harus dibatalkan dulu sebelum masuk). */
function CancelLink({ onClick, disabled, hint }: { onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={hint}
      className="ml-2 inline-flex min-h-8 items-center text-xs font-semibold text-bad underline underline-offset-2 active:opacity-70 disabled:text-muted disabled:no-underline">
      Batalkan
    </button>
  );
}

/** Konfirmasi pembatalan: alasan wajib (masuk log audit), foto presensi ikut dihapus. */
function CancelSheet({ target, date, onClose }: { target: CancelTarget; date: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const label = target.type === 'in' ? 'masuk' : 'pulang';
  const m = useMutation({
    mutationFn: () => api('/attendance/admin/cancel', { method: 'POST', json: { employeeId: target.employeeId, date, type: target.type, reason: reason.trim() } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['att-admin', date] }); onClose(); },
  });
  return (
    <Sheet open onClose={onClose} title={`Batalkan presensi ${label}`}>
      <div className="mt-2 flex flex-col gap-3">
        <p className="text-sm">{target.name} · {label} pukul <b>{fmtTime(target.time)}</b>. Foto presensi ini ikut dihapus dan tidak bisa dikembalikan. Karyawan bisa presensi ulang setelahnya.</p>
        <Field label="Alasan" hint="Wajib diisi. Dicatat di log audit.">
          {(id, d) => <Input id={id} aria-describedby={d} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <ErrorNote error={m.error} />
        <Button variant="danger" loading={m.isPending} disabled={reason.trim().length < 3} onClick={() => m.mutate()}>Batalkan presensi {label}</Button>
      </div>
    </Sheet>
  );
}

/** HC: presensi semua karyawan aktif pada satu tanggal. */
export default function AdminAttendance() {
  const [params] = useSearchParams();
  const fromLink = params.get('date') ?? '';
  // Tanggal awal dapat datang dari tautan dashboard (?date=YYYY-MM-DD); nilai di luar batas diabaikan.
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(fromLink) && fromLink <= today() ? fromLink : today());
  const q = useQuery({
    queryKey: ['att-admin', date],
    queryFn: () => api<{ date: string; rows: { employeeId: string; name: string; record: AttendanceRec | null; faceTries: Record<'in' | 'out', { total: number; failed: number }> | null }[] }>(`/attendance/admin?date=${date}`),
  });
  const present = q.data?.rows.filter((r) => r.record?.clock_in).length ?? 0;
  const late = q.data?.rows.filter((r) => r.record && r.record.flags.lateMinutes > 0 && !r.record.flags.lateExcused).length ?? 0;
  const [target, setTarget] = useState<CancelTarget | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Field label="Tanggal">{(id) => <Input id={id} type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
      {q.isPending && <Spinner />}
      <ErrorNote error={q.error} />
      {q.data && (
        <>
          <p className="text-sm text-muted">{fmtLongDate(q.data.date)} · hadir {present} dari {q.data.rows.length} karyawan aktif{late > 0 ? ` · terlambat ${late}` : ''}</p>
          {q.data.rows.length === 0 && <Empty icon={<Users className="size-10" />}>Belum ada karyawan.</Empty>}
          {q.data.rows.length > 0 && (
            <div className="hidden overflow-hidden rounded-2xl bg-surface shadow-card lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-sub text-xs font-semibold text-muted">
                  <tr><th scope="col" className="px-4 py-3">Karyawan</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3">Masuk</th><th scope="col" className="px-4 py-3">Pulang</th><th scope="col" className="px-4 py-3">Durasi</th><th scope="col" className="px-4 py-3">Catatan</th><th scope="col" className="px-4 py-3">Foto</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {q.data.rows.map(({ employeeId, name, record: r, faceTries }) => (
                    <tr key={employeeId} className="align-top">
                      <th scope="row" className="px-4 py-3 font-semibold">{name}</th>
                      <td className="px-4 py-3">{!r ? <Chip>Belum presensi</Chip> : !r.clock_out ? <Chip tone="info">Belum pulang</Chip> : <Chip tone="ok">Selesai</Chip>}</td>
                      <td className="px-4 py-3 tabular-nums">{r ? fmtTime(r.clock_in) : '-'}{r?.clock_in && <CancelLink disabled={Boolean(r.clock_out)} hint={r.clock_out ? 'Batalkan presensi pulang dulu' : undefined} onClick={() => setTarget({ employeeId, name, type: 'in', time: r.clock_in! })} />}</td>
                      <td className="px-4 py-3 tabular-nums">{r ? fmtTime(r.clock_out) : '-'}{r?.clock_out && <CancelLink onClick={() => setTarget({ employeeId, name, type: 'out', time: r.clock_out! })} />}</td>
                      <td className="px-4 py-3 tabular-nums">{r?.clock_out ? workDuration(r.clock_in, r.clock_out) : '-'}</td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{flagsFor(r, faceTries).map((f, i) => <Chip key={i} tone={f.tone}>{f.text}</Chip>)}{r && (r.in?.face === false || r.out?.face === false) && <span className="text-muted">Wajah tidak terdeteksi otomatis pada salah satu foto.</span>}</div></td>
                      <td className="px-4 py-3"><div className="flex flex-col gap-1">{r?.in?.photo && <span className="flex items-center gap-1">Masuk <AttachmentLink fileKey={r.in.photo} /></span>}{r?.out?.photo && <span className="flex items-center gap-1">Pulang <AttachmentLink fileKey={r.out.photo} /></span>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ul className="flex flex-col gap-2 lg:hidden">
            {q.data.rows.map(({ employeeId, name, record: r, faceTries }) => {
              const flags = flagsFor(r, faceTries);
              return (
                <li key={employeeId}>
                  <Card accent={!r ? 'neutral' : !r.clock_out ? 'info' : 'ok'} className="!p-3 !pl-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{name}</p>
                      {!r ? <Chip>Belum presensi</Chip> : !r.clock_out ? <Chip tone="info">Belum pulang</Chip> : <Chip tone="ok">Selesai</Chip>}
                    </div>
                    {r && (
                      <>
                        <p className="text-sm">Masuk <b>{fmtTime(r.clock_in)}</b> · Pulang <b>{fmtTime(r.clock_out)}</b>{r.clock_out && <span className="text-muted"> · {workDuration(r.clock_in, r.clock_out)}</span>}</p>
                        <div className="-mt-1 flex flex-wrap">
                          {r.clock_in && <CancelLink disabled={Boolean(r.clock_out)} hint={r.clock_out ? 'Batalkan presensi pulang dulu' : undefined} onClick={() => setTarget({ employeeId, name, type: 'in', time: r.clock_in! })} />}
                          {r.clock_out && <CancelLink onClick={() => setTarget({ employeeId, name, type: 'out', time: r.clock_out! })} />}
                        </div>
                        {flags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{flags.map((f, i) => <Chip key={i} tone={f.tone}>{f.text}</Chip>)}</div>}
                        {(r.in?.face === false || r.out?.face === false) && <p className="mt-1 text-sm text-muted">Wajah tidak terdeteksi otomatis pada salah satu foto.</p>}
                        <div className="mt-1 flex flex-wrap gap-x-4">
                          {r.in?.photo && <span className="flex items-center gap-1 text-sm">Foto masuk <AttachmentLink fileKey={r.in.photo} /></span>}
                          {r.out?.photo && <span className="flex items-center gap-1 text-sm">Foto pulang <AttachmentLink fileKey={r.out.photo} /></span>}
                        </div>
                      </>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {target && <CancelSheet key={`${target.employeeId}-${target.type}`} target={target} date={date} onClose={() => setTarget(null)} />}
    </div>
  );
}
