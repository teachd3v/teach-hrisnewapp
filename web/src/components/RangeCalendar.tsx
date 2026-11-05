import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from '../ui';

// Kalender bulanan dengan rentang tanggal terbatas. Tanggal di luar [min, max] adalah tombol `disabled`
// (tidak bisa diketuk, dilewati keyboard dan pembaca layar), bukan sekadar batas pada input bawaan browser
// yang perilakunya berbeda-beda per perangkat/WebView.

const DAY_NAMES = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const monthKey = (y: number, m: number) => y * 12 + m;
const parse = (s: string) => ({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 });

const longDate = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthTitle = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toLocaleDateString('id-ID', { timeZone: 'UTC', month: 'long', year: 'numeric' });

export default function RangeCalendar({ value, onChange, min, max, today }: { value: string; onChange: (v: string) => void; min: string; max: string; today: string }) {
  const start = value || max;
  const [view, setView] = useState(() => parse(start));
  const minM = parse(min), maxM = parse(max);
  const canPrev = monthKey(view.y, view.m) > monthKey(minM.y, minM.m);
  const canNext = monthKey(view.y, view.m) < monthKey(maxM.y, maxM.m);

  const step = (delta: number) => setView((v) => { const t = v.y * 12 + v.m + delta; return { y: Math.floor(t / 12), m: t % 12 }; });

  const first = new Date(Date.UTC(view.y, view.m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Senin = 0
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="rounded-2xl border border-line bg-surface p-3" role="group" aria-label="Pilih tanggal">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => step(-1)} disabled={!canPrev} aria-label="Bulan sebelumnya" className="grid size-11 place-items-center rounded-full active:bg-sub disabled:opacity-30"><ChevronLeft className="size-5" aria-hidden="true" /></button>
        <p className="font-semibold capitalize" aria-live="polite">{monthTitle(view.y, view.m)}</p>
        <button type="button" onClick={() => step(1)} disabled={!canNext} aria-label="Bulan berikutnya" className="grid size-11 place-items-center rounded-full active:bg-sub disabled:opacity-30"><ChevronRight className="size-5" aria-hidden="true" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-medium text-muted" aria-hidden="true">{DAY_NAMES.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const date = ymd(view.y, view.m, d);
          const allowed = date >= min && date <= max;
          const selected = date === value;
          return (
            <button
              key={i} type="button" disabled={!allowed} aria-pressed={selected} aria-label={`${longDate(date)}${allowed ? '' : ', tidak dapat dipilih'}`}
              onClick={() => onChange(date)}
              className={cx(
                'mx-auto grid size-11 place-items-center rounded-full text-base transition-colors',
                selected ? 'bg-primary font-bold text-primary-fg' : allowed ? 'font-semibold active:bg-sub' : 'cursor-not-allowed text-muted/40',
                date === today && !selected && 'ring-1 ring-inset ring-field',
              )}
            >{d}</button>
          );
        })}
      </div>
    </div>
  );
}
