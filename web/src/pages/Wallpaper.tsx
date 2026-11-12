import { useRef, useState, type ReactNode } from 'react';
import { Check, ImageOff, ImagePlus, Trash2 } from 'lucide-react';
import { ACCEPT, MAX_TRANSPARENCY, useWallpaper } from '../lib/wallpaper';
import { CATEGORY_LABEL, CATEGORY_ORDER, PRESETS, findPreset, presetThumbUrl } from '../lib/wallpaper-presets';
import { Button, Card, ErrorNote, cx } from '../ui';

/** Satu pilihan gambar: gambar mini dengan tanda centang bila sedang dipakai. */
function Tile({ selected, label, onClick, children }: { selected: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} aria-label={label} onClick={onClick}
      className={cx('relative aspect-[1080/2345] w-full overflow-hidden rounded-xl bg-sub shadow-card transition-shadow active:opacity-80', selected && 'ring-[3px] ring-primary ring-offset-2 ring-offset-bg')}>
      {children}
      {selected && <span aria-hidden="true" className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-primary text-primary-fg shadow-md"><Check className="size-4" /></span>}
    </button>
  );
}

/** Pengaturan wallpaper. Latar halaman ini ikut berubah langsung saat pilihan diganti atau slider digeser. */
export default function Wallpaper() {
  const { choice, url, customUrl, transparency, minTransparency, supported, setImage, removeCustom, select, setTransparency } = useWallpaper();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try { await setImage(file); } catch (e) { setError(e as Error); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  const activePreset = choice.kind === 'preset' ? findPreset(choice.id) : null;
  const activeName = choice.kind === 'custom' ? 'Gambarku' : activePreset?.title ?? null;
  const thumb = choice.kind === 'custom' ? customUrl : activePreset ? presetThumbUrl(activePreset) : null;
  const active = choice.kind !== 'none';

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center gap-4">
        <span aria-hidden="true" className="grid h-24 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-sub bg-cover bg-center text-muted" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
          {!thumb && <ImageOff className="size-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{activeName ?? 'Tanpa wallpaper'}</p>
          <p className="text-sm text-muted">{active ? 'Tampil di belakang semua halaman, juga di kartu hari ini.' : 'Pilih salah satu di bawah, atau unggah gambarmu sendiri.'}</p>
        </div>
      </Card>

      {CATEGORY_ORDER.map((cat) => (
        <section key={cat} aria-labelledby={`wp-${cat}`} className="flex flex-col gap-2">
          <h2 id={`wp-${cat}`} className="text-base font-extrabold">{CATEGORY_LABEL[cat]}</h2>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.filter((p) => p.category === cat).map((p) => (
              <Tile key={p.id} label={p.title} selected={choice.kind === 'preset' && choice.id === p.id} onClick={() => select({ kind: 'preset', id: p.id })}>
                <img src={presetThumbUrl(p)} alt="" loading="lazy" className="size-full object-cover" />
              </Tile>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="wp-own" className="flex flex-col gap-2">
        <h2 id="wp-own" className="text-base font-extrabold">Gambarku</h2>
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void pick(e.target.files?.[0])} />
        <div className="grid grid-cols-4 gap-2">
          {customUrl && (
            <Tile label="Gambarku" selected={choice.kind === 'custom'} onClick={() => select({ kind: 'custom' })}>
              <img src={customUrl} alt="" className="size-full object-cover" />
            </Tile>
          )}
        </div>
        <Button variant={customUrl ? 'secondary' : 'primary'} loading={busy} onClick={() => input.current?.click()}>
          <ImagePlus className="size-5" aria-hidden="true" />{customUrl ? 'Ganti dengan gambar lain' : 'Unggah gambar sendiri'}
        </Button>
        {customUrl && <Button variant="secondary" onClick={() => void removeCustom()}><Trash2 className="size-5" aria-hidden="true" />Hapus gambarku</Button>}
        <ErrorNote error={error} />
      </section>

      {active && (
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

      {active && <Button variant="secondary" onClick={() => select({ kind: 'none' })}><ImageOff className="size-5" aria-hidden="true" />Tanpa wallpaper</Button>}

      <p className="text-sm text-muted">
        {supported
          ? 'Gambar unggahanmu tersimpan di perangkat ini saja dan hanya terlihat olehmu. Di HP atau komputer lain, unggah lagi.'
          : 'Penyimpanan di perangkat ini tidak tersedia (mungkin mode privat), jadi gambar unggahan hanya berlaku selama aplikasi terbuka.'}
      </p>
    </div>
  );
}
