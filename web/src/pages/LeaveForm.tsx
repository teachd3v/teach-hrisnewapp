import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { LEAVE_TYPES, calculateLeaveDuration, validateLeaveDates, type LeaveCategory } from '@hris/shared';
import { api } from '../lib/api';
import type { LeaveMeta } from '../lib/leave-types';
import { BottomBar, Button, ErrorNote, Field, Input, Select, Spinner, Textarea } from '../ui';

const MAX_FILE = 5 * 1024 * 1024;

export default function LeaveForm() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [type, setType] = useState<LeaveCategory>('Cuti Tahunan');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const year = start ? Number(start.slice(0, 4)) : new Date().getFullYear();
  const meta = useQuery({ queryKey: ['leave-meta', year], queryFn: () => api<LeaveMeta>(`/leave/meta?year=${year}`) });

  const typeMeta = LEAVE_TYPES.find((t) => t.key === type)!;
  const holidays = useMemo(() => new Set((meta.data?.holidays ?? []).map((h) => h.date)), [meta.data]);
  const dateError = start && end ? validateLeaveDates(type, start, end, holidays) : null;
  const days = start && end && !dateError ? calculateLeaveDuration(type, start, end, holidays) : 0;
  const balance = meta.data?.balances.find((b) => b.type === type);
  const overQuota = balance?.remaining != null && days > balance.remaining;
  const genderBlocked = Boolean(typeMeta.gender && meta.data?.gender && meta.data.gender !== typeMeta.gender);
  const needsFile = Boolean(typeMeta.requiresAttachment);

  const submit = useMutation({
    mutationFn: async () => {
      let attachmentKey = '';
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        attachmentKey = (await api<{ key: string }>('/leave/attachments', { method: 'POST', body: fd })).key;
      }
      try {
        return await api('/leave', { method: 'POST', json: { leaveType: type, startDate: start, endDate: end, startTime, endTime, reason, attachmentKey } });
      } catch (e) {
        if (attachmentKey) await api(`/leave/attachments?key=${encodeURIComponent(attachmentKey)}`, { method: 'DELETE' }).catch(() => {});
        throw e;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leave-mine'] });
      void qc.invalidateQueries({ queryKey: ['leave-meta'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      navigate('/cuti', { replace: true, state: { flash: 'Pengajuan terkirim. Menunggu persetujuan atasan.' } });
    },
  });

  const blocked = !start || !end || !reason.trim() || Boolean(dateError) || overQuota || genderBlocked || meta.data?.canSubmit === false
    || (typeMeta.timeBased && (!startTime || !endTime)) || (needsFile && !file);

  function onSubmit(e: FormEvent) { e.preventDefault(); if (!blocked) submit.mutate(); }
  function onFile(f: File | null) {
    if (f && f.size > MAX_FILE) { setFile(null); setFileError('Berkas terlalu besar (maks. 5 MB)'); return; }
    setFileError(null); setFile(f);
  }

  if (meta.isPending) return <Spinner />;
  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4">
      {meta.data?.canSubmit === false && <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm text-bad">Atasan langsung Anda belum ditetapkan. Hubungi HC/Admin sebelum mengajukan cuti.</p>}

      <Field label="Jenis cuti" hint={typeMeta.desc} error={genderBlocked ? `${typeMeta.label} hanya untuk karyawan ${typeMeta.gender}.` : null}>
        {(id, d) => <Select id={id} aria-describedby={d} value={type} onChange={(e) => setType(e.target.value as LeaveCategory)}>{LEAVE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Mulai">{(id) => <Input id={id} type="date" value={start} onChange={(e) => { setStart(e.target.value); if (!end || e.target.value > end || typeMeta.timeBased) setEnd(e.target.value); }} />}</Field>
        <Field label="Selesai">{(id) => <Input id={id} type="date" value={end} min={start} disabled={typeMeta.timeBased} onChange={(e) => setEnd(e.target.value)} />}</Field>
      </div>
      {typeMeta.timeBased && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jam mulai">{(id) => <Input id={id} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />}</Field>
          <Field label="Jam selesai">{(id) => <Input id={id} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />}</Field>
        </div>
      )}

      {dateError && <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm text-bad">{dateError}</p>}
      {!dateError && days > 0 && (
        <p role="status" className={`rounded-xl p-3 text-sm ${overQuota ? 'bg-bad-bg text-bad' : 'bg-sub'}`}>
          Durasi <b>{days} hari kerja</b>{balance?.remaining != null && <> · sisa kuota {Math.max(balance.remaining, 0)} hari</>}
          {overQuota && <>. Melebihi sisa kuota, pengajuan tidak dapat dikirim.</>}
        </p>
      )}

      <Field label="Alasan">{(id) => <Textarea id={id} rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>

      <Field label={needsFile ? 'Lampiran (wajib)' : 'Lampiran (opsional)'} hint={needsFile ? 'Surat keterangan dokter. PDF, JPG, PNG, atau WEBP, maks. 5 MB.' : 'PDF, JPG, PNG, atau WEBP, maks. 5 MB.'} error={fileError}>
        {(id, d) => (
          <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-field px-3 py-2 active:bg-sub">
            <Paperclip className="size-5 shrink-0" aria-hidden="true" />
            <span className="truncate">{file ? file.name : 'Pilih berkas'}</span>
            <input id={id} aria-describedby={d} type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </Field>

      <ErrorNote error={submit.error} />
      <BottomBar><Button type="submit" className="w-full" disabled={blocked} loading={submit.isPending}>Kirim pengajuan</Button></BottomBar>
    </form>
  );
}
