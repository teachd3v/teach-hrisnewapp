import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { fmtLongDate } from '../lib/attendance-types';
import RangeCalendar from './RangeCalendar';
import { Sheet, cx } from '../ui';

/** Kolom tanggal yang membuka kalender di lembar bawah (tanggal di luar [min, max] tidak bisa diketuk). */
export default function DateField({ label, value, onChange, min, max, today }: { label: string; value: string; onChange: (v: string) => void; min: string; max: string; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${label}: ${value ? fmtLongDate(value) : 'belum dipilih'}. Ketuk untuk mengubah`}
        className={cx('flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-field bg-surface px-3 text-left active:bg-sub', !value && 'text-muted')}>
        <span className="truncate">{value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : 'Pilih tanggal'}</span>
        <CalendarDays className="size-5 shrink-0 text-muted" aria-hidden="true" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <RangeCalendar value={value} min={min} max={max} today={today} onChange={(d) => { onChange(d); setOpen(false); }} />
        <p className="mt-3 text-sm text-muted">Tanggal yang pudar tidak dapat dipilih.</p>
      </Sheet>
    </div>
  );
}
