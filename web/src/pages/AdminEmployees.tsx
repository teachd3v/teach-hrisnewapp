import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, SearchX } from 'lucide-react';
import type { Role } from '@hris/shared';
import { api } from '../lib/api';
import { Chip, Empty, ErrorNote, Input, Spinner } from '../ui';
import { nameOf, useMaster } from '../lib/master';

export interface Emp {
  id: string; employee_code: string | null; name: string; email: string; phone: string | null; gender: string | null;
  title: string | null; department_id: string | null; level_id: string | null; employment_status_id: string | null; join_date: string | null;
  role: Role; manager_id: string | null; is_top_leader: boolean; active: boolean;
}
export const ROLE_LABEL: Record<Role, string> = { employee: 'Karyawan', admin: 'Admin (HC)', super_admin: 'Super Admin' };
export const useEmployees = () => useQuery({ queryKey: ['admin-employees'], queryFn: () => api<Emp[]>('/admin/employees') });

export default function AdminEmployees() {
  const list = useEmployees();
  const navigate = useNavigate();
  const master = useMaster();
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter((e) => !q || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
  }, [list.data, search]);
  const byId = useMemo(() => new Map((list.data ?? []).map((e) => [e.id, e])), [list.data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Input type="search" aria-label="Cari karyawan" placeholder="Cari nama atau email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Link to="/admin/karyawan/baru" className="hidden min-h-12 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-fg shadow-primary active:bg-[#0b5f58] lg:inline-flex"><Plus className="size-5" aria-hidden="true" />Tambah karyawan</Link>
      </div>
      {list.isPending && <Spinner />}
      <ErrorNote error={list.error} />
      {list.data && shown.length === 0 && <Empty icon={<SearchX className="size-10" />}>Tidak ada karyawan yang cocok.</Empty>}
      {shown.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl bg-surface shadow-card lg:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-sub text-xs font-semibold text-muted">
              <tr><th scope="col" className="px-4 py-3">Nama</th><th scope="col" className="px-4 py-3">Departemen dan level</th><th scope="col" className="px-4 py-3">Atasan</th><th scope="col" className="px-4 py-3">Peran</th><th scope="col" className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((e) => (
                <tr key={e.id} onClick={() => navigate(`/admin/karyawan/${e.id}`)} className={`cursor-pointer hover:bg-sub ${e.active ? '' : 'opacity-60'}`}>
                  <td className="px-4 py-3"><Link to={`/admin/karyawan/${e.id}`} className="font-semibold">{e.name}</Link><span className="block text-muted">{e.email}</span></td>
                  <td className="px-4 py-3">{[nameOf(master.data, e.department_id), nameOf(master.data, e.level_id)].filter(Boolean).join(' · ') || '-'}</td>
                  <td className="px-4 py-3">{e.is_top_leader ? 'Pucuk pimpinan' : e.manager_id ? (byId.get(e.manager_id)?.name ?? '-') : <span className="text-muted">Belum ditetapkan</span>}</td>
                  <td className="px-4 py-3">{ROLE_LABEL[e.role]}</td>
                  <td className="px-4 py-3">{e.active ? <Chip tone="ok">Aktif</Chip> : <Chip>Nonaktif</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="flex flex-col gap-2 pb-20 lg:hidden">
        {shown.map((e) => (
          <li key={e.id}>
            <Link to={`/admin/karyawan/${e.id}`} className={`flex min-h-16 items-center gap-3 rounded-2xl bg-surface shadow-card p-3 active:bg-sub ${e.active ? '' : 'opacity-60'}`}>
              <span className="flex-1">
                <span className="flex items-center gap-2"><b>{e.name}</b>{!e.active && <Chip>Nonaktif</Chip>}{e.role !== 'employee' && <Chip tone="info">{ROLE_LABEL[e.role]}</Chip>}</span>
                <span className="block text-sm text-muted">{[nameOf(master.data, e.department_id), nameOf(master.data, e.level_id)].filter(Boolean).join(' · ') || e.email}</span>
                <span className="block text-sm text-muted">{e.is_top_leader ? 'Pucuk pimpinan' : e.manager_id ? `Atasan: ${byId.get(e.manager_id)?.name ?? '-'}` : 'Atasan belum ditetapkan'}</span>
              </span>
              <ChevronRight className="size-5 text-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/admin/karyawan/baru" aria-label="Tambah karyawan"
        className="pb-safe fixed right-4 bottom-6 z-10 grid size-14 lg:hidden place-items-center rounded-full bg-primary text-primary-fg shadow-lg active:bg-black"><Plus className="size-7" aria-hidden="true" /></Link>
    </div>
  );
}
