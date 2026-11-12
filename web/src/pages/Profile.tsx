import { useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, FileText, Pencil, Plus, ShieldCheck, Upload } from 'lucide-react';
import {
  DOCUMENT_CATEGORIES, DOCUMENT_TITLE_MAX, MAX_DOCUMENT_BYTES, PERSONAL_FIELDS, PROFILE_GROUPS, PROFILE_SECTIONS, documentCategory, maskTail,
  type FieldDef, type ProfileGroup, type SectionDef,
} from '@hris/shared';
import { api } from '../lib/api';
import { fmtDate } from '../lib/leave-types';
import { squarePhoto, useProfile, type ProfileData } from '../lib/profile';
import AttachmentLink from '../components/AttachmentLink';
import ProfilePhoto from '../components/ProfilePhoto';
import { Button, Card, Chip, ErrorNote, Field, Input, Segmented, Select, Sheet, Spinner, Textarea } from '../ui';

type Values = Record<string, string>;
const toValues = (defs: readonly FieldDef[], src: Record<string, string | null | undefined>): Values => Object.fromEntries(defs.map((f) => [f.key, src[f.key] ?? '']));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const show = (def: FieldDef | undefined, v: string | null | undefined) => (!v ? '' : def?.type === 'date' && ISO.test(v) ? fmtDate(v) : def?.sensitive ? maskTail(v) : v);

/** Satu kolom form menurut definisinya (text, textarea, tanggal, tahun, pilihan, angka). */
function FieldInput({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={def.required ? def.label : `${def.label}`} hint={def.hint}>
      {(id, d) => {
        switch (def.type) {
          case 'textarea': return <Textarea id={id} aria-describedby={d} rows={3} maxLength={def.max} value={value} onChange={(e) => onChange(e.target.value)} />;
          case 'select': return (
            <Select id={id} aria-describedby={d} value={value} onChange={(e) => onChange(e.target.value)}>
              <option value="">{def.required ? 'Pilih' : '-'}</option>
              {def.options?.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          );
          case 'date': return <Input id={id} aria-describedby={d} type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
          case 'year': return <Input id={id} aria-describedby={d} inputMode="numeric" maxLength={4} placeholder="2020" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} />;
          case 'digits': return <Input id={id} aria-describedby={d} inputMode="numeric" maxLength={def.digits?.[1]} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} />;
          case 'tel': return <Input id={id} aria-describedby={d} type="tel" inputMode="tel" maxLength={20} value={value} onChange={(e) => onChange(e.target.value)} />;
          default: return <Input id={id} aria-describedby={d} maxLength={def.max} value={value} onChange={(e) => onChange(e.target.value)} />;
        }
      }}
    </Field>
  );
}

/** Profil karyawan: halaman sendiri (`/profil`) atau, untuk HC/super admin, milik karyawan lain (`/admin/karyawan/:id/profil`). */
export default function Profile() {
  const { id: paramId } = useParams();
  const id = paramId ?? 'me';
  const qc = useQueryClient();
  const q = useProfile(id);
  const [tab, setTab] = useState<ProfileGroup>('personal');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['profile', id] }); void qc.invalidateQueries({ queryKey: ['profile-card'] }); void qc.invalidateQueries({ queryKey: ['profile-photo'] }); };

  if (q.isPending) return <Spinner />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const p = q.data;
  return (
    <div className="flex flex-col gap-4">
      <Header p={p} id={id} onChanged={refresh} />
      {p.permissions.self && p.consentedAt === null && <Consent onDone={refresh} />}
      <Completeness p={p} />
      <Segmented value={tab} onChange={setTab} options={PROFILE_GROUPS.map((g) => ({ value: g.key, label: g.label }))} />
      {tab === 'personal' ? <PersonalTab p={p} id={id} onChanged={refresh} /> : tab === 'docs' ? <DocumentsTab p={p} id={id} /> : <GroupTab group={tab} p={p} id={id} onChanged={refresh} />}
    </div>
  );
}

// ------------------------------------------------------------------ kepala: foto, nama, kelengkapan

function Header({ p, id, onChanged }: { p: ProfileData; id: string; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const blob = await squarePhoto(file);
      const fd = new FormData();
      fd.append('file', blob, 'foto.jpg');
      return api(`/profile/${id}/photo`, { method: 'POST', body: fd });
    },
    onSuccess: onChanged,
  });
  const remove = useMutation({ mutationFn: () => api(`/profile/${id}/photo`, { method: 'DELETE' }), onSuccess: onChanged });
  const e = p.employee;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <ProfilePhoto fileKey={e.photoKey} name={e.name} className="size-20" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{e.name}</p>
          <p className="truncate text-sm text-muted">{[e.title, e.department].filter(Boolean).join(' · ') || 'Jabatan belum diisi'}</p>
          <div className="mt-1 flex flex-wrap gap-1">{e.status && <Chip tone="neutral">{e.status}</Chip>}{e.level && <Chip tone="neutral">{e.level}</Chip>}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" loading={upload.isPending} onClick={() => fileRef.current?.click()}><Camera className="size-5" aria-hidden="true" />{e.photoKey ? 'Ganti foto' : 'Unggah foto'}</Button>
        <Button variant="secondary" disabled={!e.photoKey} loading={remove.isPending} onClick={() => remove.mutate()}>Hapus foto</Button>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Pilih foto profil"
        onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) upload.mutate(f); }} />
      <ErrorNote error={upload.error ?? remove.error} />
    </Card>
  );
}

function Consent({ onDone }: { onDone: () => void }) {
  const ok = useMutation({ mutationFn: () => api('/profile/me/consent', { method: 'POST' }), onSuccess: onDone });
  return (
    <Card className="flex flex-col gap-3 !border-info">
      <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5" aria-hidden="true" />Penggunaan data profil</p>
      <p className="text-sm text-muted">
        Data yang Anda isi di sini (identitas, keluarga, pendidikan, dan sebagainya) hanya dipakai untuk keperluan administrasi HR internal.
        Hanya Anda, HC, dan super admin yang dapat melihatnya; nama, foto, jabatan, dan departemen terlihat oleh karyawan lain. Setiap pembukaan profil Anda oleh pihak lain tercatat.
      </p>
      <ErrorNote error={ok.error} />
      <Button loading={ok.isPending} onClick={() => ok.mutate()}>Saya mengerti</Button>
    </Card>
  );
}

function Completeness({ p }: { p: ProfileData }) {
  const { percent, missing } = p.completeness;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between"><p className="font-semibold">Kelengkapan profil</p><span className="font-bold">{percent}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-sub" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Kelengkapan profil">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      {missing.length > 0 && <p className="text-sm text-muted">Belum terisi: {missing.join(', ')}.</p>}
    </Card>
  );
}

// ------------------------------------------------------------------ tab personal

function PersonalTab({ p, id, onChanged }: { p: ProfileData; id: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Values>({});
  const save = useMutation({
    mutationFn: () => api(`/profile/${id}/personal`, { method: 'PATCH', json: v }),
    onSuccess: () => { setOpen(false); onChanged(); },
  });
  const openForm = () => { setV(toValues(PERSONAL_FIELDS, p.personal)); save.reset(); setOpen(true); };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col divide-y divide-line !p-0">
        {PERSONAL_FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-0.5 px-4 py-3">
            <span className="text-xs text-muted">{f.label}</span>
            <span className={p.personal[f.key] ? 'break-words' : 'text-muted'} data-selectable>{show(f, p.personal[f.key]) || '-'}</span>
          </div>
        ))}
      </Card>
      <Button onClick={openForm}><Pencil className="size-5" aria-hidden="true" />Ubah data personal</Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Ubah data personal">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {PERSONAL_FIELDS.map((f) => <FieldInput key={f.key} def={f} value={v[f.key] ?? ''} onChange={(x) => setV((cur) => ({ ...cur, [f.key]: x }))} />)}
          <ErrorNote error={save.error} />
          <Button type="submit" loading={save.isPending}>Simpan</Button>
        </form>
      </Sheet>
    </div>
  );
}

// ------------------------------------------------------------------ tab daftar (keluarga, edukasi, aktivitas)

function GroupTab({ group, p, id, onChanged }: { group: ProfileGroup; p: ProfileData; id: string; onChanged: () => void }) {
  const sections = PROFILE_SECTIONS.filter((s) => s.group === group);
  return (
    <div className="flex flex-col gap-6">
      {sections.map((s) => <Section key={s.key} def={s} p={p} id={id} onChanged={onChanged} />)}
    </div>
  );
}

function Section({ def, p, id, onChanged }: { def: SectionDef; p: ProfileData; id: string; onChanged: () => void }) {
  const [editing, setEditing] = useState<{ id: string; data: Record<string, string | null> } | 'new' | null>(null);
  const items = p.entries[def.key] ?? [];
  const canEdit = !def.hcOnly || p.permissions.hc;
  const fieldOf = (k: string) => def.fields.find((f) => f.key === k);
  return (
    <section className="flex flex-col gap-2" aria-label={def.label}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{def.label}</h2>
        {canEdit && <Button variant="secondary" onClick={() => setEditing('new')}><Plus className="size-5" aria-hidden="true" />Tambah</Button>}
      </div>
      {items.length === 0 && <p className="rounded-xl bg-sub p-3 text-sm text-muted">Belum ada {def.item}.</p>}
      <ul className="flex flex-col gap-2">
        {items.map((it) => {
          const sub = def.subtitle.map((k) => show(fieldOf(k), it.data[k])).filter(Boolean).join(' · ');
          return (
            <li key={it.id}>
              <button disabled={!canEdit} onClick={() => setEditing(it)} className="flex w-full flex-col items-start gap-0.5 rounded-2xl bg-surface shadow-card p-3 text-left active:bg-sub disabled:active:bg-surface">
                <span className="font-semibold">{it.data[def.title] ?? '-'}</span>
                {sub && <span className="text-sm text-muted">{sub}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {editing && <EntrySheet def={def} id={id} entry={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </section>
  );
}

function EntrySheet({ def, id, entry, onClose, onSaved }: { def: SectionDef; id: string; entry: { id: string; data: Record<string, string | null> } | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<Values>(() => toValues(def.fields, entry?.data ?? {}));
  const [confirm, setConfirm] = useState(false);
  const save = useMutation({
    mutationFn: () => (entry ? api(`/profile/entries/${entry.id}`, { method: 'PATCH', json: { data: v } }) : api(`/profile/${id}/entries`, { method: 'POST', json: { section: def.key, data: v } })),
    onSuccess: onSaved,
  });
  const del = useMutation({ mutationFn: () => api(`/profile/entries/${entry!.id}`, { method: 'DELETE' }), onSuccess: onSaved });
  const onSubmit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <Sheet open onClose={onClose} title={`${entry ? 'Ubah' : 'Tambah'} ${def.item}`}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {def.fields.map((f) => <FieldInput key={f.key} def={f} value={v[f.key] ?? ''} onChange={(x) => setV((cur) => ({ ...cur, [f.key]: x }))} />)}
        <ErrorNote error={save.error ?? del.error} />
        <Button type="submit" loading={save.isPending}>Simpan</Button>
        {entry && (confirm
          ? <div className="grid grid-cols-2 gap-3"><Button variant="secondary" onClick={() => setConfirm(false)}>Batal</Button><Button variant="danger" loading={del.isPending} onClick={() => del.mutate()}>Ya, hapus</Button></div>
          : <Button variant="secondary" onClick={() => setConfirm(true)}>Hapus</Button>)}
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------ tab dokumen

interface DocItem { id: string; category: string; title: string; fileKey: string; contentType: string; size: number; createdAt: string; uploadedBy: 'self' | 'hc'; canDelete: boolean }
const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

function DocumentsTab({ p, id }: { p: ProfileData; id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['profile-docs', id], queryFn: () => api<DocItem[]>(`/profile/${id}/documents`) });
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['profile-docs', id] });
  const del = useMutation({ mutationFn: (docId: string) => api(`/profile/documents/${docId}`, { method: 'DELETE' }), onSuccess: () => { setConfirmId(null); refresh(); } });
  return (
    <section className="flex flex-col gap-3" aria-label="Dokumen">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Dokumen</h2>
        <Button variant="secondary" onClick={() => setAdding(true)}><Upload className="size-5" aria-hidden="true" />Unggah</Button>
      </div>
      <p className="text-sm text-muted">PDF, JPG, PNG, atau WEBP, maksimal 5 MB. Hanya {p.permissions.self ? 'Anda' : 'pemilik'}, HC, dan super admin yang dapat membukanya; pembukaan oleh orang lain tercatat.</p>
      {q.isPending && <Spinner />}
      <ErrorNote error={q.error ?? del.error} />
      {q.data?.length === 0 && <p className="rounded-xl bg-sub p-3 text-sm text-muted">Belum ada dokumen.</p>}
      <ul className="flex flex-col gap-2">
        {q.data?.map((d) => (
          <li key={d.id}>
            <Card className="flex flex-col gap-1">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">{d.title}</p>
                  <p className="text-sm text-muted">{documentCategory(d.category)?.label ?? d.category} · {fmtSize(d.size)} · {fmtDate(d.createdAt.slice(0, 10))}</p>
                  {d.uploadedBy === 'hc' && !p.permissions.hc && <div className="mt-1"><Chip tone="info">Diunggah HC</Chip></div>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4">
                <AttachmentLink fileKey={d.fileKey} label="Buka dokumen" />
                {d.canDelete && (confirmId === d.id
                  ? <span className="flex items-center gap-2"><Button variant="secondary" onClick={() => setConfirmId(null)}>Batal</Button><Button variant="danger" loading={del.isPending} onClick={() => del.mutate(d.id)}>Ya, hapus</Button></span>
                  : <button onClick={() => setConfirmId(d.id)} className="min-h-11 rounded-lg px-2 text-sm font-medium text-bad underline active:bg-bad-bg">Hapus</button>)}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {adding && <UploadSheet p={p} id={id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}
    </section>
  );
}

function UploadSheet({ p, id, onClose, onDone }: { p: ProfileData; id: string; onClose: () => void; onDone: () => void }) {
  const cats = DOCUMENT_CATEGORIES.filter((c) => !c.hcOnly || p.permissions.hc);
  const [category, setCategory] = useState(cats[0]?.key ?? 'lainnya');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const up = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('category', category);
      if (title.trim()) fd.append('title', title.trim());
      fd.append('file', file!);
      return api(`/profile/${id}/documents`, { method: 'POST', body: fd });
    },
    onSuccess: onDone,
  });
  function onFile(f: File | null) {
    if (f && f.size > MAX_DOCUMENT_BYTES) { setFile(null); setFileError('Berkas terlalu besar (maks. 5 MB)'); return; }
    setFileError(null); setFile(f);
  }
  const onSubmit = (e: FormEvent) => { e.preventDefault(); if (file) up.mutate(); };
  return (
    <Sheet open onClose={onClose} title="Unggah dokumen">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Jenis dokumen">{(fid) => <Select id={fid} value={category} onChange={(e) => setCategory(e.target.value)}>{cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select>}</Field>
        <Field label="Judul (opsional)" hint="Kosongkan untuk memakai nama jenis dokumen.">{(fid, d) => <Input id={fid} aria-describedby={d} maxLength={DOCUMENT_TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Berkas" hint="PDF, JPG, PNG, atau WEBP, maks. 5 MB." error={fileError}>
          {(fid, d) => (
            <label htmlFor={fid} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-field px-3 py-2 active:bg-sub">
              <FileText className="size-5 shrink-0" aria-hidden="true" />
              <span className="truncate">{file ? file.name : 'Pilih berkas'}</span>
              <input id={fid} aria-describedby={d} type="file" className="sr-only" accept={ACCEPT} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </Field>
        <ErrorNote error={up.error} />
        <Button type="submit" loading={up.isPending} disabled={!file}>Unggah</Button>
      </form>
    </Sheet>
  );
}
