import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ListX, Plus } from 'lucide-react';
import { GENDERS, isValidQuota, type LeaveTypeMeta } from '@hris/shared';
import { api } from '../lib/api';
import { useLeaveTypes } from '../lib/leave-types';
import { optionsOf, useMaster } from '../lib/master';
import { Button, Card, Chip, Empty, ErrorNote, Field, Input, Select, Sheet, Spinner, Textarea } from '../ui';

type Row = LeaveTypeMeta & { usedBy: number };

interface Form { label: string; description: string; quota: string; requiresAttachment: boolean; timeBased: boolean; gender: string; statusIds: string[] }
const EMPTY: Form = { label: '', description: '', quota: '', requiresAttachment: false, timeBased: false, gender: '', statusIds: [] };
const toForm = (t: Row): Form => ({
  label: t.label, description: t.description, quota: t.defaultQuota === null ? '' : String(t.defaultQuota),
  requiresAttachment: t.requiresAttachment, timeBased: t.timeBased, gender: t.gender ?? '', statusIds: t.allowedStatusIds ?? [],
});
/** Kosong = tanpa batas (null); selain itu angka 0-366 kelipatan 0,5. `undefined` = tidak valid. */
const parseQuota = (v: string): number | null | undefined => {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return isValidQuota(n) ? n : undefined;
};

/** Kelola jenis cuti beserta kuota bawaannya (hanya super admin). Tab "Cuti" di Data master. */
export default function AdminLeaveTypes() {
  const qc = useQueryClient();
  const q = useLeaveTypes();
  const items = (q.data ?? []) as Row[];
  const master = useMaster();
  const statuses = optionsOf(master.data, 'employment_status');
  const statusName = (id: string) => statuses.find((s) => s.id === id)?.name ?? '?';
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const refresh = () => qc.invalidateQueries({ queryKey: ['leave-types'] });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const quota = parseQuota(f.quota);

  const payload = () => ({
    label: f.label, description: f.description, defaultQuota: quota, requiresAttachment: f.requiresAttachment,
    gender: f.gender || null, allowedStatusIds: f.statusIds.length ? f.statusIds : null,
  });
  const save = useMutation({
    mutationFn: () => (editing === 'new'
      ? api('/leave-types', { method: 'POST', json: { ...payload(), timeBased: f.timeBased } })
      : api(`/leave-types/${encodeURIComponent((editing as Row).key)}`, { method: 'PATCH', json: payload() })),
    onSuccess: () => { setEditing(null); void refresh(); },
  });
  const toggleActive = useMutation({
    mutationFn: (t: Row) => api(`/leave-types/${encodeURIComponent(t.key)}`, { method: 'PATCH', json: { active: !t.active } }),
    onSuccess: () => { setEditing(null); void refresh(); },
  });
  const del = useMutation({
    mutationFn: (t: Row) => api(`/leave-types/${encodeURIComponent(t.key)}`, { method: 'DELETE' }),
    onSuccess: () => { setEditing(null); void refresh(); },
  });
  const reorder = useMutation({
    mutationFn: (keys: string[]) => api('/leave-types/order', { method: 'PUT', json: { keys } }),
    onSettled: () => void refresh(),
  });

  function move(i: number, dir: -1 | 1) {
    const keys = items.map((t) => t.key);
    const j = i + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j]!, keys[i]!];
    reorder.mutate(keys);
  }
  function open(t: Row | 'new') {
    setEditing(t); setF(t === 'new' ? EMPTY : toForm(t));
    save.reset(); toggleActive.reset(); del.reset();
  }
  function onSubmit(e: FormEvent) { e.preventDefault(); if (f.label.trim() && quota !== undefined) save.mutate(); }

  const isNew = editing === 'new';
  const row = editing && editing !== 'new' ? editing : null;
  const quotaText = (t: Row) => (t.defaultQuota === null ? 'Tanpa batas' : `${t.defaultQuota} hari/tahun`);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Jenis cuti yang dapat diajukan karyawan dan kuota bawaan per tahun. Kuota khusus per karyawan tetap diatur di menu Kuota cuti.
        Mengganti nama tidak memutus riwayat pengajuan. Jenis yang pernah dipakai tidak bisa dihapus, hanya dinonaktifkan.
      </p>
      {q.isPending && <Spinner />}
      <ErrorNote error={q.error} />
      <ErrorNote error={reorder.error} />
      {q.data && items.length === 0 && <Empty icon={<ListX className="size-10" />}>Belum ada jenis cuti.</Empty>}
      <ul className="flex flex-col gap-2 pb-20">
        {items.map((t, i) => (
          <li key={t.key}>
            <Card className="flex items-center gap-1 !p-2">
              <button onClick={() => open(t)} className={`flex min-h-12 flex-1 flex-col items-start justify-center gap-1 rounded-xl px-2 py-1 text-left active:bg-sub ${t.active ? '' : 'opacity-60'}`}>
                <span className="font-semibold">{t.label}</span>
                <span className="text-sm text-muted">{quotaText(t)}{t.usedBy > 0 ? ` · ${t.usedBy} pengajuan` : ''}</span>
                <span className="flex flex-wrap gap-1">
                  {!t.active && <Chip>Nonaktif</Chip>}
                  {t.timeBased && <Chip tone="info">Per jam</Chip>}
                  {t.requiresAttachment && <Chip tone="info">Wajib lampiran</Chip>}
                  {t.gender && <Chip tone="info">{t.gender}</Chip>}
                  {t.allowedStatusIds && <Chip tone="info">{t.allowedStatusIds.map(statusName).join(', ')}</Chip>}
                </span>
              </button>
              <button aria-label={`Naikkan ${t.label}`} disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} className="grid size-12 place-items-center rounded-full active:bg-sub disabled:opacity-30"><ArrowUp className="size-5" aria-hidden="true" /></button>
              <button aria-label={`Turunkan ${t.label}`} disabled={i === items.length - 1 || reorder.isPending} onClick={() => move(i, 1)} className="grid size-12 place-items-center rounded-full active:bg-sub disabled:opacity-30"><ArrowDown className="size-5" aria-hidden="true" /></button>
            </Card>
          </li>
        ))}
      </ul>
      <button aria-label="Tambah jenis cuti" onClick={() => open('new')}
        className="pb-safe fixed right-4 bottom-6 z-10 grid size-14 place-items-center rounded-full bg-primary text-primary-fg shadow-lg active:bg-black"><Plus className="size-7" aria-hidden="true" /></button>

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={isNew ? 'Tambah jenis cuti' : row ? `Ubah ${row.label}` : ''}>
        {editing && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Nama">{(id) => <Input id={id} required maxLength={60} value={f.label} onChange={(e) => set('label', e.target.value)} />}</Field>
            <Field label="Keterangan" hint="Tampil di form pengajuan.">{(id, d) => <Textarea id={id} aria-describedby={d} rows={2} maxLength={200} value={f.description} onChange={(e) => set('description', e.target.value)} />}</Field>
            <Field label="Kuota bawaan per tahun (hari)" hint="Kosongkan untuk tanpa batas. Kelipatan 0,5, maksimal 366." error={quota === undefined ? 'Isi 0-366, kelipatan 0,5' : null}>
              {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={f.quota} onChange={(e) => set('quota', e.target.value)} />}
            </Field>
            <Field label="Berlaku untuk">{(id) => (
              <Select id={id} value={f.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Semua karyawan</option>
                {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            )}</Field>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-base font-medium">Status karyawan yang boleh mengajukan</legend>
              <p className="text-sm text-muted">{f.statusIds.length === 0 ? 'Tidak ada yang dicentang: semua status boleh mengajukan.' : 'Hanya status yang dicentang yang melihat dan boleh mengajukan jenis ini.'}</p>
              {statuses.filter((s) => s.active || f.statusIds.includes(s.id)).map((s) => (
                <label key={s.id} className="flex min-h-12 items-center gap-3">
                  <input type="checkbox" className="size-5" checked={f.statusIds.includes(s.id)}
                    onChange={(e) => set('statusIds', e.target.checked ? [...f.statusIds, s.id] : f.statusIds.filter((x) => x !== s.id))} />
                  <span>{s.name}{s.active ? '' : ' (nonaktif)'}</span>
                </label>
              ))}
            </fieldset>
            <label className="flex min-h-12 items-center gap-3">
              <input type="checkbox" className="size-5" checked={f.requiresAttachment} onChange={(e) => set('requiresAttachment', e.target.checked)} />
              <span>Wajib lampiran dokumen</span>
            </label>
            <label className="flex min-h-12 items-start gap-3">
              <input type="checkbox" className="mt-3 size-5" checked={f.timeBased} disabled={!isNew} onChange={(e) => set('timeBased', e.target.checked)} />
              <span className="py-2.5">
                Izin per jam (satu tanggal dengan jam mulai dan selesai, dihitung 1 hari)
                {!isNew && <span className="block text-sm text-muted">Tidak dapat diubah setelah dibuat.</span>}
              </span>
            </label>
            {isNew && f.timeBased && <p className="text-sm text-muted">Jenis per jam buatan sendiri tidak memengaruhi penilaian terlambat/pulang cepat di presensi; itu hanya berlaku untuk jenis bawaan.</p>}

            <ErrorNote error={save.error ?? toggleActive.error ?? del.error} />
            <Button type="submit" loading={save.isPending} disabled={!f.label.trim() || quota === undefined}>Simpan</Button>
            {row && (
              <>
                <Button variant="secondary" loading={toggleActive.isPending} onClick={() => toggleActive.mutate(row)}>{row.active ? 'Nonaktifkan' : 'Aktifkan kembali'}</Button>
                {!row.system && row.usedBy === 0 && <Button variant="danger" loading={del.isPending} onClick={() => del.mutate(row)}>Hapus permanen</Button>}
                {row.system && <p className="text-sm text-muted">Jenis bawaan sistem: tidak dapat dihapus, dan perilakunya (presensi, laporan, potongan cuti bersama) tetap terikat padanya.</p>}
              </>
            )}
          </form>
        )}
      </Sheet>
    </div>
  );
}
