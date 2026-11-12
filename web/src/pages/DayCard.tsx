import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarX2, Download, Share2 } from 'lucide-react';
import { workDuration } from '@hris/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtLongDate, fmtTime } from '../lib/attendance-types';
import { renderDayCard } from '../lib/day-card';
import { pickQuote } from '../lib/quotes';
import { dotFor, todayWib, useRecordsByDate } from '../lib/week';
import { useWallpaper } from '../lib/wallpaper';
import { Button, Empty, ErrorNote, Spinner, cx } from '../ui';

const PHOTO_PREF = 'hris.cardPhoto';
const WALLPAPER_PREF = 'hris.cardWallpaper';
const readPref = (key: string) => { try { return localStorage.getItem(key) !== '0'; } catch { return true; } };

/** Saklar satu baris. */
function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-surface px-4 text-left shadow-card active:bg-sub">
      <span className="font-medium">{label}</span>
      <span aria-hidden="true" className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-field')}>
        <span className={cx('absolute top-0.5 size-6 rounded-full bg-white transition-all', checked ? 'left-[1.375rem]' : 'left-0.5')} />
      </span>
    </button>
  );
}

/** Foto presensi milik sendiri lewat tautan bertanda tangan; gagal = tanpa foto (kartu memakai inisial). */
function usePunchPhoto(key: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['punch-photo', key],
    enabled: Boolean(key) && enabled,
    staleTime: 4 * 60_000,
    retry: false,
    queryFn: async () => {
      const { url } = await api<{ url: string }>('/files/link', { method: 'POST', json: { key } });
      const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
      const res = await fetch(url.startsWith('/api') ? `${base}${url}` : url);
      if (!res.ok) throw new Error('Foto tidak dapat dimuat');
      return res.blob();
    },
  });
}

/** Percikan konfeti singkat saat kartu baru dibuat (hilang sendiri; bagi yang mematikan animasi langsung tak terlihat). */
function Confetti() {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(false), 3200); return () => clearTimeout(t); }, []);
  const bits = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 7) * 0.12, color: ['#0f766e', '#2563eb', '#f59e0b', '#db2777', '#7c3aed'][i % 5]!, size: 6 + (i % 4) * 2 })), []);
  if (!on) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
      {bits.map((b, i) => <span key={i} className="confetti-bit absolute -top-4 rounded-sm" style={{ left: `${b.left}%`, width: b.size, height: b.size * 1.6, background: b.color, animationDelay: `${b.delay}s` }} />)}
    </div>
  );
}

export default function DayCard() {
  const { user } = useAuth();
  const nav = useLocation().state as { fresh?: boolean; flash?: string; faceWarn?: string | null } | null;
  const [params] = useSearchParams();
  const today = todayWib();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : today;
  const { byDate, all, pending } = useRecordsByDate([date]);
  const rec = byDate.get(date);

  const [showPhoto, setShowPhoto] = useState(() => readPref(PHOTO_PREF));
  const setPhoto = (v: boolean) => { setShowPhoto(v); try { localStorage.setItem(PHOTO_PREF, v ? '1' : '0'); } catch { /* preferensi tidak tersimpan */ } };
  const wp = useWallpaper();
  const [useWp, setUseWpState] = useState(() => readPref(WALLPAPER_PREF));
  const setUseWp = (v: boolean) => { setUseWpState(v); try { localStorage.setItem(WALLPAPER_PREF, v ? '1' : '0'); } catch { /* preferensi tidak tersimpan */ } };
  const wpBlob = useWp ? wp.blob : null;
  const wpAlpha = 1 - wp.transparency / 100;

  const inPhoto = usePunchPhoto(rec?.in?.photo, showPhoto);
  const outPhoto = usePunchPhoto(rec?.out?.photo, showPhoto);
  const photosBusy = showPhoto && ((Boolean(rec?.in?.photo) && inPhoto.isPending) || (Boolean(rec?.out?.photo) && outPhoto.isPending));

  const complete = Boolean(rec?.clock_in && rec.clock_out);
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || 'kamu';
  const quote = useMemo(() => pickQuote(user?.id ?? '', date), [user?.id, date]);
  const onTimeDays = useMemo(() => all.filter((r) => r.date <= date && ['ok', 'info'].includes(dotFor(r) ?? '')).length, [all, date]);
  const inTime = fmtTime(rec?.clock_in ?? null);
  const outTime = fmtTime(rec?.clock_out ?? null);
  const duration = (rec?.clock_in && rec.clock_out ? workDuration(rec.clock_in, rec.clock_out) : null) ?? '';

  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!complete || photosBusy) return;
    let cancelled = false;
    let url: string | null = null;
    const bitmaps: ImageBitmap[] = [];
    (async () => {
      try {
        const load = async (b: Blob | undefined) => { if (!showPhoto || !b) return null; try { const bm = await createImageBitmap(b); bitmaps.push(bm); return bm; } catch { return null; } };
        const [a, b] = await Promise.all([load(inPhoto.data), load(outPhoto.data)]);
        let w: ImageBitmap | null = null;
        if (wpBlob) { try { w = await createImageBitmap(wpBlob); bitmaps.push(w); } catch { w = null; } }
        const png = await renderDayCard({ firstName, date, inTime, outTime, duration, onTimeDays, quote: quote.text, inPhoto: a, outPhoto: b, wallpaper: w, wallpaperAlpha: wpAlpha });
        if (cancelled) return;
        url = URL.createObjectURL(png);
        setBlob(png);
        setCardUrl(url);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Kartu gagal dibuat');
      }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); for (const bm of bitmaps) bm.close(); };
  }, [complete, photosBusy, showPhoto, inPhoto.data, outPhoto.data, firstName, date, inTime, outTime, duration, onTimeDays, quote.text, wpBlob, wpAlpha]);

  const canShareFiles = useMemo(() => typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'a.png', { type: 'image/png' })] }), []);
  const fileName = `hari-kerja-${date}.png`;
  async function share() {
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/png' });
    try {
      if (canShareFiles && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Hari kerja hari ini' }); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Gagal membagikan kartu. Coba lagi atau ambil tangkapan layar.');
    }
  }

  if (pending) return <Spinner />;
  if (!complete) {
    return (
      <Empty icon={<CalendarX2 className="size-10" />}>
        {rec?.clock_in ? 'Kartu tersedia setelah presensi pulang.' : 'Belum ada presensi pada tanggal ini.'}
        <Link to="/" className="mt-3 block min-h-11 py-2 font-semibold text-blue-700 underline">Kembali ke Beranda</Link>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {nav?.fresh && <Confetti />}
      {nav?.flash && <p role="status" className="rounded-2xl bg-ok-bg p-3 text-sm font-medium text-ok">{nav.flash}</p>}
      {nav?.faceWarn && <p role="status" className="rounded-2xl bg-warn-bg p-3 text-sm font-medium text-warn">{nav.faceWarn}</p>}

      <div className="mx-auto w-full max-w-[320px]">
        <div className="aspect-[9/16] overflow-hidden rounded-3xl bg-surface shadow-card">
          {cardUrl && !photosBusy ? (
            <img src={cardUrl} width={1080} height={1920} className="size-full"
              alt={`Kartu hari kerja ${fmtLongDate(date)}: masuk ${inTime}, pulang ${outTime}, kerja ${duration}. ${quote.text}`} />
          ) : <Spinner label="Menyiapkan kartu…" />}
        </div>
      </div>

      <SwitchRow label="Tampilkan foto saya di kartu" checked={showPhoto} onChange={setPhoto} />
      {wp.blob && <SwitchRow label="Pakai wallpaperku di kartu" checked={useWp} onChange={setUseWp} />}

      <ErrorNote error={error ? new Error(error) : null} />
      <Button onClick={() => void share()} disabled={!blob || photosBusy} className="w-full">
        {canShareFiles ? <Share2 className="size-5" aria-hidden="true" /> : <Download className="size-5" aria-hidden="true" />}
        {canShareFiles ? 'Bagikan' : 'Unduh gambar'}
      </Button>
      <Link to="/" className="flex min-h-12 items-center justify-center rounded-2xl font-semibold text-muted active:bg-sub">Selesai</Link>
    </div>
  );
}
