import { useState } from 'react';
import { Link } from 'react-router';
import { Cake, Briefcase, Award } from 'lucide-react';
import { LSA_YEARS, type LsaItem } from '@hris/shared';
import { dayMonth, monthLabel, usePeopleMoments } from '../../lib/dashboard';
import { Card, ErrorNote, Segmented, Select, Spinner } from '../../ui';
import { PersonRow, usePersisted } from './parts';

type Tab = 'bd' | 'ann' | 'lsa';
type Period = 'today' | 'month';

const lsaStatus = (i: LsaItem) => (i.status === 'hari_ini' ? 'Hari ini' : i.status === 'lewat' ? 'Sudah lewat' : `${i.daysUntil} hari lagi`);

/** Kartu "Momen karyawan": ulang tahun, ulang tahun kerja (masa kerja), dan LSA. Ulang tahun hanya tanggal dan bulan (tanpa tahun lahir/usia). */
export default function PeopleMoments() {
  const q = usePeopleMoments();
  const [tab, setTab] = usePersisted<Tab>('hris.dash.momentTab', 'bd', ['bd', 'ann', 'lsa']);
  const [period, setPeriod] = usePersisted<Period>('hris.dash.momentPeriod', 'today', ['today', 'month']);
  const [lsaYear, setLsaYear] = useState<string | null>(null); // null = tahun berjalan (atau tahun pertama yang tersedia)
  if (q.isPending) return <Card><Spinner /></Card>;
  if (!q.data) return <Card><ErrorNote error={q.error} /></Card>;
  const d = q.data;
  const miss = d.missing;

  const body = () => {
    if (tab === 'bd') {
      const items = period === 'today' ? d.birthdays.filter((b) => b.today) : d.birthdays;
      if (!items.length) return <p className="py-3 text-center text-sm text-muted">{period === 'today' ? 'Tidak ada yang berulang tahun hari ini.' : `Tidak ada yang berulang tahun pada ${monthLabel(d.month)}.`}</p>;
      return <ul className="divide-y divide-line">{items.map((b) => <PersonRow key={b.id} name={b.name} department={b.department} right={dayMonth(b.date)} sub={b.today ? 'Hari ini' : undefined} />)}</ul>;
    }
    if (tab === 'ann') {
      const items = period === 'today' ? d.anniversaries.filter((a) => a.today) : d.anniversaries;
      if (!items.length) return <p className="py-3 text-center text-sm text-muted">{period === 'today' ? 'Tidak ada ulang tahun kerja hari ini.' : `Tidak ada ulang tahun kerja pada ${monthLabel(d.month)}.`}</p>;
      return <ul className="divide-y divide-line">{items.map((a) => <PersonRow key={a.id} name={a.name} department={a.department} right={<span className="font-semibold">{a.years} tahun</span>} sub={`${dayMonth(a.date)}${a.lsa ? ' · LSA' : ''}`} />)}</ul>;
    }
    if (!d.lsa.length) return <p className="py-3 text-center text-sm text-muted">Belum ada karyawan yang mencapai tonggak LSA.</p>;
    // Filter tahun kalender: tonggak yang jatuh pada tahun itu, lalu dikelompokkan per tonggak masa kerja (5-21 tahun).
    const yearsAvail = [...new Set(d.lsa.map((i) => i.date.slice(0, 4)))].sort();
    const year = lsaYear && yearsAvail.includes(lsaYear) ? lsaYear : yearsAvail.includes(d.today.slice(0, 4)) ? d.today.slice(0, 4) : yearsAvail[0]!;
    const inYear = d.lsa.filter((i) => i.date.slice(0, 4) === year);
    return (
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Tahun</span>
          <Select value={year} onChange={(e) => setLsaYear(e.target.value)} aria-label="Pilih tahun LSA" className="min-h-11 w-auto">
            {yearsAvail.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </label>
        {!inYear.length && <p className="py-3 text-center text-sm text-muted">Tidak ada karyawan yang mencapai tonggak LSA pada {year}.</p>}
        {LSA_YEARS.map((years) => {
          const list = inYear.filter((i) => i.years === years);
          if (!list.length) return null;
          return (
            <section key={years} aria-label={`${years} tahun`}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{years} tahun · {list.length} orang</h3>
              <ul className="divide-y divide-line">{list.map((i) => <PersonRow key={`${i.id}-${i.years}`} name={i.name} department={i.department} right={<span className="font-semibold">{dayMonth(i.date)} {i.date.slice(0, 4)}</span>} sub={lsaStatus(i)} />)}</ul>
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Momen karyawan</h2>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'bd', label: 'Ulang tahun' }, { value: 'ann', label: 'Masa kerja' }, { value: 'lsa', label: 'LSA' }]} />
      {tab !== 'lsa' && <Segmented value={period} onChange={setPeriod} options={[{ value: 'today', label: 'Hari ini' }, { value: 'month', label: monthLabel(d.month) }]} />}
      <div className="flex items-center gap-2 text-xs text-muted" aria-hidden="true">
        {tab === 'bd' ? <Cake className="size-4" /> : tab === 'ann' ? <Briefcase className="size-4" /> : <Award className="size-4" />}
        <span>{tab === 'bd' ? 'Ulang tahun karyawan aktif' : tab === 'ann' ? 'Ulang tahun masa kerja (minimal 1 tahun); "LSA" menandai tonggak penghargaan' : `Long Service Award: ${LSA_YEARS.join(', ')} tahun, semua tanggal`}</span>
      </div>
      {body()}
      {(miss.birthDate > 0 || miss.joinDate > 0) && (
        <p className="rounded-xl bg-sub p-3 text-sm text-muted">
          {[miss.birthDate > 0 && `${miss.birthDate} dari ${d.total} karyawan belum punya tanggal lahir`, miss.joinDate > 0 && `${miss.joinDate} belum punya tanggal masuk`].filter(Boolean).join(', ')}, jadi tidak muncul di daftar ini.{' '}
          <Link to="/admin/karyawan" className="font-medium underline">Lengkapi di Karyawan</Link>
        </p>
      )}
    </Card>
  );
}
