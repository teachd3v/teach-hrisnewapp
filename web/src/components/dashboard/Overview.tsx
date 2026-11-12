import { Link } from 'react-router';
import { useAdminQueues } from '../../lib/admin-queues';
import { Card } from '../../ui';
import AttendanceSummary from './AttendanceSummary';
import PeopleMoments from './PeopleMoments';

/** Antrean yang menunggu HC. Hanya tampil bila ada yang menunggu (tidak ada angka nol yang memenuhi layar). */
function QueueTiles() {
  const q = useAdminQueues().data;
  if (!q) return null;
  const tiles = [
    { to: '/admin/cuti', label: 'Izin & overtime', n: q.leave + q.overtime },
    { to: '/admin/koreksi-presensi', label: 'Koreksi presensi', n: q.corrections },
    { to: '/admin/wajah', label: 'Pendaftaran wajah', n: q.face },
  ];
  const total = tiles.reduce((t, x) => t + x.n, 0);
  if (total === 0) return null;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Perlu tindakan <span className="text-muted">({total})</span></h2>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} aria-label={`${t.label}: ${t.n} menunggu`} className={`flex min-h-20 flex-col justify-between rounded-xl p-3 active:opacity-80 ${t.n > 0 ? 'bg-bad-bg text-bad' : 'bg-sub text-muted'}`}>
            <span className="text-2xl font-bold leading-none">{t.n}</span>
            <span className="text-xs font-medium leading-tight">{t.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** Ringkasan HR untuk admin/super admin di Beranda. Setiap kartu memuat datanya sendiri, jadi satu yang gagal tidak mengosongkan halaman. */
export default function Overview() {
  return (
    <div className="flex flex-col gap-4">
      <QueueTiles />
      <AttendanceSummary />
      <PeopleMoments />
    </div>
  );
}
