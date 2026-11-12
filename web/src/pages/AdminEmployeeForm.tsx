import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@hris/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { BottomBar, Button, Card, ErrorNote, Field, Input, PasswordInput, Select, Spinner } from '../ui';
import { ROLE_LABEL, useEmployees, type Emp } from './AdminEmployees';
import { MASTER_LABEL_LONG, optionsOf, useMaster, type MasterKind } from '../lib/master';

type Form = Record<string, string | boolean>;
const toForm = (e?: Emp): Form => ({
  name: e?.name ?? '', email: e?.email ?? '', phone: e?.phone ?? '', gender: e?.gender ?? '', employee_code: e?.employee_code ?? '',
  manager_id: e?.manager_id ?? '', is_top_leader: e?.is_top_leader ?? false,
  title: e?.title ?? '', department_id: e?.department_id ?? '', level_id: e?.level_id ?? '', employment_status_id: e?.employment_status_id ?? '', join_date: e?.join_date ?? '',
  role: e?.role ?? 'employee', active: e?.active ?? true, password: '',
});

export default function AdminEmployeeForm() {
  const { id } = useParams();
  const isNew = id === 'baru';
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useEmployees();
  const master = useMaster();
  const target = isNew ? undefined : list.data?.find((e) => e.id === id);
  const [form, setForm] = useState<Form | null>(isNew ? toForm() : null);
  const [resetPw, setResetPw] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  if (!isNew && list.data && !target) return <Navigate to="/admin/karyawan" replace />;
  if (!isNew && !target) return <Spinner />;
  const f = form ?? toForm(target);
  const set = (k: string, v: string | boolean) => setForm({ ...f, [k]: v });
  const lockedAdmin = Boolean(target && target.role !== 'employee' && !isSuper && target.id !== user?.id);
  const restricted = !isSuper;

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) {
        const body: Form = { ...f };
        if (!isSuper) for (const k of ['title', 'department_id', 'level_id', 'employment_status_id', 'join_date', 'role', 'active']) delete body[k];
        return api('/admin/employees', { method: 'POST', json: body });
      }
      const orig = toForm(target);
      const diff: Form = {};
      for (const k of Object.keys(orig)) if (k !== 'password' && f[k] !== orig[k]) diff[k] = f[k]!;
      return Object.keys(diff).length ? api(`/admin/employees/${target!.id}`, { method: 'PATCH', json: diff }) : { ok: true };
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-employees'] }); navigate('/admin/karyawan', { replace: true }); },
  });
  const reset = useMutation({
    mutationFn: () => api(`/admin/employees/${target!.id}/reset-password`, { method: 'POST', json: { password: resetPw } }),
    onSuccess: () => { setNotice('Password diatur ulang dan semua sesi dicabut. Sampaikan password sementara ke karyawan; ia wajib menggantinya saat masuk.'); setResetPw(''); },
  });
  const onSubmit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  // Dropdown dari data master: hanya yang aktif, ditambah nilai karyawan saat ini walau sudah dinonaktifkan.
  const pick = (k: string, kind: MasterKind) => {
    const opts = optionsOf(master.data, kind).filter((o) => o.active || o.id === f[k]);
    return (
      <Field label={MASTER_LABEL_LONG[kind]} hint={master.data && opts.length === 0 ? 'Belum ada pilihan. Super admin menambahkannya di Akun > Data master.' : undefined}>
        {(fid, d) => (
          <Select id={fid} aria-describedby={d} disabled={restricted || lockedAdmin} value={String(f[k])} onChange={(e) => set(k, e.target.value)}>
            <option value="">(belum dipilih)</option>
            {opts.map((o) => <option key={o.id} value={o.id}>{o.name}{o.active ? '' : ' (nonaktif)'}</option>)}
          </Select>
        )}
      </Field>
    );
  };
  const text = (k: string, label: string, opts: { type?: string; disabled?: boolean; hint?: string; mode?: 'email' | 'tel' } = {}) => (
    <Field label={label} hint={opts.hint}>{(fid, d) => <Input id={fid} aria-describedby={d} type={opts.type ?? 'text'} inputMode={opts.mode} disabled={opts.disabled || lockedAdmin} value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value)} />}</Field>
  );

  return (
    <div className="flex flex-1 flex-col gap-6">
      {lockedAdmin && <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn">Akun admin hanya dapat diubah super admin.</p>}
      {!isNew && target && (
        <Link to={`/admin/karyawan/${target.id}/profil`} className="mb-4 flex min-h-12 items-center justify-center rounded-xl border border-field bg-surface px-4 font-medium active:bg-sub">Lihat profil lengkap</Link>
      )}
      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4">
        {text('name', 'Nama')}
        {text('email', 'Email', { type: 'email', mode: 'email' })}
        {isNew && text('password', 'Password awal', { type: 'password', hint: 'Minimal 8 karakter, huruf dan angka. Karyawan wajib menggantinya saat masuk pertama kali.' })}
        {text('phone', 'Telepon', { type: 'tel', mode: 'tel' })}
        {text('employee_code', 'Kode karyawan')}
        <Field label="Jenis kelamin">{(fid) => <Select id={fid} disabled={lockedAdmin} value={String(f.gender)} onChange={(e) => set('gender', e.target.value)}><option value="">-</option><option>Laki-laki</option><option>Perempuan</option></Select>}</Field>

        <Field label="Atasan langsung">
          {(fid) => (
            <Select id={fid} disabled={lockedAdmin || Boolean(f.is_top_leader)} value={String(f.manager_id)} onChange={(e) => set('manager_id', e.target.value)}>
              <option value="">(belum ditetapkan)</option>
              {(list.data ?? []).filter((m) => m.active && m.id !== target?.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          )}
        </Field>
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" className="size-6 accent-primary" disabled={lockedAdmin} checked={Boolean(f.is_top_leader)} onChange={(e) => setForm({ ...f, is_top_leader: e.target.checked, manager_id: e.target.checked ? '' : f.manager_id! })} />
          <span>Pucuk pimpinan <span className="block text-sm text-muted">Cuti langsung ke HC, tanpa atasan.</span></span>
        </label>

        <fieldset disabled={restricted || lockedAdmin} className="flex flex-col gap-4 rounded-2xl bg-surface shadow-card p-4">
          <legend className="px-1 text-sm font-semibold text-muted">Kepegawaian{restricted ? ' (hanya super admin)' : ''}</legend>
          {text('title', 'Jabatan', { disabled: restricted })}
          {pick('department_id', 'department')}
          {pick('level_id', 'level')}
          {pick('employment_status_id', 'employment_status')}
          {text('join_date', 'Tanggal masuk', { type: 'date', disabled: restricted })}
          <Field label="Peran">{(fid) => <Select id={fid} value={String(f.role)} onChange={(e) => set('role', e.target.value as Role)}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>}</Field>
          {!isNew && (
            <label className="flex min-h-12 items-center gap-3"><input type="checkbox" className="size-6 accent-primary" checked={Boolean(f.active)} onChange={(e) => set('active', e.target.checked)} />Akun aktif</label>
          )}
        </fieldset>

        <ErrorNote error={save.error} />
        <BottomBar><Button type="submit" className="w-full" loading={save.isPending} disabled={lockedAdmin}>Simpan</Button></BottomBar>
      </form>

      {!isNew && !lockedAdmin && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Reset password</h2>
          <Field label="Password sementara" hint="Mencabut semua sesi karyawan dan membuka kunci akun.">{(fid, d) => <PasswordInput id={fid} aria-describedby={d} autoComplete="new-password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} />}</Field>
          <ErrorNote error={reset.error} />
          {notice && <p role="status" className="rounded-xl bg-ok-bg p-3 text-sm text-ok">{notice}</p>}
          <Button variant="secondary" disabled={!resetPw} loading={reset.isPending} onClick={() => { setNotice(null); reset.mutate(); }}>Atur ulang password</Button>
        </Card>
      )}
    </div>
  );
}
