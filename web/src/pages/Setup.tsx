import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BellRing, Check, ImagePlus, ScanFace, UserRound } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { enablePush } from '../lib/push';
import { useFaceStatus } from '../lib/face-status';
import { ACCEPT, useWallpaper } from '../lib/wallpaper';
import { PRESETS, presetThumbUrl } from '../lib/wallpaper-presets';
import { markSetupDone } from '../lib/setup-state';
import { usePushState } from '../components/PushCard';
import WallpaperLayer from '../components/WallpaperLayer';
import { Button, ErrorNote, Field, Input, Spinner, cx } from '../ui';
import FaceEnroll from './FaceEnroll';

type StepKey = 'push' | 'face' | 'wallpaper' | 'nickname';

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
        </>
      )} />
  );
}

function FaceStep({ onNext }: { onNext: () => void }) {
  const [enrolling, setEnrolling] = useState(false);
  if (enrolling) return <FaceEnroll flow={{ onDone: onNext, onCancel: () => setEnrolling(false) }} />;
  return (
    <Intro icon={<ScanFace className="size-9" />} title="Daftarkan wajah untuk presensi" body="Tatap kamera beberapa detik. HC lalu mencocokkannya dengan KTP Anda; sementara itu presensi tetap bisa dilakukan."
      actions={<Button onClick={() => setEnrolling(true)}>Daftarkan sekarang</Button>} />
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
    <Intro title="Pilih wallpaper" body="Pilih salah satu gambar, atau unggah gambar sendiri. Bisa diganti kapan saja di Akun."
      actions={<Button disabled={!active} onClick={onNext}>{active ? 'Pakai wallpaper ini' : 'Pilih dulu wallpaper'}</Button>}>
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

/** Nama panggilan: dipakai di sapaan Beranda dan kartu "Selesai hari ini". Validasi juga dilakukan di server. */
function NicknameStep({ onNext }: { onNext: () => void }) {
  const { user, setNickname } = useAuth();
  const [value, setValue] = useState(user?.nickname ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const ok = value.trim().length >= 2;

  async function save() {
    setBusy(true);
    setError(null);
    try { await setNickname(value.trim()); onNext(); } catch (e) { setError(e); setBusy(false); }
  }

  return (
    <Intro icon={<UserRound className="size-9" />} title="Nama panggilan" body="Dipakai untuk sapaan di Beranda dan di kartu Selesai hari ini. Cukup nama pendek, misalnya Budi atau Mbak Sari."
      actions={(
        <>
          <ErrorNote error={error} />
          <Button loading={busy} disabled={!ok} onClick={() => void save()}>Simpan dan lanjut</Button>
        </>
      )}>
      <form className="mt-2 w-full max-w-xs text-left" onSubmit={(e) => { e.preventDefault(); if (ok && !busy) void save(); }}>
        <Field label="Nama panggilan" hint="2 sampai 20 karakter.">
          {(id, d) => <Input id={id} aria-describedby={d} maxLength={20} autoComplete="nickname" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
      </form>
    </Intro>
  );
}

/**
 * Penyiapan akun, wajib sekali per akun di perangkat ini: notifikasi, wajah untuk presensi, wallpaper, nama panggilan.
 * Tidak ada tombol lewati. Dibuka ulang dari Akun > "Ulangi penyiapan akun" (?ulang=1), yang juga menampilkan nama panggilan.
 * Langkah yang tidak berlaku di perangkat ini (notifikasi tidak bisa diaktifkan, verifikasi wajah dimatikan admin, wajah sudah
 * terdaftar) tidak ditampilkan.
 */
export default function Setup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const replay = params.get('ulang') === '1';
  const [push] = usePushState();
  const face = useFaceStatus();
  const [steps, setSteps] = useState<StepKey[] | null>(null);
  const [i, setI] = useState(0);

  // Daftar langkah ditetapkan sekali, setelah keadaan perangkat dan status wajah diketahui, agar tidak bergeser saat sebuah langkah selesai.
  const faceSettled = !face.isPending;
  const f = face.data;
  useEffect(() => {
    if (steps || push === null || !faceSettled) return;
    setSteps([
      ...(push === 'off' ? (['push'] as const) : []),
      ...(f && f.settings.mode !== 'off' && !f.active && !f.pending ? (['face'] as const) : []),
      'wallpaper',
      ...(replay || !user?.nickname ? (['nickname'] as const) : []),
    ]);
  }, [steps, push, faceSettled, f, replay, user?.nickname]);

  const step = steps?.[i];
  const next = () => {
    if (steps && i + 1 < steps.length) { setI(i + 1); return; }
    if (user) markSetupDone(user.id);
    navigate('/', { replace: true });
  };

  return (
    <div className="relative isolate mx-auto flex h-dvh max-w-md flex-col bg-app lg:max-w-none">
      <WallpaperLayer />
      {steps && (
        <header className="pt-safe pl-safe pr-safe">
          <div className="mx-auto w-full px-4 pt-5 lg:max-w-md lg:px-0 lg:pt-10">
            <div className="flex gap-1.5" role="progressbar" aria-label="Siapkan akun" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1} aria-valuetext={`Langkah ${i + 1} dari ${steps.length}`}>
              {steps.map((k, n) => <span key={k} className={cx('h-1.5 flex-1 rounded-full', n <= i ? 'bg-primary' : 'bg-line')} />)}
            </div>
            <p className="mt-2 text-sm font-medium text-muted" aria-hidden="true">Siapkan akun · {i + 1} dari {steps.length}</p>
          </div>
        </header>
      )}
      <main key={step ?? 'load'} className="screen-in mx-auto flex w-full flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-6 pt-4 lg:max-w-md lg:px-0 lg:pb-10">
        {!step && <Spinner />}
        {step === 'push' && <PushStep onNext={next} />}
        {step === 'face' && <FaceStep onNext={next} />}
        {step === 'wallpaper' && <WallpaperStep onNext={next} />}
        {step === 'nickname' && <NicknameStep onNext={next} />}
      </main>
    </div>
  );
}
