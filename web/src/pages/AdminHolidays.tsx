import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HOLIDAY_TYPES } from '@hris/shared';
import { api } from '../lib/api';
import { fmtDate } from '../lib/leave-types';

interface Holiday { date: string; name: string; type: 'NATIONAL' | 'JOINT' }

export default function AdminHolidays() {
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<Holiday['type']>('NATIONAL');
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['admin-holidays', year], queryFn: () => api<Holiday[]>(`/admin/holidays?year=${year}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-holidays'] });
  const add = useMutation({
    mutationFn: () => api('/admin/holidays', { method: 'POST', json: { date, name, type } }),
    onSuccess: () => { setDate(''); setName(''); setError(null); void refresh(); },
    onError: (e) => setError((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (d: string) => api(`/admin/holidays/${d}`, { method: 'DELETE' }),
    onSuccess: () => void refresh(),
    onError: (e) => setError((e as Error).message),
  });
  const onSubmit = (e: FormEvent) => { e.preventDefault(); setError(null); add.mutate(); };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Hari Libur</h1>
        <Link to="/" className="text-sm underline">Beranda</Link>
      </header>
      <input className="w-28 rounded border p-2 text-sm" type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} />
      <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded border p-3">
        <input className="rounded border p-2 text-sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <input className="rounded border p-2 text-sm" placeholder="Nama hari libur" value={name} onChange={(e) => setName(e.target.value)} required />
        <select className="rounded border p-2 text-sm" value={type} onChange={(e) => setType(e.target.value as Holiday['type'])}>
          {HOLIDAY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <button className="rounded bg-black p-2 text-sm text-white disabled:opacity-40" disabled={add.isPending}>Simpan</button>
        <p className="text-xs text-gray-500">Hari libur tidak dihitung sebagai hari kerja pada pengajuan baru. Pengajuan yang sudah ada tidak dihitung ulang.</p>
      </form>
      {list.data?.length === 0 && <p className="text-sm text-gray-500">Belum ada hari libur untuk {year}.</p>}
      {list.data?.map((h) => (
        <div key={h.date} className="flex items-center justify-between rounded border p-2 text-sm">
          <div><b>{h.name}</b><div className="text-xs text-gray-600">{fmtDate(h.date)} · {HOLIDAY_TYPES.find((t) => t.key === h.type)?.label}</div></div>
          <button className="text-xs underline disabled:opacity-40" disabled={del.isPending} onClick={() => { if (confirm(`Hapus ${h.name}?`)) del.mutate(h.date); }}>Hapus</button>
        </div>
      ))}
    </main>
  );
}
