import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { FilePen } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, LogIn, LogOut, ScanFace } from 'lucide-react';
import { WORK_START_LABEL, workDuration } from '@hris/shared';
import { api } from '../lib/api';
import { dayChips, recordChips, fmtLongDate, fmtShortDate, fmtTime, locationFlag, type AttendanceRec, type DayFlags } from '../lib/attendance-types';
import { Button, Card, Chip, Empty, ErrorNote, Field, Input, Spinner } from '../ui';

export const useToday = () =>
  useQuery({ queryKey: ['att-today'], queryFn: () => api<{ date: string; serverTime: string; record: AttendanceRec | null; day: DayFlags | null }>('/attendance/today') });

/** Tombol presensi sesuai keadaan hari ini; dipakai di tab Presensi dan Beranda. */
export function PunchButton({ record }: { record: AttendanceRec | null | undefined }) {
  if (!record?.clock_in) return <Link to="/presensi/ambil/in"><Button className="w-full"><LogIn className="size-5" aria-hidden="true" />Presensi masuk</Button></Link>;
  if (!record.clock_out) return <Link to="/presensi/ambil/out"><Button className="w-full"><LogOut className="size-5" aria-hidden="true" />Presensi pulang</Button></Link>;
  return <Button className="w-full" disabled>Presensi hari ini selesai</Button>;
}

export function TodayCard() {
  const today = useToday();
  const r = today.data?.record;
  const inFlag = locationFlag(r?.in ?? null);
  const outFlag = locationFlag(r?.out ?? null);
  const day = today.data?.day;
  const chips = r ? recordChips(r) : [];
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="text-sm text-muted">{today.data ? fmtLongDate(today.data.date) : 'Hari ini'}</p>
        <p className="text-lg font-bold">{!r?.clock_in ? 'Belum presensi masuk' : !r.clock_out ? 'Sedang bekerja' : 'Selesai bekerja'}</p>
      </div>
      {today.isPending ? <Spinner /> : (
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-sub p-3"><p className="text-xs text-muted">Masuk</p><p className="text-2xl font-bold">{fmtTime(r?.clock_in ?? null)}</p>{inFlag && <Chip tone={inFlag.tone}>{inFlag.text}</Chip>}</div>
          <div className="rounded-xl bg-sub p-3"><p className="text-xs text-muted">Pulang</p><p className="text-2xl font-bold">{fmtTime(r?.clock_out ?? null)}</p>{outFlag && <Chip tone={outFlag.tone}>{outFlag.text}</Chip>}</div>
        </div>
      )}
      {chips.length > 0 && <div className="flex flex-wrap gap-1">{chips.map((c, i) => <Chip key={i} tone={c.tone}>{c.text}</Chip>)}</div>}
      {!r?.clock_in && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-muted">Batas jam masuk {WORK_START_LABEL} WIB, tanpa toleransi.{day?.lateExcused ? ' Izin keterlambatan Anda hari ini sudah disetujui.' : ' Bila terlambat, ajukan Izin Keterlambatan di menu Cuti.'}</p>
          {day?.leaveType && <p className="rounded-lg bg-info-bg p-2 text-info">Hari ini ada pengajuan disetujui: {day.leaveType}.</p>}
          {day?.dayOff && <p className="rounded-lg bg-sub p-2">{day.dayOff === 'Akhir pekan' ? 'Hari ini akhir pekan.' : `Hari ini libur: ${day.dayOff}.`}</p>}
        </div>
      )}
      {r?.clock_out && <p className="text-sm text-muted">Durasi kerja {workDuration(r.clock_in, r.clock_out)}</p>}
      <ErrorNote error={today.error} />
      <PunchButton record={r} />
    </Card>
  );
}

const thisDate = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const thisMonth = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);

export default function Attendance() {
  const flash = (useLocation().state as { flash?: string } | null)?.flash;
  const [month, setMonth] = useState(thisMonth());
  const mine = useQuery({ queryKey: ['att-mine', month], queryFn: () => api<AttendanceRec[]>(`/attendance/mine?month=${month}`) });

  return (
    <div className="flex flex-col gap-4">
      {flash && <p role="status" className="flex items-center gap-2 rounded-xl bg-ok-bg p-3 text-sm font-medium text-ok"><CheckCircle2 className="size-5" aria-hidden="true" />{flash}</p>}
      <TodayCard />
      <Link to="/presensi/koreksi" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-field px-4 font-medium active:bg-sub"><FilePen className="size-5" aria-hidden="true" />Lupa presensi? Ajukan koreksi</Link>

      <div className="flex items-end justify-between gap-3">
        <h2 className="pb-2 text-lg font-semibold">Riwayat</h2>
        <div className="w-44"><Field label="Bulan">{(id) => <Input id={id} type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />}</Field></div>
      </div>
      {mine.isPending && <Spinner />}
      <ErrorNote error={mine.error} />
      {mine.data?.length === 0 && <Empty icon={<ScanFace className="size-10" />}>Belum ada presensi pada bulan ini.</Empty>}
      <ul className="flex flex-col gap-2">
        {mine.data?.map((r) => {
          const flags = [...recordChips(r), ...[locationFlag(r.in), r.out ? locationFlag(r.out) : null].filter((x) => x && x.tone === 'warn')] as { tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral'; text: string }[];
          return (
            <li key={r.id}>
              <Card className="!p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{fmtShortDate(r.date)}</p>
                  <p className="text-sm text-muted">{r.clock_out ? workDuration(r.clock_in, r.clock_out) : 'Belum pulang'}</p>
                </div>
                <p className="text-sm">Masuk <b>{fmtTime(r.clock_in)}</b> · Pulang <b>{fmtTime(r.clock_out)}</b></p>
                {!r.clock_out && r.date < thisDate() && <Link to={`/presensi/koreksi?date=${r.date}`} className="mt-1 inline-flex min-h-11 items-center rounded-lg px-1 text-sm font-medium underline active:bg-sub">Ajukan koreksi jam pulang</Link>}
                {flags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{flags.map((f, i) => <Chip key={i} tone={f.tone}>{f.text}</Chip>)}</div>}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
