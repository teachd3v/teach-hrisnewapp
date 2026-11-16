import type { TeamStatus } from '@hris/shared';
import { useTeamToday } from '../lib/team';
import { fmtLongDate } from '../lib/attendance-types';
import { todayWib } from '../lib/week';
import { Card, Chip, ErrorNote, Spinner } from '../ui';

const LABEL: Record<TeamStatus, string> = { hadir: 'Hadir', pulang: 'Sudah pulang', terlambat: 'Terlambat', belum: 'Belum presensi', izin: 'Izin/cuti', libur: 'Libur' };
const TONE: Record<TeamStatus, 'ok' | 'warn' | 'info' | 'neutral'> = { hadir: 'ok', pulang: 'ok', terlambat: 'warn', izin: 'info', belum: 'neutral', libur: 'neutral' };
const ORDER: TeamStatus[] = ['hadir', 'pulang', 'terlambat', 'izin', 'belum', 'libur'];

/** Tab Tim di Beranda (karyawan): status hari ini rekan satu departemen. Tidak menampilkan jam, foto, lokasi, atau hasil wajah. */
export default function TeamStatusList() {
  const q = useTeamToday();
  if (q.isPending) return <Spinner />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const d = q.data;
  const count = (s: TeamStatus) => d.members.filter((m) => m.status === s).length;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-1">
        <p className="font-semibold">Tim {d.department}</p>
        <p className="text-sm text-muted">{fmtLongDate(todayWib())} · hanya status hari ini</p>
      </Card>
      {d.dayOff && <p className="rounded-xl bg-sub p-3 text-sm">Hari ini {d.dayOff.toLowerCase()}; tidak ada presensi yang dihitung.</p>}
      <div className="flex flex-wrap gap-2">
        {ORDER.filter((s) => count(s) > 0).map((s) => <Chip key={s} tone={TONE[s]}>{LABEL[s]} {count(s)}</Chip>)}
      </div>
      <ul className="flex flex-col gap-2">
        {d.members.map((m, i) => (
          <li key={`${m.name}-${i}`} className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface p-3 shadow-card">
            <span className="min-w-0 flex-1 truncate font-medium">{m.name}{m.self && <span className="text-muted"> (Anda)</span>}</span>
            <Chip tone={TONE[m.status]}>{LABEL[m.status]}</Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}
