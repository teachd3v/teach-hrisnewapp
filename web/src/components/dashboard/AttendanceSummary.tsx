import { useState } from 'react';
import { Link } from 'react-router';
import { REPORT_MIN_DATE } from '@hris/shared';
import { dayLabel, dayMonth, monthLabel, shiftDay, shiftMonth, useDayAttendance, useMonthAttendance, wibToday } from '../../lib/dashboard';
import { Card, Chip, ErrorNote, Segmented, Spinner } from '../../ui';
import { Disclosure, PeriodNav, PersonRow, Progress, Stat, usePersisted } from './parts';

function DayView({ date }: { date: string }) {
  const q = useDayAttendance(date);
  if (q.isPending) return <Spinner />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const d = q.data, t = d.totals;
  const pct = t.expected ? Math.round((t.present / t.expected) * 100) : 0;
  const missingLabel = d.isToday ? 'Belum presensi' : 'Tidak hadir';
  const missing = d.isToday ? t.notYet : t.absent;
  return (
    <div className="flex flex-col gap-3">
      {d.dayOff && <p className="rounded-xl bg-sub p-3 text-sm">{d.dayOff}. Tidak ada presensi yang diharapkan{t.present > 0 ? `; ${t.present} orang tetap presensi.` : '.'}</p>}
      {!d.dayOff && (
        <>
          <div>
            <p className="flex items-baseline gap-2"><span className="text-3xl font-bold">{t.present}</span><span className="text-muted">dari {t.expected} hadir</span><span className="ml-auto text-lg font-semibold">{pct}%</span></p>
            <div className="mt-2"><Progress pct={pct} label="Tingkat kehadiran hari ini" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Tepat waktu" value={t.onTime} tone="ok" />
            <Stat label="Terlambat" value={t.late + t.lateExcused} tone={t.late > 0 ? 'warn' : 'neutral'} sub={t.lateExcused > 0 ? `${t.lateExcused} berizin` : undefined} />
            <Stat label={missingLabel} value={missing} tone={!d.isToday && missing > 0 ? 'bad' : 'neutral'} sub={d.isToday ? 'hari belum selesai' : undefined} />
            <Stat label="Cuti/izin sehari penuh" value={t.onLeave} />
          </div>
          {t.noClockOut > 0 && <p className="text-sm text-muted">{t.noClockOut} presensi masuk tanpa presensi pulang.</p>}
          <Disclosure title="Terlambat" count={d.late.length}>
            {d.late.map((p) => <PersonRow key={p.id} name={p.name} department={p.department} right={`${p.clockIn}`} sub={`${p.lateMinutes} mnt${p.excused ? ' (izin)' : ''}`} />)}
          </Disclosure>
          <Disclosure title={missingLabel} count={d.isToday ? d.notYet.length : d.absent.length}>
            {(d.isToday ? d.notYet : d.absent).map((p) => <PersonRow key={p.id} name={p.name} department={p.department} />)}
          </Disclosure>
          <Disclosure title="Cuti/izin sehari penuh" count={d.onLeave.length}>
            {d.onLeave.map((p) => <PersonRow key={p.id} name={p.name} department={p.department} right={p.type} />)}
          </Disclosure>
        </>
      )}
      <Link to={`/admin/presensi?date=${date}`} className="inline-flex min-h-11 items-center self-start rounded-lg px-1 text-sm font-medium underline active:bg-sub">Lihat rincian presensi →</Link>
    </div>
  );
}

function MonthView({ month }: { month: string }) {
  const q = useMonthAttendance(month);
  if (q.isPending) return <Spinner />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const d = q.data, t = d.totals;
  const counted = d.through >= d.from;
  const pct = t.rate === null ? null : Math.round(t.rate * 100);
  const lastDay = `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;
  return (
    <div className="flex flex-col gap-3">
      {!counted ? <p className="rounded-xl bg-sub p-3 text-sm">Belum ada hari kerja yang selesai bulan ini.</p> : (
        <>
          <div>
            <p className="flex items-baseline gap-2"><span className="text-3xl font-bold">{pct === null ? '–' : `${pct}%`}</span><span className="text-muted">tingkat kehadiran</span></p>
            <p className="text-xs text-muted">{dayMonth(d.from)} – {dayMonth(d.through)}{d.through < lastDay ? ' (sampai kemarin)' : ''} · hadir dibanding yang seharusnya hadir (tanpa cuti/izin)</p>
            <div className="mt-2"><Progress pct={pct ?? 0} label="Tingkat kehadiran bulan ini" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Terlambat (hari)" value={t.lateDays} tone={t.lateDays > 0 ? 'warn' : 'neutral'} sub={t.lateDays > 0 ? `${t.lateMinutes} menit total${t.lateExcusedDays ? ` · ${t.lateExcusedDays} berizin` : ''}` : undefined} />
            <Stat label="Tidak hadir (hari)" value={t.absent} tone={t.absent > 0 ? 'bad' : 'neutral'} />
            <Stat label="Cuti/izin (hari)" value={t.leaveDays} />
            <Stat label="Belum presensi pulang" value={t.noClockOut} />
          </div>
          <Disclosure title="Paling sering terlambat" count={d.topLate.length}>
            {d.topLate.map((p) => <PersonRow key={p.id} name={p.name} department={p.department} right={`${p.lateDays} hari`} sub={`${p.lateMinutes} mnt`} />)}
          </Disclosure>
          <Disclosure title="Paling sering tidak hadir" count={d.topAbsent.length}>
            {d.topAbsent.map((p) => <PersonRow key={p.id} name={p.name} department={p.department} right={`${p.absent} hari`} />)}
          </Disclosure>
        </>
      )}
      <Link to="/admin/rekap" className="inline-flex min-h-11 items-center self-start rounded-lg px-1 text-sm font-medium underline active:bg-sub">Rekap lengkap dan unduh Excel →</Link>
    </div>
  );
}

/** Kehadiran karyawan, harian atau bulanan, tanpa mengunduh rekap. Angka memakai aturan yang sama dengan Rekap Excel. */
export default function AttendanceSummary() {
  const today = wibToday();
  const [mode, setMode] = usePersisted<'day' | 'month'>('hris.dash.attMode', 'day', ['day', 'month']);
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Kehadiran</h2>
        {mode === 'day' && date !== today && <button type="button" onClick={() => setDate(today)} className="min-h-11 rounded-lg px-2 text-sm font-medium underline">Hari ini</button>}
        {mode === 'month' && month !== today.slice(0, 7) && <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="min-h-11 rounded-lg px-2 text-sm font-medium underline">Bulan ini</button>}
      </div>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'day', label: 'Harian' }, { value: 'month', label: 'Bulanan' }]} />
      {mode === 'day' ? (
        <>
          <PeriodNav label={dayLabel(date)} extra={date === today ? <Chip tone="info">Hari ini</Chip> : undefined} onPrev={() => setDate(shiftDay(date, -1))} onNext={() => setDate(shiftDay(date, 1))}
            prevDisabled={shiftDay(date, -1) < REPORT_MIN_DATE} nextDisabled={date >= today} />
          <DayView date={date} />
        </>
      ) : (
        <>
          <PeriodNav label={monthLabel(month)} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))}
            prevDisabled={`${shiftMonth(month, -1)}-01` < REPORT_MIN_DATE} nextDisabled={month >= today.slice(0, 7)} />
          <MonthView month={month} />
        </>
      )}
    </Card>
  );
}
