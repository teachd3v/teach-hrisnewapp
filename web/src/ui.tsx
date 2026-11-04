// Komponen dasar tampilan aplikasi. Target sentuh >= 48 px, umpan balik tekan lewat warna (tanpa menggeser tata letak).
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

const BUTTON = {
  primary: 'bg-primary text-primary-fg active:bg-black disabled:opacity-40',
  secondary: 'border border-field bg-surface text-fg active:bg-sub disabled:opacity-40',
  danger: 'bg-bad text-white active:bg-red-900 disabled:opacity-40',
  ghost: 'text-fg active:bg-sub disabled:opacity-40',
} as const;

export function Button({ variant = 'primary', loading, className, children, disabled, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; loading?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      disabled={disabled || loading}
      className={cx('inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-medium transition-colors', BUTTON[variant], className)}
    >
      {loading && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

const FIELD = 'min-h-12 w-full rounded-xl border border-field bg-surface px-3 text-base text-fg placeholder:text-muted disabled:bg-sub disabled:text-muted';

/** Label selalu terlihat (bukan placeholder), galat tepat di bawah kolom. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (id: string, describedBy: string | undefined) => ReactNode }) {
  const id = useId();
  const descId = `${id}-d`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children(id, error || hint ? descId : undefined)}
      {error ? <p id={descId} role="alert" className="text-sm text-bad">{error}</p> : hint ? <p id={descId} className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(FIELD, className)} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(FIELD, className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(FIELD, 'py-2', className)} />;

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx('rounded-2xl border border-line bg-surface p-4', className)} />;
}

const CHIP = {
  ok: 'bg-ok-bg text-ok', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad', info: 'bg-info-bg text-info', neutral: 'bg-sub text-muted',
} as const;
/** Status selalu berupa teks (warna bukan satu-satunya penanda). */
export const Chip = ({ tone = 'neutral', children }: { tone?: keyof typeof CHIP; children: ReactNode }) => (
  <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', CHIP[tone])}>{children}</span>
);

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-sub p-1">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('min-h-11 rounded-lg px-3 text-sm font-medium transition-colors', value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted active:bg-line')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Spinner = ({ label = 'Memuat…' }: { label?: string }) => (
  <div role="status" className="flex items-center justify-center gap-2 py-10 text-muted"><Loader2 className="size-5 animate-spin" aria-hidden="true" />{label}</div>
);

export function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="flex flex-col items-center gap-3 py-12 text-center text-muted"><div className="text-muted" aria-hidden="true">{icon}</div><p>{children}</p></div>;
}

export const ErrorNote = ({ error }: { error: unknown }) =>
  error ? <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm text-bad">{(error as Error).message}</p> : null;

/** Bilah aksi menempel di bawah area gulir, di atas inset aman. */
export function BottomBar({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{children}</div>;
}

/** Lembar dari bawah. Esc/ketuk latar menutup; fokus dipindah ke lembar dan dikembalikan saat ditutup. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="scrim-in absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="sheet-in relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
        <h2 id={titleId} className="mb-3 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
