import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@hris/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Emp {
  id: string; employee_code: string | null; name: string; email: string; phone: string | null; gender: string | null;
  title: string | null; dept: string | null; level: string | null; employment_status: string | null; join_date: string | null;
  role: Role; manager_id: string | null; is_top_leader: boolean; active: boolean;
}

type Form = Record<string, string | boolean>;
const ROLE_LABEL: Record<Role, string> = { employee: 'Karyawan', admin: 'Admin (HC)', super_admin: 'Super Admin' };

const toForm = (e?: Emp): Form => ({
  name: e?.name ?? '', email: e?.email ?? '', phone: e?.phone ?? '', gender: e?.gender ?? '', employee_code: e?.employee_code ?? '',
  manager_id: e?.manager_id ?? '', is_top_leader: e?.is_top_leader ?? false,
  title: e?.title ?? '', dept: e?.dept ?? '', level: e?.level ?? '', employment_status: e?.employment_status ?? '', join_date: e?.join_date ?? '',
  role: e?.role ?? 'employee', active: e?.active ?? true, password: '',
});

export default function AdminEmployees() {
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin-employees'], queryFn: () => api<Emp[]>('/admin/employees') });
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Emp | 'new' | null>(null);
  const [form, setForm] = useState<Form>(toForm());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState('');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter((e) => !q || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
  }, [list.data, search]);
  const byId = useMemo(() => new Map((list.data ?? []).map((e) => [e.id, e])), [list.data]);

  function open(e: Emp | 'new') {
    setEditing(e); setForm(toForm(e === 'new' ? undefined : e)); setError(null); setNotice(null); setResetPw('');
  }
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const done = () => { void qc.invalidateQueries({ queryKey: ['admin-employees'] }); };

  const save = useMutation({
    mutationFn: async () => {
      if (editing === 'new') {
        const body: Form = { ...form };
        if (!isSuper) for (const k of ['title', 'dept', 'level', 'employment_status', 'join_date', 'role', 'active']) delete body[k];
        return api('/admin/employees', { method: 'POST', json: body });
      }
      // PATCH hanya mengirim kolom yang berubah (kolom terbatas ditolak server untuk non-super admin).
      const orig = toForm(editing as Emp);
      const diff: Form = {};
      for (const k of Object.keys(orig)) if (k !== 'password' && form[k] !== orig[k]) diff[k] = form[k]!;
      if (!Object.keys(diff).length) return { ok: true };
      return api(`/admin/employees/${(editing as Emp).id}`, { method: 'PATCH', json: diff });
    },
    onSuccess: () => { done(); setEditing(null); },
    onError: (e) => setError((e as Error).message),
  });
  const reset = useMutation({
    mutationFn: () => api(`/admin/employees/${(editing as Emp).id}/reset-password`, { method: 'POST', json: { password: resetPw } }),
    onSuccess: () => { setNotice('Password diatur ulang. Sampaikan password sementara ini ke karyawan; ia wajib menggantinya saat login.'); setResetPw(''); },
    onError: (e) => setError((e as Error).message),
  });

  function onSubmit(e: FormEvent) { e.preventDefault(); setError(null); save.mutate(); }

  const field = (k: string, label: string, props: { type?: string; disabled?: boolean } = {}) => (
    <label className="text-xs">{label}
      <input className="mt-1 w-full rounded border p-2 text-sm disabled:bg-gray-100" type={props.type ?? 'text'} disabled={props.disabled}
        value={String(form[k] ?? '')} onChange={(e) => set(k, e.target.value)} />
    </label>
  );
  const restricted = !isSuper; // data kepegawaian, peran, status akun: hanya super admin

  if (editing) {
    const isNew = editing === 'new';
    const target = isNew ? null : editing;
    const lockedAdmin = target && target.role !== 'employee' && !isSuper && target.id !== user?.id;
    return (
      <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{isNew ? 'Karyawan baru' : target!.name}</h1>
          <button className="text-sm underline" onClick={() => setEditing(null)}>Kembali</button>
        </header>
        {lockedAdmin && <p className="rounded border p-2 text-sm text-amber-700">Akun admin hanya dapat diubah super admin.</p>}
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {field('name', 'Nama')}
          {field('email', 'Email', { type: 'email' })}
          {isNew && field('password', 'Password awal (min. 8, huruf & angka)', { type: 'password' })}
          {field('phone', 'Telepon')}
          {field('employee_code', 'Kode karyawan')}
          <label className="text-xs">Jenis kelamin
            <select className="mt-1 w-full rounded border p-2 text-sm" value={String(form.gender)} onChange={(e) => set('gender', e.target.value)}>
              <option value="">-</option><option>Laki-laki</option><option>Perempuan</option>
            </select>
          </label>
          <label className="text-xs">Atasan langsung
            <select className="mt-1 w-full rounded border p-2 text-sm" value={String(form.manager_id)} disabled={Boolean(form.is_top_leader)} onChange={(e) => set('manager_id', e.target.value)}>
              <option value="">(belum ditetapkan)</option>
              {(list.data ?? []).filter((m) => m.active && m.id !== target?.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={Boolean(form.is_top_leader)} onChange={(e) => { set('is_top_leader', e.target.checked); if (e.target.checked) set('manager_id', ''); }} />
            Pucuk pimpinan (cuti langsung ke HC)
          </label>
          <fieldset className="flex flex-col gap-3 rounded border p-3" disabled={restricted}>
            <legend className="px-1 text-xs text-gray-500">Kepegawaian{restricted ? ' (hanya super admin)' : ''}</legend>
            {field('title', 'Jabatan', { disabled: restricted })}
            {field('dept', 'Departemen', { disabled: restricted })}
            {field('level', 'Level', { disabled: restricted })}
            {field('employment_status', 'Status kepegawaian', { disabled: restricted })}
            {field('join_date', 'Tanggal masuk', { type: 'date', disabled: restricted })}
            <label className="text-xs">Peran
              <select className="mt-1 w-full rounded border p-2 text-sm" value={String(form.role)} onChange={(e) => set('role', e.target.value)}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            {!isNew && (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={Boolean(form.active)} onChange={(e) => set('active', e.target.checked)} /> Akun aktif
              </label>
            )}
          </fieldset>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={save.isPending || Boolean(lockedAdmin)} className="rounded bg-black p-2 text-white disabled:opacity-40">{save.isPending ? 'Menyimpan…' : 'Simpan'}</button>
        </form>

        {!isNew && !lockedAdmin && (
          <section className="flex flex-col gap-2 rounded border p-3">
            <h2 className="text-sm font-medium">Reset password</h2>
            <input className="rounded border p-2 text-sm" type="password" placeholder="Password sementara (min. 8, huruf & angka)" value={resetPw} onChange={(e) => setResetPw(e.target.value)} />
            <button className="rounded border p-2 text-sm disabled:opacity-40" disabled={reset.isPending || !resetPw} onClick={() => { setError(null); setNotice(null); reset.mutate(); }}>Atur ulang & cabut semua sesi</button>
            {notice && <p className="text-xs text-green-700">{notice}</p>}
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Karyawan</h1>
        <Link to="/" className="text-sm underline">Beranda</Link>
      </header>
      <div className="flex gap-2">
        <input className="flex-1 rounded border p-2 text-sm" placeholder="Cari nama atau email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="rounded bg-black px-3 text-sm text-white" onClick={() => open('new')}>Tambah</button>
      </div>
      {list.isError && <p role="alert" className="text-sm text-red-600">{(list.error as Error).message}</p>}
      {shown.map((e) => (
        <button key={e.id} onClick={() => open(e)} className={`rounded border p-3 text-left text-sm ${e.active ? '' : 'opacity-50'}`}>
          <div className="flex justify-between"><b>{e.name}</b><span className="text-xs">{ROLE_LABEL[e.role]}{e.active ? '' : ' · nonaktif'}</span></div>
          <div className="text-xs text-gray-600">{e.email}</div>
          <div className="text-xs text-gray-600">
            {e.is_top_leader ? 'Pucuk pimpinan' : e.manager_id ? `Atasan: ${byId.get(e.manager_id)?.name ?? '-'}` : 'Atasan belum ditetapkan'}
          </div>
        </button>
      ))}
    </main>
  );
}
