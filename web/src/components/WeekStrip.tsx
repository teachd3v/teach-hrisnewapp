import { cx } from '../ui';
import { WEEKDAY_SHORT } from '../lib/week';
import type { Tone } from '../lib/attendance-types';

export interface WeekDay { date: string; dot: Tone | null }

const DOT: Record<Tone, string> = { ok: 'bg-green-600', warn: 'bg-amber-500', bad: 'bg-red-600', info: 'bg-blue-600', neutral: 'bg-slate-400' };
const DOT_TEXT: Record<Tone, string> = { ok: 'tepat waktu', warn: 'terlambat', bad: 'bermasalah', info: 'izin disetujui', neutral: '' };

/**
 * Jalur hari Senin-Jumat: kotak tanggal, penanda titik berwarna (dengan teks untuk pembaca layar), hari terpilih biru.
 * Tanpa `onSelect` jalur hanya tampilan; hari setelah `today` tidak bisa dipilih.
 */
export default function WeekStrip({ days, today, selected, onSelect }: { days: WeekDay[]; today: string; selected?: string; onSelect?: (date: string) => void }) {
  return (
    <ul className="grid grid-cols-5 gap-2">
      {days.map((d, i) => {
        const isSel = d.date === selected;
        const future = d.date > today;
        const num = Number(d.date.slice(8));
        const status = d.dot ? DOT_TEXT[d.dot] : '';
        const label = `${WEEKDAY_SHORT[i]} ${num}${d.date === today ? ', hari ini' : ''}${status ? `, ${status}` : ''}`;
        const body = (
          <>
            <span className={cx('text-[11px] font-semibold', isSel ? 'text-blue-100' : 'text-muted')}>{WEEKDAY_SHORT[i]}</span>
            <span className={cx('text-lg font-extrabold leading-tight', !isSel && d.date === today && 'text-blue-700', future && !isSel && 'text-muted')}>{num}</span>
            <span aria-hidden="true" className={cx('mt-1 size-1.5 rounded-full', d.dot ? (isSel ? 'bg-white' : DOT[d.dot]) : 'bg-transparent')} />
          </>
        );
        const base = 'flex min-h-16 w-full flex-col items-center justify-center rounded-2xl py-2 transition-colors';
        return (
          <li key={d.date}>
            {onSelect && !future ? (
              <button type="button" aria-label={label} aria-pressed={isSel} onClick={() => onSelect(d.date)}
                className={cx(base, isSel ? 'bg-blue-600 text-white shadow-[0_8px_16px_rgba(37,99,235,0.35)]' : 'bg-surface shadow-card active:bg-sub')}>{body}</button>
            ) : (
              <div role="img" aria-label={label} className={cx(base, isSel ? 'bg-blue-600 text-white' : 'bg-surface shadow-card', future && 'opacity-60')}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
