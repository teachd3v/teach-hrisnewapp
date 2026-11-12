import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from '../../ui';

/** Persisten ringan di perangkat (pilihan tab/mode terakhir). Aman bila penyimpanan tidak tersedia. */
export function usePersisted<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => { try { const v = localStorage.getItem(key) as T | null; return v && allowed.includes(v) ? v : fallback; } catch { return fallback; } });
  const set = (v: T) => { setValue(v); try { localStorage.setItem(key, v); } catch { /* pilihan tidak diingat */ } };
  return [value, set] as const;
}

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';
const TONE: Record<Tone, string> = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', neutral: '' };

/** Kotak angka ringkas. Angka besar, keterangan kecil; warna hanya pelengkap (label selalu teks). */
export function Stat({ label, value, sub, tone = 'neutral' }: { label: string; value: ReactNode; sub?: string; tone?: Tone }) {
  return (
    <div className="rounded-xl bg-sub p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={cx('text-2xl font-bold leading-tight', TONE[tone])}>{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Progress({ pct, label }: { pct: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-sub" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${v}%` }} />
    </div>
  );
}

/** Pemilih periode ‹ label ›. Tombol mundur/maju berukuran sentuh 44 px. */
export function PeriodNav({ label, onPrev, onNext, prevDisabled, nextDisabled, extra }: { label: string; onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean; extra?: ReactNode }) {
  const btn = 'grid size-11 place-items-center rounded-full active:bg-sub disabled:opacity-30';
  return (
    <div className="flex items-center justify-between gap-1">
      <button type="button" className={btn} onClick={onPrev} disabled={prevDisabled} aria-label="Sebelumnya"><ChevronLeft className="size-5" aria-hidden="true" /></button>
      <div className="flex min-w-0 flex-col items-center"><span className="truncate text-sm font-semibold">{label}</span>{extra}</div>
      <button type="button" className={btn} onClick={onNext} disabled={nextDisabled} aria-label="Berikutnya"><ChevronRight className="size-5" aria-hidden="true" /></button>
    </div>
  );
}

/** Daftar yang bisa dibuka. Hanya `limit` baris pertama tampil, sisanya lewat "Tampilkan semua". */
export function Disclosure({ title, count, children, defaultOpen = false }: { title: string; count: number; children: ReactNode[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [all, setAll] = useState(false);
  const LIMIT = 8;
  if (count === 0) return null;
  return (
    <div className="rounded-xl bg-bg">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-12 w-full items-center gap-2 px-3 text-left font-medium active:bg-sub">
        <span className="flex-1">{title}</span>
        <span className="rounded-full bg-sub px-2 py-0.5 text-xs font-semibold">{count}</span>
        <ChevronDown className={cx('size-5 text-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div className="border-t border-line px-3">
          <ul className="divide-y divide-line">{all ? children : children.slice(0, LIMIT)}</ul>
          {children.length > LIMIT && !all && <button type="button" onClick={() => setAll(true)} className="min-h-11 w-full text-sm font-medium underline">Tampilkan semua ({children.length})</button>}
        </div>
      )}
    </div>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** Satu baris orang: inisial, nama, departemen, dan keterangan di kanan. */
export function PersonRow({ name, department, right, sub }: { name: string; department?: string; right?: ReactNode; sub?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-sub text-xs font-semibold text-muted">{initials(name)}</span>
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{name}</span><span className="block truncate text-sm text-muted">{department || 'Tanpa departemen'}</span></span>
      {(right || sub) && <span className="shrink-0 text-right text-sm">{right}{sub && <span className="block text-xs text-muted">{sub}</span>}</span>}
    </li>
  );
}
