import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LEAVE_TYPES, PENDING_STATUSES, calculateLeaveDuration, validateLeaveDates, type LeaveCategory } from '@hris/shared';
import { api } from '../lib/api';
import { STATUS_LABEL, fmtRange, type LeaveItem, type LeaveMeta } from '../lib/leave-types';
import AttachmentLink from '../components/AttachmentLink';

export default function Leave() {
  const qc = useQueryClient();
  const [type, setType] = useState<LeaveCategory>('Cuti Tahunan');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const year = start ? Number(start.slice(0, 4)) : new Date().getFullYear();
  const meta = useQuery({ queryKey: ['leave-meta', year], queryFn: () => api<LeaveMeta>(`/leave/meta?year=${year}`) });
  const mine = useQuery({ queryKey: ['leave-mine'], queryFn: () => api<LeaveItem[]>('/leave/mine') });

  const typeMeta = LEAVE_TYPES.find((t) => t.key === type)!;
  const holidays = useMemo(() => new Set((meta.data?.holidays ?? []).map((h) => h.date)), [meta.data]);
  const dateError = start && end ? validateLeaveDates(type, start, end, holidays) : null;
  const days = start && end && !dateError ? calculateLeaveDuration(type, start, end, holidays) : 0;
  const balance = meta.data?.balances.find((b) => b.type === type);
  const overQuota = balance?.remaining != null && days > balance.remaining;
  const genderBlocked = Boolean(typeMeta.gender && meta.data?.gender && meta.data.gender !== typeMeta.gender);

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
        // Pengajuan gagal: buang unggahan yang tidak terpakai.
        if (attachmentKey) await api(`/leave/attachments?key=${encodeURIComponent(attachmentKey)}`, { method: 'DELETE' }).catch(() => {});
        throw e;
      }
    },
    onSuccess: () => {
      setStart(''); setEnd(''); setReason(''); setFile(null); setFileInputKey((k) => k + 1); setStartTime(''); setEndTime(''); setError(null);
      void qc.invalidateQueries({ queryKey: ['leave-mine'] });
      void qc.invalidateQueries({ queryKey: ['leave-meta'] });
    },
    onError: (e) => setError((e as Error).message),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/leave/${id}/cancel`, { method: 'POST' }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['leave-mine'] }); void qc.invalidateQueries({ queryKey: ['leave-meta'] }); },
    onError: (e) => setError((e as Error).message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    submit.mutate();
  }

  const blocked = !start || !end || !reason.trim() || Boolean(dateError) || overQuota || genderBlocked || meta.data?.canSubmit === false || submit.isPending || (typeMeta.requiresAttachment && !file)
    || (typeMeta.timeBased && (!startTime || !endTime));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cuti</h1>
        <Link to="/" className="text-sm underline">Beranda</Link>
      </header>

      {meta.data?.canSubmit === false && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">Atasan langsung Anda belum ditetapkan. Hubungi HC/Admin sebelum mengajukan cuti.</p>
      )}

      <section className="grid grid-cols-2 gap-2 text-sm">
        {meta.data?.balances.filter((b) => b.quota !== null).map((b) => (
          <div key={b.type} className="rounded border p-2">
            <div className="text-xs text-gray-500">{b.type}</div>
            <div className="font-medium">{b.remaining} hari tersisa</div>
            <div className="text-xs text-gray-500">terpakai {b.used}{b.pending ? ` · menunggu ${b.pending}` : ''} / {b.quota}</div>
          </div>
        ))}
      </section>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded border p-3">
        <h2 className="font-medium">Ajukan cuti</h2>
        <select className="rounded border p-2" value={type} onChange={(e) => setType(e.target.value as LeaveCategory)}>
          {LEAVE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <p className="text-xs text-gray-500">{typeMeta.desc}</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">Mulai<input className="mt-1 w-full rounded border p-2 text-sm" type="date" value={start} onChange={(e) => { setStart(e.target.value); if (!end || e.target.value > end || typeMeta.timeBased) setEnd(e.target.value); }} /></label>
          <label className="text-xs">Selesai<input className="mt-1 w-full rounded border p-2 text-sm" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        {typeMeta.timeBased && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Jam mulai<input className="mt-1 w-full rounded border p-2 text-sm" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
            <label className="text-xs">Jam selesai<input className="mt-1 w-full rounded border p-2 text-sm" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
          </div>
        )}
        {dateError && <p role="alert" className="text-xs text-red-600">{dateError}</p>}
        {!dateError && days > 0 && <p className="text-sm">Durasi: <b>{days} hari kerja</b></p>}
        {overQuota && <p role="alert" className="text-xs text-red-600">Melebihi sisa kuota ({Math.max(balance!.remaining!, 0)} hari). Pengajuan tidak dapat dikirim.</p>}
        {genderBlocked && <p role="alert" className="text-xs text-red-600">{typeMeta.label} hanya untuk karyawan {typeMeta.gender}.</p>}
        <label className="text-xs">
          {typeMeta.requiresAttachment ? 'Lampiran (wajib, surat keterangan)' : 'Lampiran (opsional)'}
          <input key={fileInputKey} className="mt-1 w-full text-sm" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f && f.size > 5 * 1024 * 1024 ? null : f); if (f && f.size > 5 * 1024 * 1024) setError('Berkas terlalu besar (maks. 5 MB)'); }} />
        </label>
        <textarea className="rounded border p-2 text-sm" rows={3} maxLength={1000} placeholder="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={blocked} className="rounded bg-black p-2 text-white disabled:opacity-40">{submit.isPending ? 'Mengirim…' : 'Kirim'}</button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Riwayat</h2>
        {mine.data?.length === 0 && <p className="text-sm text-gray-500">Belum ada pengajuan.</p>}
        {mine.data?.map((r) => (
          <article key={r.id} className="rounded border p-3 text-sm">
            <div className="flex justify-between"><b>{r.leave_type}</b><span>{STATUS_LABEL[r.status]}</span></div>
            <div className="text-gray-600">{fmtRange(r)} · {r.total_days} hari</div>
            {r.attachment_key && <AttachmentLink fileKey={r.attachment_key} />}
            {r.manager_notes && <div className="mt-1 text-xs">Atasan: {r.manager_notes}</div>}
            {r.hc_override && <div className="mt-1 text-xs">Diputuskan langsung oleh HC.</div>}
            {r.hc_notes && <div className="mt-1 text-xs">HC: {r.hc_notes}</div>}
            {PENDING_STATUSES.includes(r.status) && (
              <button className="mt-2 rounded border px-2 py-1 text-xs" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>Batalkan</button>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
