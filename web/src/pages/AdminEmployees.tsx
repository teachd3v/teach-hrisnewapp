import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, SearchX } from 'lucide-react';
import type { Role } from '@hris/shared';
import { api } from '../lib/api';
import { Chip, Empty, ErrorNote, Input, Spinner } from '../ui';

export interface Emp {
  id: string; employee_code: string | null; name: string; email: string; phone: string | null; gender: string | null;
  title: string | null; dept: string | null; level: string | null; employment_status: string | null; join_date: string | null;
  role: Role; manager_id: string | null; is_top_leader: boolean; active: boolean;
}
export const ROLE_LABEL: Record<Role, string> = { employee: 'Karyawan', admin: 'Admin (HC)', super_admin: 'Super Admin' };
export const useEmployees = () => useQuery({ queryKey: ['admin-employees'], queryFn: () => api<Emp[]>('/admin/employees') });

export default function AdminEmployees() {
  const list = useEmployees();
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter((e) => !q || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
  }, [list.data, search]);
  const byId = useMemo(() => new Map((list.data ?? []).map((e) => [e.id, e])), [list.data]);

  return (
    <div className="flex flex-col gap-4">
      <Input type="search" aria-label="Cari karyawan" placeholder="Cari nama atau email" value={search} onChange={(e) => setSearch(e.target.value)} />
      {list.isPending && <Spinner />}
      <ErrorNote error={list.error} />
      {list.data && shown.length === 0 && <Empty icon={<SearchX className="size-10" />}>Tidak ada karyawan yang cocok.</Empty>}
      <ul className="flex flex-col gap-2 pb-20">
        {shown.map((e) => (
          <li key={e.id}>
            <Link to={`/admin/karyawan/${e.id}`} className={`flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-3 active:bg-sub ${e.active ? '' : 'opacity-60'}`}>
              <span className="flex-1">
                <span className="flex items-center gap-2"><b>{e.name}</b>{!e.active && <Chip>Nonaktif</Chip>}{e.role !== 'employee' && <Chip tone="info">{ROLE_LABEL[e.role]}</Chip>}</span>
                <span className="block text-sm text-muted">{e.email}</span>
                <span className="block text-sm text-muted">{e.is_top_leader ? 'Pucuk pimpinan' : e.manager_id ? `Atasan: ${byId.get(e.manager_id)?.name ?? '-'}` : 'Atasan belum ditetapkan'}</span>
              </span>
              <ChevronRight className="size-5 text-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/admin/karyawan/baru" aria-label="Tambah karyawan"
        className="pb-safe fixed right-4 bottom-6 z-10 grid size-14 place-items-center rounded-full bg-primary text-primary-fg shadow-lg active:bg-black"><Plus className="size-7" aria-hidden="true" /></Link>
    </div>
  );
}
