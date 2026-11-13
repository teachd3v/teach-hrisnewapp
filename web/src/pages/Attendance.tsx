import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, ChevronRight, FilePen, ScanFace, Share2 } from 'lucide-react';
import { policyText, workDuration, type AttendancePolicy, type OfficeLocation } from '@hris/shared';
import { api } from '../lib/api';
import { faceChip, recordChips, fmtLongDate, fmtShortDate, fmtTime, locationFlag, type AttendanceRec, type DayFlags, type Tone } from '../lib/attendance-types';
import { addDays, dotFor, todayWib, useRecordsByDate, workWeek } from '../lib/week';
import WeekStrip from '../components/WeekStrip';
import FirstHint from '../components/FirstHint';
import { Card, Chip, Empty, ErrorNote, Field, Input, Spinner } from '../ui';

export const useToday = () =>
  useQuery({ queryKey: ['att-today'], queryFn: () => api<{ date: string; serverTime: string; record: AttendanceRec | null; day: DayFlags | null; policy: Pick<AttendancePolicy, 'workStart' | 'graceMinutes' | 'locationMode'>; offices: OfficeLocation[] }>('/attendance/today') });

/** Kartu utama Beranda: status presensi hari ini. Tombol presensinya ada di tengah menu bawah (layouts.tsx), tidak diulang di sini. */
export function TodayCard() {
  const today = useToday();
  const r = today.data?.record;
  const inFlag = locationFlag(r?.in ?? null);
  const outFlag = locationFlag(r?.out ?? null);
  const day = today.data?.day;
  const chips = r ? recordChips(r) : [];
  return (
    <Card className="flex flex-col gap-3 bg-linear-to-br from-white via-[#e8eefc] to-[#f6e7f6]">
      <div>
        <p className="text-sm text-muted">{today.data ? fmtLongDate(today.data.date) : 'Hari ini'}</p>
        <p className="text-xl font-extrabold">{!r?.clock_in ? 'Belum presensi masuk' : !r.clock_out ? 'Sedang bekerja' : 'Selesai bekerja'}</p>
      </div>
      {today.isPending ? <Spinner /> : (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/80 p-3"><p className="text-xs font-medium text-muted">Masuk</p><p className="text-2xl font-extrabold tabular-nums">{fmtTime(r?.clock_in ?? null)}</p>{inFlag && <Chip tone={inFlag.tone}>{inFlag.text}</Chip>}</div>
          <div className="rounded-2xl bg-white/80 p-3"><p className="text-xs font-medium text-muted">Pulang</p><p className="text-2xl font-extrabold tabular-nums">{fmtTime(r?.clock_out ?? null)}</p>{outFlag && <Chip tone={outFlag.tone}>{outFlag.text}</Chip>}</div>
        </div>
      )}
      {chips.length > 0 && <div className="flex flex-wrap gap-1">{chips.map((c, i) => <Chip key={i} tone={c.tone}>{c.text}</Chip>)}</div>}
      {!r?.clock_in && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-muted">{today.data?.policy ? policyText(today.data.policy).replace(/^./, (c) => c.toUpperCase()) : 'Batas jam masuk'}.{day?.lateExcused ? ' Izin keterlambatan Anda hari ini sudah disetujui.' : ' Bila terlambat, ajukan Izin Keterlambatan di menu Izin.'}</p>
          {day?.leaveType && <p className="rounded-xl bg-info-bg p-2 text-info">Hari ini ada pengajuan disetujui: {day.leaveType}.</p>}
          {day?.dayOff && <p className="rounded-xl bg-white/80 p-2">{day.dayOff === 'Akhir pekan' ? 'Hari ini akhir pekan.' : `Hari ini libur: ${day.dayOff}.`}</p>}
        </div>
      )}
      {r?.clock_out && <p className="text-sm text-muted">Durasi kerja {workDuration(r.clock_in, r.clock_out)}</p>}
      <ErrorNote error={today.error} />
    </Card>
  );
}

/** Satu baris linimasa: jam di kiri, kartu bertanda warna di kanan. */
function TimelineRow({ time, children }: { time: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[3rem_1fr] items-start gap-2">
      <p className="pt-4 text-sm font-semibold tabular-nums text-muted">{time}</p>
      {children}
    </div>
  );
}

const Chips = ({ items }: { items: ({ tone: Tone; text: string } | null | undefined)[] }) => {
  const list = items.filter(Boolean) as { tone: Tone; text: string }[];
  return list.length ? <div className="mt-2 flex flex-wrap gap-1">{list.map((c, i) => <Chip key={i} tone={c.tone}>{c.text}</Chip>)}</div> : null;
};

/** Rincian satu hari: Masuk dan Pulang sebagai linimasa. */
function DayDetail({ date, rec, today }: { date: string; rec: AttendanceRec | undefined; today: string }) {
  const past = date < today;
  if (!rec?.clock_in) {
    return (
      <Card accent="neutral">
        <p className="font-bold">Tidak ada presensi</p>
        <p className="text-sm text-muted">{date === today ? 'Belum ada presensi masuk hari ini.' : date > today ? 'Tanggal ini belum tiba.' : 'Tidak ada catatan presensi pada tanggal ini.'}</p>
      </Card>
    );
  }
  const late = rec.flags.lateMinutes > 0 && !rec.flags.lateExcused;
  const inAccent = late ? 'warn' : rec.flags.lateExcused ? 'info' : 'ok';
  return (
    <div className="flex flex-col gap-3">
      <TimelineRow time={fmtTime(rec.clock_in)}>
        <Card accent={inAccent}>
          <p className="font-bold">Masuk</p>
          <Chips items={[locationFlag(rec.in), faceChip(rec.in, 'Masuk'), ...recordChips(rec)]} />
        </Card>
      </TimelineRow>
      <TimelineRow time={fmtTime(rec.clock_out)}>
        {rec.clock_out ? (
          <Card accent="ok">
            <p className="font-bold">Pulang</p>
            <p className="text-sm text-muted">Durasi kerja {workDuration(rec.clock_in, rec.clock_out)}</p>
            <Chips items={[locationFlag(rec.out), faceChip(rec.out, 'Pulang')]} />
          </Card>
        ) : (
          <Card accent="warn">
            <p className="font-bold">{past ? 'Tidak ada presensi pulang' : 'Belum pulang'}</p>
            {past && <Link to={`/presensi/koreksi?date=${date}`} className="mt-1 inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-blue-700 underline active:bg-sub">Ajukan koreksi jam pulang</Link>}
          </Card>
        )}
      </TimelineRow>
    </div>
  );
}

const thisMonth = () => todayWib().slice(0, 7);
const monthTitle = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', month: 'long', year: 'numeric' });

export default function Attendance() {
  const navState = useLocation().state as { flash?: string; faceWarn?: string | null } | null;
  const flash = navState?.flash;
  const faceWarn = navState?.faceWarn;
  const today = todayWib();
  const [selected, setSelected] = useState(today);
  const week = workWeek(selected);
  const { byDate, pending } = useRecordsByDate(week);
  const nextWeekStart = addDays(week[0]!, 7);

  const [month, setMonth] = useState(thisMonth());
  const mine = useQuery({ queryKey: ['att-mine', month], queryFn: () => api<AttendanceRec[]>(`/attendance/mine?month=${month}`) });
  const pick = (d: string) => { setSelected(d); document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="flex flex-col gap-4">
      {flash && <p role="status" className="flex items-center gap-2 rounded-2xl bg-ok-bg p-3 text-sm font-medium text-ok"><CheckCircle2 className="size-5" aria-hidden="true" />{flash}</p>}
      {faceWarn && <p role="status" className="rounded-2xl bg-warn-bg p-3 text-sm font-medium text-warn">{faceWarn}</p>}
      <FirstHint id="presensi">Ketuk tanggal untuk melihat presensi hari itu. Lupa presensi? Ajukan koreksi dari layar ini.</FirstHint>

      <Card className="flex flex-col gap-3 !p-3">
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Pekan sebelumnya" onClick={() => setSelected(addDays(week[0]!, -3))} className="grid size-11 place-items-center rounded-full active:bg-sub"><ChevronLeft className="size-5" aria-hidden="true" /></button>
          <p className="font-extrabold">{monthTitle(selected)}</p>
          <button type="button" aria-label="Pekan berikutnya" disabled={nextWeekStart > today} onClick={() => setSelected(nextWeekStart > today ? today : nextWeekStart)} className="grid size-11 place-items-center rounded-full active:bg-sub disabled:opacity-30"><ChevronRight className="size-5" aria-hidden="true" /></button>
        </div>
        <WeekStrip days={week.map((date) => ({ date, dot: dotFor(byDate.get(date)) }))} today={today} selected={selected} onSelect={setSelected} />
      </Card>

      <h2 className="-mb-1 text-lg font-extrabold">{fmtLongDate(selected)}</h2>
      {pending ? <Spinner /> : <DayDetail date={selected} rec={byDate.get(selected)} today={today} />}
      {byDate.get(selected)?.clock_out && (
        <Link to={`/presensi/selesai?date=${selected}`} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-semibold text-primary-fg shadow-primary active:bg-[#0b5f58]"><Share2 className="size-5" aria-hidden="true" />Lihat dan bagikan kartu hari ini</Link>
      )}
      {selected <= today && (
        <Link to={`/presensi/koreksi?date=${selected}`} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-surface px-4 font-semibold shadow-card active:bg-sub"><FilePen className="size-5" aria-hidden="true" />Lupa presensi? Ajukan koreksi</Link>
      )}

      <div className="mt-2 flex items-end justify-between gap-3">
        <h2 className="pb-2 text-lg font-extrabold">Riwayat bulanan</h2>
        <div className="w-44"><Field label="Bulan">{(id) => <Input id={id} type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />}</Field></div>
      </div>
      {mine.isPending && <Spinner />}
      <ErrorNote error={mine.error} />
      {mine.data?.length === 0 && <Empty icon={<ScanFace className="size-10" />}>Belum ada presensi pada bulan ini.</Empty>}
      <ul className="flex flex-col gap-2">
        {mine.data?.map((r) => {
          const first = recordChips(r)[0];
          return (
            <li key={r.id}>
              <button type="button" onClick={() => pick(r.date)} aria-label={`Lihat rincian ${fmtShortDate(r.date)}`} className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-card active:bg-sub">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{fmtShortDate(r.date)}</span>
                  <span className="block text-sm text-muted">{fmtTime(r.clock_in)} - {fmtTime(r.clock_out)}{r.clock_out ? ` · ${workDuration(r.clock_in, r.clock_out)}` : ' · belum pulang'}</span>
                </span>
                {first && <Chip tone={first.tone}>{first.text}</Chip>}
                <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
