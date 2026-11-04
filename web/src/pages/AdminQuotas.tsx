import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeaveBalance } from '@hris/shared';
import { api } from '../lib/api';
import { Button, Card, ErrorNote, Field, Input, Select, Spinner } from '../ui';
import { useEmployees } from './AdminEmployees';

function Row({ b, employeeId, year }: { b: LeaveBalance; employeeId: string; year: number }) {
  const qc = useQueryClient();
  const [val, setVal] = useState(b.explicit && b.quota !== null ? String(b.quota) : '');
  const save = useMutation({
    mutationFn: (quota: number | null) => api('/admin/quotas', { method: 'PUT', json: { employeeId, leaveType: b.type, year, quota } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-quota', employeeId, year] }),
  });
  const parsed = val.trim() === '' ? null : Number(val.replace(',', '.'));
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 366 || parsed * 2 !== Math.round(parsed * 2));
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-semibold">{b.type}</p>
        <p className="text-sm text-muted">{b.quota === null ? 'Tanpa batas' : `${b.quota} hari (${b.explicit ? 'khusus' : 'bawaan'})`} · terpakai {b.used} · menunggu {b.pending}</p>
      </div>
      <Field label="Jatah khusus (hari)" hint="Kosongkan untuk memakai bawaan. Kelipatan 0,5." error={invalid ? 'Isi 0-366, kelipatan 0,5' : null}>
        {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} />}
      </Field>
      <ErrorNote error={save.error} />
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" disabled={!b.explicit || save.isPending} onClick={() => { setVal(''); save.mutate(null); }}>Ke bawaan</Button>
        <Button disabled={invalid} loading={save.isPending} onClick={() => save.mutate(parsed)}>Simpan</Button>
      </div>
    </Card>
  );
}

export default function AdminQuotas() {
  const [employeeId, setEmployeeId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const emps = useEmployees();
  const bal = useQuery({
    queryKey: ['admin-quota', employeeId, year], enabled: Boolean(employeeId),
    queryFn: () => api<LeaveBalance[]>(`/admin/quotas?employeeId=${employeeId}&year=${year}`),
  });
  return (
    <div className="flex flex-col gap-4">
      <Field label="Karyawan">
        {(id) => <Select id={id} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Pilih karyawan</option>{emps.data?.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>}
      </Field>
      <Field label="Tahun">{(id) => <Input id={id} type="number" inputMode="numeric" min={2020} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} />}</Field>
      {bal.isFetching && !bal.data && <Spinner />}
      <ErrorNote error={bal.error} />
      {employeeId && bal.data?.map((b) => <Row key={`${employeeId}-${year}-${b.type}-${b.quota}-${b.explicit}`} b={b} employeeId={employeeId} year={year} />)}
    </div>
  );
}
