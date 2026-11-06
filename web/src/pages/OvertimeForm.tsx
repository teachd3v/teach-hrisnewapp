import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OVERTIME_DAYS_AHEAD, OVERTIME_DAYS_BACK, OVERTIME_KINDS, creditPreview, fmtMinutes, minutesBetween, validateOvertime, type OvertimeKind } from '@hris/shared';
import { api } from '../lib/api';
import type { OvertimeMeta } from '../lib/overtime';
import { BottomBar, Button, ErrorNote, Field, Input, Select, Spinner, Textarea } from '../ui';

/** Ajukan overtime: Lembur (hari kerja) atau Kerja di Hari Libur. Yang disetujui HC mengisi kuota Ganti Hari otomatis. */
export default function OvertimeForm() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const meta = useQuery({ queryKey: ['overtime-meta'], queryFn: () => api<OvertimeMeta>('/overtime/meta') });
  const [kind, setKind] = useState<OvertimeKind>('lembur');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');

  const holidaySet = useMemo(() => new Set((meta.data?.holidays ?? []).map((h) => h.date)), [meta.data]);
  const minutes = startTime && endTime ? minutesBetween(startTime, endTime) : null;
  const ready = Boolean(date && startTime && endTime && meta.data);
  const error = ready ? validateOvertime({ kind, date, startTime, endTime }, meta.data!.today, holidaySet.has(date)) : null;
  const kindMeta = OVERTIME_KINDS.find((k) => k.key === kind)!;

  const submit = useMutation({
    mutationFn: () => api('/overtime', { method: 'POST', json: { kind, date, startTime, endTime, reason } }),
    onSuccess: () => {
      for (const k of ['overtime-mine', 'overtime-approvals', 'notifications']) void qc.invalidateQueries({ queryKey: [k] });
      navigate('/cuti?riwayat=overtime', { replace: true, state: { flash: 'Overtime terkirim. Menunggu persetujuan atasan.' } });
    },
  });
  const blocked = !ready || Boolean(error) || !reason.trim() || meta.data?.canSubmit === false;
  const onSubmit = (e: FormEvent) => { e.preventDefault(); if (!blocked) submit.mutate(); };

  if (meta.isPending) return <Spinner />;
  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4">
      {meta.data?.canSubmit === false && <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm text-bad">Atasan langsung Anda belum ditetapkan. Hubungi HC/Admin sebelum mengajukan overtime.</p>}
      <ErrorNote error={meta.error} />

      <Field label="Jenis overtime" hint={kindMeta.hint}>
        {(id, d) => <Select id={id} aria-describedby={d} value={kind} onChange={(e) => setKind(e.target.value as OvertimeKind)}>{OVERTIME_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</Select>}
      </Field>
      <Field label="Tanggal" hint={`Boleh sampai ${OVERTIME_DAYS_BACK} hari ke belakang dan ${OVERTIME_DAYS_AHEAD} hari ke depan.`}>
        {(id, d) => <Input id={id} aria-describedby={d} type="date" min={meta.data?.from} max={meta.data?.to} value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jam mulai">{(id) => <Input id={id} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />}</Field>
        <Field label="Jam selesai">{(id) => <Input id={id} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />}</Field>
      </div>

      {error && <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm text-bad">{error}</p>}
      {!error && ready && minutes !== null && (
        <p role="status" className="rounded-xl bg-sub p-3 text-sm">Durasi <b>{fmtMinutes(minutes)}</b>. {creditPreview(kind, minutes)}.</p>
      )}
      {!ready && <p className="text-sm text-muted">Minimal {meta.data ? meta.data.rules.minMinutes / 60 : 4} jam per pengajuan. Overtime yang disetujui HC menambah kuota Ganti Hari; kredit berlaku sampai 31 Maret tahun berikutnya.</p>}

      <Field label="Alasan / pekerjaan yang dilakukan">{(id) => <Textarea id={id} rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      <ErrorNote error={submit.error} />
      <BottomBar><Button type="submit" className="w-full" disabled={blocked} loading={submit.isPending}>Kirim pengajuan</Button></BottomBar>
    </form>
  );
}
