// Komponen dasar tampilan aplikasi. Target sentuh >= 48 px, umpan balik tekan lewat warna (tanpa menggeser tata letak).
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

const BUTTON = {
  primary: 'bg-primary text-primary-fg shadow-primary active:bg-[#0b5f58] disabled:opacity-40 disabled:shadow-none',
  secondary: 'border border-line bg-surface text-fg shadow-sm active:bg-sub disabled:opacity-40',
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
/** Kolom password dengan tombol lihat/sembunyikan. */
export function PasswordInput({ className, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...p} type={shown ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={cx(FIELD, 'pr-12', className)} />
      <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Sembunyikan password' : 'Lihat password'} aria-pressed={shown}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-muted active:text-fg">
        {shown ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
      </button>
    </div>
  );
}
export const Select =({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(FIELD, className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(FIELD, 'py-2', className)} />;

/** Warna penanda tepi kiri kartu (kode status/kategori). Selalu dipasangkan dengan teks/chip: warna bukan satu-satunya penanda. */
const ACCENT = { ok: 'bg-green-600', warn: 'bg-amber-500', bad: 'bg-red-600', info: 'bg-blue-600', neutral: 'bg-slate-300' } as const;

/** Kartu melayang: putih, bayangan lembut tanpa garis tepi. `accent` menambah penanda warna di tepi kiri. */
export function Card({ className, accent, children, ...p }: React.HTMLAttributes<HTMLDivElement> & { accent?: keyof typeof ACCENT }) {
  return (
    <div {...p} className={cx('rounded-2xl bg-surface p-4 shadow-card', accent && 'relative overflow-hidden pl-5', className)}>
      {accent && <span aria-hidden="true" className={cx('absolute inset-y-4 left-0 w-1 rounded-r-full', ACCENT[accent])} />}
      {children}
    </div>
  );
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
    // Kolom sama lebar (minmax(0,1fr)), bukan menyesuaikan teks terpanjang; dengan 4 tab atau lebih, padding dan huruf dirapatkan agar muat di layar sempit.
    <div role="tablist" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} className="grid gap-1 rounded-xl bg-sub p-1">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('min-h-11 min-w-0 rounded-lg font-medium whitespace-nowrap transition-colors', options.length > 4 ? 'px-0.5 text-xs' : options.length > 3 ? 'px-0.5 text-[13px]' : 'px-3 text-sm', value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted active:bg-line')}>
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
  return <div className="sticky bottom-0 z-10 -mx-4 mt-auto rounded-t-3xl bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(30,41,59,0.08)] after:absolute after:inset-x-0 after:top-full after:h-8 after:bg-surface">{children}</div>;
}

/** Lembar dari bawah. Esc/ketuk latar menutup; fokus dipindah ke lembar dan dikembalikan saat ditutup. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // `onClose` biasanya fungsi baru di tiap render induk. Disimpan di ref supaya efek di bawah HANYA jalan saat lembar
  // dibuka/ditutup. Bila efek ikut bergantung pada `onClose`, setiap ketikan di kolom (yang me-render ulang induk)
  // mengembalikan fokus ke tombol pembuka lalu merebutnya ke lembar: pengguna hanya bisa mengetik satu huruf.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  // Elemen pembuka dicatat saat render pertama dengan open=true (sebelum kolom autoFocus mengambil fokus), agar fokus bisa dikembalikan ke sana.
  const openerRef = useRef<HTMLElement | null>(null);
  if (open && !openerRef.current) openerRef.current = document.activeElement as HTMLElement | null;
  if (!open) openerRef.current = null;
  useEffect(() => {
    if (!open) return;
    const prev = openerRef.current;
    // Pindahkan fokus ke lembar hanya bila belum ada elemen di dalamnya yang berfokus (mis. kolom dengan autoFocus).
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open]);
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
