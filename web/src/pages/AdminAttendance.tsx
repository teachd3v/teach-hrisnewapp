import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { workDuration } from '@hris/shared';
import { api } from '../lib/api';
import AttachmentLink from '../components/AttachmentLink';
import { dayChips, fmtLongDate, fmtTime, locationFlag, type AttendanceRec } from '../lib/attendance-types';
import { Card, Chip, Empty, ErrorNote, Field, Input, Spinner } from '../ui';

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** HC: presensi semua karyawan aktif pada satu tanggal. */
export default function AdminAttendance() {
  const [date, setDate] = useState(today());
  const q = useQuery({
    queryKey: ['att-admin', date],
    queryFn: () => api<{ date: string; rows: { employeeId: string; name: string; record: AttendanceRec | null }[] }>(`/attendance/admin?date=${date}`),
  });
  const present = q.data?.rows.filter((r) => r.record?.clock_in).length ?? 0;
  const late = q.data?.rows.filter((r) => r.record && r.record.flags.lateMinutes > 0 && !r.record.flags.lateExcused).length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Tanggal">{(id) => <Input id={id} type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
      {q.isPending && <Spinner />}
      <ErrorNote error={q.error} />
      {q.data && (
        <>
          <p className="text-sm text-muted">{fmtLongDate(q.data.date)} · hadir {present} dari {q.data.rows.length} karyawan aktif{late > 0 ? ` · terlambat ${late}` : ''}</p>
          {q.data.rows.length === 0 && <Empty icon={<Users className="size-10" />}>Belum ada karyawan.</Empty>}
          <ul className="flex flex-col gap-2">
            {q.data.rows.map(({ employeeId, name, record: r }) => {
              const flags = [...(r ? dayChips(r.flags) : []), ...[locationFlag(r?.in ?? null), locationFlag(r?.out ?? null)].filter((x) => x && x.tone === 'warn')] as { tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral'; text: string }[];
              return (
                <li key={employeeId}>
                  <Card className="!p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{name}</p>
                      {!r ? <Chip>Belum presensi</Chip> : !r.clock_out ? <Chip tone="info">Belum pulang</Chip> : <Chip tone="ok">Selesai</Chip>}
                    </div>
                    {r && (
                      <>
                        <p className="text-sm">Masuk <b>{fmtTime(r.clock_in)}</b> · Pulang <b>{fmtTime(r.clock_out)}</b>{r.clock_out && <span className="text-muted"> · {workDuration(r.clock_in, r.clock_out)}</span>}</p>
                        {flags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{flags.map((f, i) => <Chip key={i} tone={f.tone}>{f.text}</Chip>)}</div>}
                        {(r.in?.face === false || r.out?.face === false) && <p className="mt-1 text-sm text-muted">Wajah tidak terdeteksi otomatis pada salah satu foto.</p>}
                        <div className="mt-1 flex flex-wrap gap-x-4">
                          {r.in?.photo && <span className="flex items-center gap-1 text-sm">Foto masuk <AttachmentLink fileKey={r.in.photo} /></span>}
                          {r.out?.photo && <span className="flex items-center gap-1 text-sm">Foto pulang <AttachmentLink fileKey={r.out.photo} /></span>}
                        </div>
                      </>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
