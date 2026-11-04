import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeaveBalance } from '@hris/shared';
import { api } from '../lib/api';

interface EmpLite { id: string; name: string; active: boolean }

function Row({ b, employeeId, year }: { b: LeaveBalance; employeeId: string; year: number }) {
  const qc = useQueryClient();
  const [val, setVal] = useState(b.explicit && b.quota !== null ? String(b.quota) : '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (quota: number | null) => api('/admin/quotas', { method: 'PUT', json: { employeeId, leaveType: b.type, year, quota } }),
    onSuccess: () => { setError(null); void qc.invalidateQueries({ queryKey: ['admin-quota', employeeId, year] }); },
    onError: (e) => setError((e as Error).message),
  });
  const parsed = val.trim() === '' ? null : Number(val.replace(',', '.'));
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < 0);
  return (
    <div className="rounded border p-2 text-sm">
      <div className="flex justify-between"><b>{b.type}</b><span className="text-xs text-gray-500">{b.quota === null ? 'tanpa batas' : `${b.quota} hari${b.explicit ? ' (khusus)' : ' (bawaan)'}`}</span></div>
      <div className="text-xs text-gray-500">terpakai {b.used} · menunggu {b.pending}{b.remaining !== null ? ` · sisa ${b.remaining}` : ''}</div>
      <div className="mt-2 flex gap-2">
        <input className="w-24 rounded border p-1 text-sm" inputMode="decimal" placeholder="bawaan" value={val} onChange={(e) => setVal(e.target.value)} />
        <button className="rounded border px-2 text-xs disabled:opacity-40" disabled={save.isPending || invalid} onClick={() => save.mutate(parsed)}>Simpan</button>
        {b.explicit && <button className="text-xs underline" disabled={save.isPending} onClick={() => { setVal(''); save.mutate(null); }}>Kembalikan ke bawaan</button>}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function AdminQuotas() {
  const [employeeId, setEmployeeId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const emps = useQuery({ queryKey: ['admin-employees'], queryFn: () => api<EmpLite[]>('/admin/employees') });
  const bal = useQuery({
    queryKey: ['admin-quota', employeeId, year], enabled: Boolean(employeeId),
    queryFn: () => api<LeaveBalance[]>(`/admin/quotas?employeeId=${employeeId}&year=${year}`),
  });
  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Kuota Cuti</h1>
        <Link to="/" className="text-sm underline">Beranda</Link>
      </header>
      <select className="rounded border p-2 text-sm" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
        <option value="">Pilih karyawan</option>
        {emps.data?.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <input className="w-28 rounded border p-2 text-sm" type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} />
      <p className="text-xs text-gray-500">Kosongkan isian untuk memakai kuota bawaan (Cuti Tahunan 12 hari, Ganti Hari 0, jenis lain tanpa batas). Kelipatan 0,5 hari.</p>
      {bal.isError && <p role="alert" className="text-sm text-red-600">{(bal.error as Error).message}</p>}
      {bal.data?.map((b) => <Row key={`${employeeId}-${year}-${b.type}-${b.quota}`} b={b} employeeId={employeeId} year={year} />)}
    </main>
  );
}
