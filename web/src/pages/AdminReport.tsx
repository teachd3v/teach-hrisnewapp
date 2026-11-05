import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileX } from 'lucide-react';
import { REPORT_MAX_DAYS, REPORT_MIN_DATE, wibDateMinusDays, type AttendanceReport } from '@hris/shared';
import { api } from '../lib/api';
import { fmtLongDate } from '../lib/attendance-types';
import { optionsOf, useMaster } from '../lib/master';
import { downloadReport } from '../lib/report-xlsx';
import DateField from '../components/DateField';
import { Button, Card, Chip, Empty, ErrorNote, Field, Select, Spinner } from '../ui';

const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const span = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`;
const monthEnd = (ymd: string) => { const [y, m] = ymd.split('-').map(Number) as [number, number]; return `${ymd.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const prevMonthRef = (ymd: string) => wibDateMinusDays(monthStart(ymd), 1);

/** HC: rekap presensi + cuti untuk rentang tanggal bebas; pratinjau di layar lalu unduh Excel. */
export default function AdminReport() {
  const today = todayWib();
  const master = useMaster();
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [department, setDepartment] = useState('');
  const [applied, setApplied] = useState<{ from: string; to: string; department: string } | null>(null);

  const days = from && to ? span(from, to) : 0;
  const rangeError = !from || !to ? 'Pilih tanggal awal dan akhir.' : to < from ? 'Tanggal akhir harus sama atau setelah tanggal awal.' : days > REPORT_MAX_DAYS ? `Rentang maksimal ${REPORT_MAX_DAYS} hari (sekarang ${days} hari).` : null;

  const report = useQuery({
    queryKey: ['report', applied], enabled: Boolean(applied),
    queryFn: () => api<AttendanceReport>(`/reports/range?from=${applied!.from}&to=${applied!.to}${applied!.department ? `&department=${applied!.department}` : ''}`),
  });
  const totals = useMemo(() => report.data?.summary.reduce((a, s) => ({ present: a.present + s.present, absent: a.absent + s.absent, late: a.late + s.lateDays }), { present: 0, absent: 0, late: 0 }), [report.data]);

  const presets: { label: string; range: [string, string] }[] = [
    { label: 'Bulan ini', range: [monthStart(today), today] },
    { label: 'Bulan lalu', range: [monthStart(prevMonthRef(today)), monthEnd(prevMonthRef(today))] },
    { label: '7 hari terakhir', range: [wibDateMinusDays(today, 6), today] },
    { label: '30 hari terakhir', range: [wibDateMinusDays(today, 29), today] },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Pilihan cepat">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => { setFrom(p.range[0]); setTo(p.range[1]); }}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium active:bg-sub ${from === p.range[0] && to === p.range[1] ? 'border-primary bg-primary text-primary-fg' : 'border-field'}`}>{p.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DateField label="Dari tanggal" value={from} min={REPORT_MIN_DATE} max={to && to < today ? to : today} today={today} onChange={(d) => { setFrom(d); if (to && d > to) setTo(d); }} />
        <DateField label="Sampai tanggal" value={to} min={from || REPORT_MIN_DATE} max={today} today={today} onChange={setTo} />
      </div>
      {!rangeError && <p className="text-sm text-muted" role="status">{days} hari · {fmtLongDate(from)} s.d. {fmtLongDate(to)}</p>}
      {rangeError && <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm text-bad">{rangeError}</p>}

      <Field label="Departemen">
        {(id) => <Select id={id} value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">Semua departemen</option>{optionsOf(master.data, 'department').map((o) => <option key={o.id} value={o.id}>{o.name}{o.active ? '' : ' (nonaktif)'}</option>)}</Select>}
      </Field>

      <Button disabled={Boolean(rangeError)} loading={report.isFetching} onClick={() => setApplied({ from, to, department })}>Tampilkan rekap</Button>
      <ErrorNote error={report.error} />

      {report.isFetching && !report.data && <Spinner />}
      {report.data && applied && (
        <>
          <Card className="flex flex-col gap-3">
            <div>
              <p className="font-semibold">{fmtLongDate(report.data.from)}{report.data.from !== report.data.to && ` – ${fmtLongDate(report.data.to)}`}</p>
              <p className="text-sm text-muted">{report.data.departmentName ?? 'Semua departemen'} · {report.data.summary.length} karyawan · dihitung sampai {fmtLongDate(report.data.cutoff)}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-sub p-2"><p className="text-xl font-bold">{totals?.present}</p><p className="text-xs text-muted">hari hadir</p></div>
              <div className="rounded-xl bg-sub p-2"><p className="text-xl font-bold">{totals?.late}</p><p className="text-xs text-muted">terlambat</p></div>
              <div className="rounded-xl bg-sub p-2"><p className="text-xl font-bold">{totals?.absent}</p><p className="text-xs text-muted">tidak hadir</p></div>
            </div>
            <Button onClick={() => downloadReport(report.data)}><FileSpreadsheet className="size-5" aria-hidden="true" />Unduh Excel</Button>
            <p className="text-xs text-muted">Berkas berisi lembar Ringkasan per karyawan dan lembar Rincian per hari.</p>
          </Card>

          {report.data.summary.length === 0 && <Empty icon={<FileX className="size-10" />}>Tidak ada karyawan pada pilihan ini.</Empty>}
          <ul className="flex flex-col gap-2">
            {report.data.summary.map((s) => (
              <li key={s.employeeId}>
                <Card className="!p-3">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-muted">{[s.department, s.level].filter(Boolean).join(' · ') || '-'}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Chip tone="ok">Hadir {s.present}/{s.workdays}</Chip>
                    {s.absent > 0 && <Chip tone="bad">Tidak hadir {s.absent}</Chip>}
                    {s.lateDays > 0 && <Chip tone="warn">Terlambat {s.lateDays}× ({s.lateMinutes} mnt)</Chip>}
                    {s.lateExcusedDays > 0 && <Chip tone="info">Terlambat berizin {s.lateExcusedDays}</Chip>}
                    {s.leaveAnnual + s.leaveSick + s.leaveDuty + s.leaveOther > 0 && <Chip tone="info">Cuti/izin {s.leaveAnnual + s.leaveSick + s.leaveDuty + s.leaveOther} hari</Chip>}
                    {s.noClockOut > 0 && <Chip>Belum pulang {s.noClockOut}</Chip>}
                    {s.corrected > 0 && <Chip>Dikoreksi {s.corrected}</Chip>}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
