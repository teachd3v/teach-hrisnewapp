import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX, Plus, Trash2 } from 'lucide-react';
import { HOLIDAY_TYPES } from '@hris/shared';
import { api } from '../lib/api';
import { fmtDate } from '../lib/leave-types';
import { Button, Card, Chip, Empty, ErrorNote, Field, Input, Select, Sheet, Spinner } from '../ui';

interface Holiday { date: string; name: string; type: 'NATIONAL' | 'JOINT' }

export default function AdminHolidays() {
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<Holiday | null>(null);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<Holiday['type']>('NATIONAL');
  const list = useQuery({ queryKey: ['admin-holidays', year], queryFn: () => api<Holiday[]>(`/admin/holidays?year=${year}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-holidays'] });
  const add = useMutation({
    mutationFn: () => api('/admin/holidays', { method: 'POST', json: { date, name, type } }),
    onSuccess: () => { setDate(''); setName(''); setAdding(false); void refresh(); },
  });
  const del = useMutation({
    mutationFn: (d: string) => api(`/admin/holidays/${d}`, { method: 'DELETE' }),
    onSuccess: () => { setToDelete(null); void refresh(); },
  });
  const onSubmit = (e: FormEvent) => { e.preventDefault(); add.mutate(); };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Tahun">{(id) => <Input id={id} type="number" inputMode="numeric" min={2020} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} />}</Field>
      <p className="text-sm text-muted">Hari libur tidak dihitung sebagai hari kerja pada pengajuan baru. Pengajuan yang sudah ada tidak dihitung ulang. Apakah Cuti Bersama memotong Cuti Tahunan diatur di menu Kuota cuti.</p>
      {list.isPending && <Spinner />}
      <ErrorNote error={list.error} />
      {list.data?.length === 0 && <Empty icon={<CalendarX className="size-10" />}>Belum ada hari libur untuk {year}.</Empty>}
      <ul className="flex flex-col gap-2 pb-20">
        {list.data?.map((h) => (
          <li key={h.date}>
            <Card className="flex items-center gap-3 !p-3">
              <div className="flex-1"><p className="font-semibold">{h.name}</p><p className="text-sm text-muted">{fmtDate(h.date)}</p><div className="mt-1"><Chip tone={h.type === 'NATIONAL' ? 'info' : 'warn'}>{HOLIDAY_TYPES.find((t) => t.key === h.type)?.label}</Chip></div></div>
              <button aria-label={`Hapus ${h.name}`} onClick={() => setToDelete(h)} className="grid size-12 place-items-center rounded-full text-bad active:bg-bad-bg"><Trash2 className="size-5" aria-hidden="true" /></button>
            </Card>
          </li>
        ))}
      </ul>
      <button aria-label="Tambah hari libur" onClick={() => setAdding(true)} className="pb-safe fixed right-4 bottom-6 z-10 grid size-14 place-items-center rounded-full bg-primary text-primary-fg shadow-lg active:bg-black"><Plus className="size-7" aria-hidden="true" /></button>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Tambah hari libur">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Tanggal">{(id) => <Input id={id} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Nama">{(id) => <Input id={id} required value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Jenis">{(id) => <Select id={id} value={type} onChange={(e) => setType(e.target.value as Holiday['type'])}>{HOLIDAY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>}</Field>
          <ErrorNote error={add.error} />
          <Button type="submit" loading={add.isPending}>Simpan</Button>
        </form>
      </Sheet>

      <Sheet open={Boolean(toDelete)} onClose={() => setToDelete(null)} title="Hapus hari libur?">
        {toDelete && <p className="mb-4 text-muted">{toDelete.name} · {fmtDate(toDelete.date)}</p>}
        <ErrorNote error={del.error} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setToDelete(null)}>Batal</Button>
          <Button variant="danger" loading={del.isPending} onClick={() => toDelete && del.mutate(toDelete.date)}>Hapus</Button>
        </div>
      </Sheet>
    </div>
  );
}
