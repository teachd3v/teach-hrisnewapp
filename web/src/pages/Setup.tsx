import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { BellRing, Check, ImagePlus, ScanFace } from 'lucide-react';
import { enablePush } from '../lib/push';
import { useFaceStatus } from '../lib/face-status';
import { ACCEPT, useWallpaper } from '../lib/wallpaper';
import { PRESETS, presetThumbUrl } from '../lib/wallpaper-presets';
import { usePushState } from '../components/PushCard';
import WallpaperLayer from '../components/WallpaperLayer';
import { Button, ErrorNote, Spinner, cx } from '../ui';
import FaceEnroll from './FaceEnroll';

type StepKey = 'push' | 'face' | 'wallpaper';

/** Wallpaper bawaan yang ditawarkan di sini (sebagian saja; galeri lengkap ada di Akun > Wallpaper). */
const PICK_IDS = ['pastel_sky_white_clouds', 'calm_coast_twilight_minimalist', 'green_hills_sunny_sky', 'lone_tree_ocean_view', 'countryside_river_windmills', 'santorini_coastal_town'];
const PICKS = PRESETS.filter((p) => PICK_IDS.includes(p.id));

/** Kerangka satu langkah: ikon, judul, satu kalimat, lalu tombol di bawah. Satu layar, satu aksi. */
function Intro({ icon, title, body, children, actions }: { icon?: ReactNode; title: string; body: string; children?: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        {icon && <span className="grid size-20 place-items-center rounded-3xl bg-surface text-primary shadow-card" aria-hidden="true">{icon}</span>}
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="max-w-xs text-muted">{body}</p>
        {children}
      </div>
      <div className="flex flex-col gap-2 pt-4">{actions}</div>
    </div>
  );
}

function PushStep({ onNext }: { onNext: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Intro icon={<BellRing className="size-9" />} title="Aktifkan notifikasi" body="Pengingat presensi dan kabar persetujuan izin muncul di layar HP, meski aplikasi tidak dibuka."
      actions={(
        <>
          <ErrorNote error={error} />
          <Button loading={busy} onClick={() => { setBusy(true); setError(null); enablePush().then(onNext, (e: unknown) => { setError(e); setBusy(false); }); }}>Aktifkan</Button>
          <Button variant="ghost" onClick={onNext}>Nanti</Button>
        </>
      )} />
  );
}

function WallpaperStep({ onNext }: { onNext: () => void }) {
  const { choice, setImage, select } = useWallpaper();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const active = choice.kind !== 'none';

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try { await setImage(file); } catch (e) { setError(e as Error); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  return (
    <Intro title="Pilih wallpaper" body="Opsional. Bisa diganti kapan saja di Akun."
      actions={(
        <>
          {active && <Button onClick={onNext}>Pakai wallpaper ini</Button>}
          <Button variant={active ? 'ghost' : 'secondary'} onClick={() => { if (active) select({ kind: 'none' }); onNext(); }}>{active ? 'Tanpa wallpaper' : 'Lewati'}</Button>
        </>
      )}>
      <div className="mt-2 grid w-full grid-cols-3 gap-2">
        {PICKS.map((p) => {
          const selected = choice.kind === 'preset' && choice.id === p.id;
          return (
            <button key={p.id} type="button" aria-pressed={selected} aria-label={p.title} onClick={() => select({ kind: 'preset', id: p.id })}
              className={cx('relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-sub shadow-card active:opacity-80', selected && 'ring-[3px] ring-primary ring-offset-2 ring-offset-bg')}>
              <img src={presetThumbUrl(p)} alt="" className="size-full object-cover" />
              {selected && <span aria-hidden="true" className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-primary text-primary-fg shadow-md"><Check className="size-4" /></span>}
            </button>
          );
        })}
      </div>
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void pick(e.target.files?.[0])} />
      <Button variant="secondary" className="w-full" loading={busy} onClick={() => input.current?.click()}><ImagePlus className="size-5" aria-hidden="true" />Unggah gambar sendiri</Button>
      {choice.kind === 'custom' && <p role="status" className="text-sm text-muted">Gambarmu sedang dipakai.</p>}
      <ErrorNote error={error} />
    </Intro>
  );
}

/**
 * Penyiapan akun, dibuka sekali setelah password awal diganti: notifikasi, wajah untuk presensi, wallpaper. Setiap langkah bisa dilewati;
 * yang dilewati muncul lagi di kartu "Siapkan akun" di Beranda (components/SetupCard). Langkah yang tidak berlaku di perangkat ini
 * (notifikasi tidak bisa diaktifkan dari sini, verifikasi wajah dimatikan admin, wajah sudah terdaftar) tidak ditampilkan.
 */
export default function Setup() {
  const navigate = useNavigate();
  const [push] = usePushState();
  const face = useFaceStatus();
  const [steps, setSteps] = useState<StepKey[] | null>(null);
  const [i, setI] = useState(0);
  const [enrolling, setEnrolling] = useState(false);

  // Daftar langkah ditetapkan sekali, setelah keadaan perangkat dan status wajah diketahui, agar tidak bergeser saat sebuah langkah selesai.
  const faceSettled = !face.isPending;
  const f = face.data;
  useEffect(() => {
    if (steps || push === null || !faceSettled) return;
    setSteps([
      ...(push === 'off' ? (['push'] as const) : []),
      ...(f && f.settings.mode !== 'off' && !f.active && !f.pending ? (['face'] as const) : []),
      'wallpaper',
    ]);
  }, [steps, push, faceSettled, f]);

  const step = steps?.[i];
  const next = () => { setEnrolling(false); if (steps && i + 1 < steps.length) setI(i + 1); else navigate('/', { replace: true }); };

  return (
    <div className="relative isolate mx-auto flex h-dvh max-w-md flex-col bg-app">
      <WallpaperLayer />
      {steps && (
        <header className="pt-safe pl-safe pr-safe">
          <div className="px-4 pt-5">
            <div className="flex gap-1.5" role="progressbar" aria-label="Siapkan akun" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1} aria-valuetext={`Langkah ${i + 1} dari ${steps.length}`}>
              {steps.map((k, n) => <span key={k} className={cx('h-1.5 flex-1 rounded-full', n <= i ? 'bg-primary' : 'bg-line')} />)}
            </div>
            <p className="mt-2 text-sm font-medium text-muted" aria-hidden="true">Siapkan akun · {i + 1} dari {steps.length}</p>
          </div>
        </header>
      )}
      <main key={`${step ?? 'load'}-${enrolling}`} className="screen-in flex flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
        {!step && <Spinner />}
        {step === 'push' && <PushStep onNext={next} />}
        {step === 'face' && (enrolling
          ? <FaceEnroll flow={{ onDone: next, onCancel: () => setEnrolling(false) }} />
          : (
            <Intro icon={<ScanFace className="size-9" />} title="Daftarkan wajah untuk presensi" body="Tatap kamera sekitar 5 detik. HC lalu mencocokkannya dengan KTP Anda; sementara itu presensi tetap bisa dilakukan."
              actions={(
                <>
                  <Button onClick={() => setEnrolling(true)}>Daftarkan sekarang</Button>
                  <Button variant="ghost" onClick={next}>Nanti</Button>
                </>
              )} />
          ))}
        {step === 'wallpaper' && <WallpaperStep onNext={next} />}
      </main>
    </div>
  );
}
