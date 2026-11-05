import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CORRECTION_MAX_DAYS_BACK, wibDateMinusDays } from '@hris/shared';
import { api } from '../lib/api';
import { fmtLongDate, fmtShortDate, fmtTime } from '../lib/attendance-types';
import { CORR_STATUS, corrTimes, type CorrectionItem } from '../lib/correction-types';
import RangeCalendar from '../components/RangeCalendar';
import { BottomBar, Button, Card, Chip, ErrorNote, Field, Input, Textarea } from '../ui';

const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

type State = { kind: 'both' } | { kind: 'out_only'; clockIn: string } | { kind: null; message: string };

/** Lupa presensi: jenis koreksi ditentukan dari data tanggal itu (tidak ada presensi -> masuk+pulang; ada masuk tanpa pulang -> hanya pulang). */
export default function AttendanceCorrection() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = todayWib();
  const minDate = wibDateMinusDays(today, CORRECTION_MAX_DAYS_BACK);
  const maxDate = wibDateMinusDays(today, 1);
  const initial = params.get('date') ?? '';
  const [date, setDate] = useState(initial >= minDate && initial <= maxDate ? initial : '');
  const [inTime, setInTime] = useState('');
  const [outTime, setOutTime] = useState('');
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);

  const state = useQuery({
    queryKey: ['corr-state', date], enabled: Boolean(date),
    queryFn: () => api<State>(`/attendance-corrections/state?date=${date}`),
  });
  const mine = useQuery({ queryKey: ['corr-mine'], queryFn: () => api<CorrectionItem[]>('/attendance-corrections/mine') });
  const s = state.data;

  const submit = useMutation({
    mutationFn: () => api('/attendance-corrections', { method: 'POST', json: { date, clockInTime: s?.kind === 'both' ? inTime : '', clockOutTime: outTime, reason } }),
    onSuccess: () => { setSent(true); setDate(''); setInTime(''); setOutTime(''); setReason(''); void qc.invalidateQueries({ queryKey: ['corr-mine'] }); },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/attendance-corrections/${id}/cancel`, { method: 'POST' }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['corr-mine'] }),
  });

  const ready = Boolean(s?.kind) && Boolean(outTime) && (s?.kind !== 'both' || Boolean(inTime)) && Boolean(reason.trim());
  const onSubmit = (e: FormEvent) => { e.preventDefault(); setSent(false); if (ready) submit.mutate(); };

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4">
        <p className="text-sm text-muted">Untuk tanggal yang sudah lewat (sampai {CORRECTION_MAX_DAYS_BACK} hari ke belakang). Disetujui HC; hasilnya diberi tanda "dikoreksi" karena tanpa foto dan lokasi. Aturan batas masuk 09:00 tetap berlaku pada jam yang Anda ajukan.</p>
        {sent && <p role="status" className="rounded-xl bg-ok-bg p-3 text-sm font-medium text-ok">Pengajuan terkirim. Menunggu persetujuan HC.</p>}

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Tanggal</p>
          <RangeCalendar value={date} min={minDate} max={maxDate} today={today} onChange={(d) => { setDate(d); setSent(false); }} />
          <p className="text-sm text-muted" role="status">{date ? `Dipilih: ${fmtLongDate(date)}` : `Pilih tanggal ${fmtShortDate(minDate)} sampai ${fmtShortDate(maxDate)}. Hari ini dan tanggal ke depan tidak bisa dipilih.`}</p>
        </div>

        {date && state.isPending && <p className="text-sm text-muted" role="status">Memeriksa presensi tanggal itu…</p>}
        <ErrorNote error={state.error} />
        {s?.kind === null && <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm text-bad">{s.message}</p>}
        {s?.kind === 'out_only' && <p role="status" className="rounded-xl bg-sub p-3 text-sm">Jam masuk tercatat <b>{fmtTime(s.clockIn)}</b> dan tidak dapat diubah. Isi hanya jam pulang.</p>}
        {s?.kind === 'both' && <p role="status" className="rounded-xl bg-sub p-3 text-sm">Tidak ada presensi pada tanggal ini. Isi jam masuk dan jam pulang.</p>}

        {s?.kind === 'both' && <Field label="Jam masuk (WIB)">{(id) => <Input id={id} type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} />}</Field>}
        {s?.kind && <Field label="Jam pulang (WIB)">{(id) => <Input id={id} type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} />}</Field>}
        {s?.kind && <Field label="Alasan">{(id) => <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>}

        <ErrorNote error={submit.error} />
        <BottomBar><Button type="submit" className="w-full" disabled={!ready} loading={submit.isPending}>Kirim pengajuan koreksi</Button></BottomBar>
      </form>

      {(mine.data?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Pengajuan saya</h2>
          <ul className="flex flex-col gap-2">
            {mine.data!.map((c) => (
              <li key={c.id}>
                <Card className="!p-3">
                  <div className="flex items-start justify-between gap-2"><p className="font-semibold">{fmtShortDate(c.date)}</p><Chip tone={CORR_STATUS[c.status].tone}>{CORR_STATUS[c.status].label}</Chip></div>
                  <p className="text-sm text-muted">{corrTimes(c)}</p>
                  {c.decision_notes && <p className="mt-1 text-sm"><span className="text-muted">HC: </span>{c.decision_notes}</p>}
                  {c.status === 'pending' && <Button variant="secondary" className="mt-2 w-full" loading={cancel.isPending && cancel.variables === c.id} onClick={() => cancel.mutate(c.id)}>Batalkan</Button>}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Button variant="ghost" onClick={() => navigate('/presensi')}>Kembali ke presensi</Button>
    </div>
  );
}
