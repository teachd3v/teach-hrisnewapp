import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, ChevronRight, ClipboardCheck, History, Hourglass } from 'lucide-react';
import { isAdmin } from '@hris/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBadges } from '../layouts';
import type { LeaveMeta } from '../lib/leave-types';
import { Button, Card, Segmented, Spinner } from '../ui';
import { TodayCard } from './Attendance';
import { PushPrompt } from '../components/PushCard';
import { InstallCard } from '../components/Install';
import Overview from '../components/dashboard/Overview';
import { usePersisted } from '../components/dashboard/parts';

function Row({ to, icon, title, sub }: { to: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link to={to} className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-3 active:bg-sub">
      <span className="grid size-10 place-items-center rounded-xl bg-sub" aria-hidden="true">{icon}</span>
      <span className="flex-1"><span className="block font-medium">{title}</span><span className="block text-sm text-muted">{sub}</span></span>
      <ChevronRight className="size-5 text-muted" aria-hidden="true" />
    </Link>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { approvals } = useBadges();
  const meta = useQuery({ queryKey: ['leave-meta', new Date().getFullYear()], queryFn: () => api<LeaveMeta>(`/leave/meta?year=${new Date().getFullYear()}`) });
  const hcQueue = useQuery({
    queryKey: ['admin-leave', 'pending_hc'], enabled: Boolean(user && isAdmin(user.role)),
    queryFn: () => api<unknown[]>('/leave/admin?status=pending_hc'),
  });
  // Admin/super admin: tab [Saya | Ringkasan]. Bawaan "Saya" (presensi tetap di depan); pilihan terakhir diingat. Karyawan biasa tidak melihat tab.
  const admin = Boolean(user && isAdmin(user.role));
  const [tab, setTab] = usePersisted<'me' | 'overview'>('hris.homeTab', 'me', ['me', 'overview']);
  const annual = meta.data?.balances.find((b) => b.type === 'Cuti Tahunan');
  const pct = annual?.quota ? Math.max(0, Math.min(100, ((annual.remaining ?? 0) / annual.quota) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-muted">Halo,</p>
        <p className="text-2xl font-bold">{user?.name}</p>
      </div>

      {admin && <Segmented value={tab} onChange={setTab} options={[{ value: 'me', label: 'Saya' }, { value: 'overview', label: 'Ringkasan' }]} />}
      {admin && tab === 'overview' ? <Overview /> : (
        <>
          <TodayCard />
          <Link to="/presensi" className="-mt-2 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-field px-4 font-medium active:bg-sub"><History className="size-5" aria-hidden="true" />Riwayat presensi dan koreksi</Link>

          <InstallCard />
          <PushPrompt />

          <Card>
            <p className="text-sm font-medium text-muted">Sisa cuti tahunan {new Date().getFullYear()}</p>
            {meta.isPending ? <Spinner /> : annual ? (
              <>
                <p className="mt-1 text-4xl font-bold">{annual.remaining}<span className="text-lg font-medium text-muted"> / {annual.quota} hari</span></p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-sub" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Sisa cuti tahunan"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                <p className="mt-2 text-sm text-muted">Terpakai {annual.used}{annual.pending ? ` · menunggu persetujuan ${annual.pending}` : ''}</p>
              </>
            ) : <p className="text-muted">Data kuota belum tersedia.</p>}
          </Card>

          <Link to="/cuti/ajukan"><Button className="w-full"><CalendarPlus className="size-5" aria-hidden="true" />Ajukan izin</Button></Link>

          {approvals > 0 && <Row to="/persetujuan" icon={<ClipboardCheck className="size-5" />} title="Perlu persetujuan Anda" sub={`${approvals} pengajuan bawahan`} />}
          {user && isAdmin(user.role) && (hcQueue.data?.length ?? 0) > 0 && <Row to="/admin/cuti" icon={<Hourglass className="size-5" />} title="Menunggu HC" sub={`${hcQueue.data!.length} pengajuan`} />}
        </>
      )}
    </div>
  );
}
