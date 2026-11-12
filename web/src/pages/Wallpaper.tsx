import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { ACCEPT, MAX_TRANSPARENCY, useWallpaper } from '../lib/wallpaper';
import { Button, Card, ErrorNote } from '../ui';

/** Pengaturan wallpaper pribadi. Latar halaman ini ikut berubah langsung saat gambar diganti atau slider digeser. */
export default function Wallpaper() {
  const { url, transparency, minTransparency, supported, setImage, setTransparency, clear } = useWallpaper();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try { await setImage(file); } catch (e) { setError(e as Error); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center gap-4">
        <span aria-hidden="true" className="grid h-24 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-sub bg-cover bg-center text-muted" style={url ? { backgroundImage: `url(${url})` } : undefined}>
          {!url && <ImagePlus className="size-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{url ? 'Wallpaper aktif' : 'Belum ada wallpaper'}</p>
          <p className="text-sm text-muted">{url ? 'Tampil di belakang semua halaman aplikasi.' : 'Pilih foto atau gambar dari galerimu untuk jadi latar aplikasi.'}</p>
        </div>
      </Card>

      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void pick(e.target.files?.[0])} />
      <Button loading={busy} onClick={() => input.current?.click()}>
        <ImagePlus className="size-5" aria-hidden="true" />{url ? 'Ganti gambar' : 'Pilih gambar'}
      </Button>
      <ErrorNote error={error} />

      {url && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <label htmlFor="wp-transparency" className="font-bold">Transparansi</label>
            <span className="font-semibold tabular-nums" aria-hidden="true">{transparency}%</span>
          </div>
          <input id="wp-transparency" type="range" min={minTransparency} max={MAX_TRANSPARENCY} step={5} value={transparency}
            aria-valuetext={`${transparency} persen`} onChange={(e) => setTransparency(Number(e.target.value))}
            className="h-11 w-full accent-primary" />
          <div className="flex justify-between text-xs text-muted" aria-hidden="true"><span>Jelas</span><span>Samar</span></div>
          {minTransparency > 0 && (
            <p role="status" className="rounded-xl bg-info-bg p-3 text-sm text-info">Gambar ini cukup gelap, jadi paling jelasnya dibatasi di {minTransparency}% agar teks di luar kartu tetap terbaca.</p>
          )}
        </Card>
      )}

      {url && <Button variant="secondary" onClick={() => void clear()}><Trash2 className="size-5" aria-hidden="true" />Hapus wallpaper</Button>}

      <p className="text-sm text-muted">
        {supported
          ? 'Wallpaper tersimpan di perangkat ini saja dan hanya terlihat olehmu. Di HP atau komputer lain, unggah lagi.'
          : 'Penyimpanan di perangkat ini tidak tersedia (mungkin mode privat), jadi wallpaper hanya berlaku selama aplikasi terbuka.'}
      </p>
    </div>
  );
}
