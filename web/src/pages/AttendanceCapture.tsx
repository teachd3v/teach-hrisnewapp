import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, CameraOff, CheckCircle2, Loader2, MapPin, MapPinOff, RotateCcw, TriangleAlert, XCircle } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { getPosition, type Fix } from '../lib/geo';
import { assessLocation, FACE_RESULT_LABEL, FACE_VERDICT_TEXT, type FaceResult } from '@hris/shared';
import { useToday } from './Attendance';
import { km } from '../lib/attendance-types';
import { cameraErrorMessage, normalizePhotoFile, openFrontCamera, snapshotVideo } from '../lib/face';
import { useFaceStatus } from '../lib/face-status';
import { useAuth } from '../lib/auth';
import { BirthdayCandle } from '../components/Birthday';
import { candleBlown, markCandleBlown } from '../lib/birthday';
import { markPrimed, pendingCapturePermissions, type PermissionNeed } from '../lib/permissions';
import { BottomBar, Button, ErrorNote, Spinner, cx } from '../ui';

// Foto presensi yang disimpan untuk HC dan diverifikasi server (YuNet + AuraFace v1 + MiniFASNetV2): 720 px, JPEG 0.82.
const OUT_W = 720;
const OUT_QUALITY = 0.82;

type Phase = 'live' | 'review';
/** Hasil pemeriksaan wajah dari server pada foto yang baru diambil. */
type Verdict =
  | { kind: 'checking' }
  | { kind: 'match' }
  | { kind: 'mismatch' }
  | { kind: 'spoof' }
  | { kind: 'unclear'; message: string }
  | { kind: 'unchecked'; message: string };
type Geo = { state: 'loading' } | { state: 'ok'; fix: Fix } | { state: 'error'; message: string };

interface VerifyResponse {
  result: FaceResult | 'unclear' | 'unavailable';
  reason?: string;
  message?: string;
}

/**
 * Pengantar sebelum dialog izin sistem. Layar presensi meminta kamera dan lokasi begitu dibuka; tanpa pengantar, dua dialog muncul
 * tiba-tiba dan mudah ditolak (izin yang ditolak hanya bisa dipulihkan lewat pengaturan HP).
 */
function PermissionPrimer({ need, faceActive, locationRequired, onContinue }: { need: PermissionNeed; faceActive: boolean; locationRequired: boolean; onContinue: () => void }) {
  const what = need.camera && need.location ? 'kamera dan lokasi' : need.camera ? 'kamera' : 'lokasi';
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-1 flex-col justify-center gap-4">
        <div className="text-center">
          <h2 className="text-2xl font-extrabold">Izinkan {what}</h2>
          <p className="mt-1 text-muted">Setelah ini HP akan meminta izin {what}. Pilih "Izinkan" agar presensi bisa dicatat. Hanya dipakai saat presensi.</p>
        </div>
        <ul className="divide-y divide-line rounded-2xl bg-surface px-4 shadow-card">
          {need.camera && (
            <li className="flex items-center gap-3 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sub" aria-hidden="true"><Camera className="size-5" /></span>
              <span><span className="block font-medium">Kamera</span><span className="block text-sm text-muted">{faceActive ? 'Untuk foto presensi dan verifikasi wajah.' : 'Untuk foto presensi.'}</span></span>
            </li>
          )}
          {need.location && (
            <li className="flex items-center gap-3 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sub" aria-hidden="true"><MapPin className="size-5" /></span>
              <span><span className="block font-medium">Lokasi</span><span className="block text-sm text-muted">{locationRequired ? 'Wajib, untuk memastikan presensi dilakukan di area kantor.' : 'Untuk mencatat lokasi saat presensi.'}</span></span>
            </li>
          )}
        </ul>
        <p className="text-center text-sm text-muted">Caranya: posisikan wajah lurus di dalam bingkai lalu ketuk "Ambil foto".</p>
      </div>
      <BottomBar><Button className="w-full" onClick={onContinue}>Lanjut</Button></BottomBar>
    </div>
  );
}

/** Layar presensi. Bila ada izin yang belum pernah ditanyakan, pengantar ditampilkan dulu; kamera dan lokasi baru diminta setelah "Lanjut". */
export default function AttendanceCapture() {
  const { type } = useParams();
  const [need, setNeed] = useState<PermissionNeed | null>(null);
  const policy = useToday().data?.policy;
  const faceQ = useFaceStatus();
  const faceStatus = faceQ.data;
  const { user } = useAuth();
  // Hari ulang tahun: lilin ditiup sekali sebelum presensi masuk.
  const [candleDone, setCandleDone] = useState(() => (user ? candleBlown(user.id) : true));
  useEffect(() => {
    let cancelled = false;
    void pendingCapturePermissions().then((n) => { if (!cancelled) setNeed(n); });
    return () => { cancelled = true; };
  }, []);

  if (type !== 'in' && type !== 'out') return <Navigate to="/presensi" replace />;
  if (type === 'in' && user?.birthdayToday && !candleDone) {
    const firstName = (user.nickname || user.name.trim().split(/\s+/)[0]) || '';
    return <BirthdayCandle name={firstName} onDone={() => { markCandleBlown(user.id); setCandleDone(true); }} />;
  }
  if (!need || faceQ.isPending) return <Spinner />;
  // Verifikasi wajah aktif tetapi belum ada pendaftaran versi model saat ini yang disetujui HC.
  if (faceStatus && faceStatus.settings.mode !== 'off' && !faceStatus.active) {
    return <FaceRequired pending={Boolean(faceStatus.pending)} rejected={Boolean(faceStatus.rejected)} needsReenroll={Boolean(faceStatus.needsReenroll)} />;
  }
  if (need.camera || need.location) {
    return (
      <PermissionPrimer need={need} faceActive={Boolean(faceStatus && faceStatus.settings.mode !== 'off' && faceStatus.active)} locationRequired={policy?.locationMode === 'block'}
        onContinue={() => { markPrimed(); setNeed({ camera: false, location: false }); }} />
    );
  }
  return <CaptureScreen />;
}

/** Layar pengganti presensi: wajah wajib disetujui HC lebih dulu (mode verifikasi aktif). */
function FaceRequired({ pending, rejected, needsReenroll }: { pending: boolean; rejected: boolean; needsReenroll: boolean }) {
  const title = pending
    ? 'Menunggu persetujuan HC'
    : needsReenroll
      ? 'Perlu daftar ulang wajah'
      : 'Daftarkan wajah dulu';
  const body = pending
    ? 'Pendaftaran wajah Anda sudah terkirim. Presensi bisa dilakukan setelah HC menyetujuinya.'
    : needsReenroll
      ? 'Sistem verifikasi wajah telah diperbarui agar lebih cepat dan akurat di semua HP. Daftarkan ulang 1 foto wajah Anda; presensi bisa dilakukan setelah disetujui HC.'
      : rejected
        ? 'Pendaftaran wajah Anda sebelumnya ditolak HC. Daftarkan ulang; presensi bisa dilakukan setelah disetujui.'
        : 'Presensi memakai verifikasi wajah. Daftarkan wajah Anda; presensi bisa dilakukan setelah HC menyetujuinya.';
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <span className="grid size-20 place-items-center rounded-3xl bg-surface text-primary shadow-card" aria-hidden="true"><Camera className="size-9" /></span>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="max-w-xs text-muted">{body}</p>
      </div>
      <BottomBar>{pending ? <Link to="/presensi" className="block"><Button variant="secondary" className="w-full">Kembali</Button></Link> : <Link to="/profil/wajah" className="block"><Button className="w-full">{needsReenroll || rejected ? 'Daftar ulang wajah' : 'Daftarkan wajah'}</Button></Link>}</BottomBar>
    </div>
  );
}

function CaptureScreen() {
  const { type } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturing = useRef(false);
  const verifyToken = useRef(0);

  const [phase, setPhase] = useState<Phase>('live');
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [geo, setGeo] = useState<Geo>({ state: 'loading' });
  const todayData = useToday().data;
  const needsLocation = todayData?.policy.locationMode === 'block';
  const [attempt, setAttempt] = useState(0);
  const faceStatus = useFaceStatus().data;
  const faceActive = faceStatus ? faceStatus.settings.mode !== 'off' && faceStatus.active : false;
  const faceActiveRef = useRef(faceActive);
  faceActiveRef.current = faceActive;
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; verdict: Verdict | null } | null>(null);

  const isIn = type === 'in';
  const stopCamera = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }, []);

  const fetchLocation = useCallback(() => {
    setGeo({ state: 'loading' });
    getPosition().then((fix) => setGeo({ state: 'ok', fix })).catch((e: Error) => setGeo({ state: 'error', message: e.message }));
  }, []);

  useEffect(() => { fetchLocation(); }, [fetchLocation]);

  // Kamera murni (0 MB WASM): buka segera saat fase 'live'.
  useEffect(() => {
    if (phase !== 'live') return;
    let cancelled = false;
    capturing.current = false;
    setCamReady(false);
    setCamError(null);

    (async () => {
      try {
        const stream = await openFrontCamera();
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        if (!cancelled) setCamReady(true);
      } catch (e) {
        if (!cancelled) setCamError(cameraErrorMessage(e));
      }
    })();

    return () => { cancelled = true; stopCamera(); };
  }, [phase, attempt, stopCamera]);

  /** Pratinjau verifikasi wajah di server dari foto yang sama dengan yang akan dikirim saat presensi. */
  async function runVerify(token: number, blob: Blob) {
    const apply = (verdict: Verdict) => {
      if (verifyToken.current === token) setPhoto((p) => (p ? { ...p, verdict } : p));
    };
    const fd = new FormData();
    fd.append('photo', blob, 'presensi.jpg');
    fd.append('type', isIn ? 'in' : 'out');
    try {
      const res = await api<VerifyResponse>('/face/verify', { method: 'POST', body: fd });
      if (res.result === 'match' || res.result === 'mismatch' || res.result === 'spoof') {
        apply({ kind: res.result });
      } else if (res.result === 'unclear') {
        apply({ kind: 'unclear', message: res.message || 'Foto kurang jelas atau wajah menoleh.' });
      } else if (res.result === 'unavailable') {
        apply({ kind: 'unchecked', message: res.message || 'Layanan verifikasi wajah sedang tidak tersedia.' });
      } else {
        apply({ kind: 'unchecked', message: 'Verifikasi wajah tidak aktif untuk akun ini.' });
      }
    } catch (e) {
      apply({ kind: 'unchecked', message: e instanceof ApiError && e.status === 429 ? e.message : 'Verifikasi wajah tidak dapat dihubungi. Periksa koneksi.' });
    }
  }

  function enterReview(blob: Blob) {
    stopCamera();
    const active = faceActiveRef.current;
    const token = ++verifyToken.current;
    setPhoto({ blob, url: URL.createObjectURL(blob), verdict: active ? { kind: 'checking' } : null });
    setPhase('review');
    if (active) void runVerify(token, blob);
  }

  async function capture() {
    const v = videoRef.current;
    if (!v || capturing.current || v.readyState < 2) return;
    capturing.current = true;
    const blob = await snapshotVideo(v, OUT_W, OUT_QUALITY);
    if (!blob) { capturing.current = false; return; }
    enterReview(blob);
  }

  async function onSystemCamera(file: File | null) {
    if (!file || capturing.current) return;
    capturing.current = true;
    try {
      const blob = await normalizePhotoFile(file, 1080, OUT_QUALITY);
      enterReview(blob);
    } finally {
      capturing.current = false;
    }
  }

  function retake() {
    verifyToken.current++;
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setPhase('live');
  }

  const send = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('photo', photo!.blob, 'presensi.jpg');
      if (geo.state === 'ok') {
        fd.append('lat', String(geo.fix.lat));
        fd.append('lng', String(geo.fix.lng));
        fd.append('accuracy', String(Math.round(geo.fix.accuracy)));
      }
      return api<{ face?: FaceResult | null }>(`/attendance/${isIn ? 'clock-in' : 'clock-out'}`, { method: 'POST', body: fd });
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['att-today'] });
      void qc.invalidateQueries({ queryKey: ['att-mine'] });
      const face = res.face ?? null;
      const faceNote = face === 'match' ? ' Wajah cocok.' : '';
      const faceWarn = face === 'mismatch' || face === 'spoof'
        ? `${FACE_RESULT_LABEL[face]}. Presensi tetap tercatat dan ditandai untuk HC.`
        : face === 'none'
          ? 'Wajah tidak dinilai pada presensi ini; presensi tetap tercatat dan ditandai untuk HC.'
          : null;
      const flash = `${isIn ? 'Presensi masuk tercatat.' : 'Presensi pulang tercatat.'}${faceNote}`;
      navigate(isIn ? '/presensi' : '/presensi/selesai', { replace: true, state: isIn ? { flash, faceWarn } : { flash, faceWarn, fresh: true } });
    },
  });

  useEffect(() => () => { stopCamera(); }, [stopCamera]);
  if (type !== 'in' && type !== 'out') return <Navigate to="/presensi" replace />;

  const assessed = geo.state === 'ok' && todayData ? assessLocation(geo.fix, geo.fix.accuracy, todayData.offices ?? []) : null;
  const geoLine = geo.state === 'loading'
    ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" />Mencari lokasi…</span>
    : geo.state === 'ok'
      ? (
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2"><MapPin className="size-4" aria-hidden="true" />Lokasi diperoleh (akurasi GPS ±{Math.round(geo.fix.accuracy)} m)</span>
          {assessed && (
            <span className={assessed.outside ? 'font-medium text-bad' : 'font-medium text-ok'}>
              Jarak ke {assessed.office.name}: {km(assessed.distance)}, {assessed.outside ? `di luar radius ${assessed.office.radiusM} m` : `di dalam radius ${assessed.office.radiusM} m`}
              {assessed.outside && needsLocation && assessed.blocked ? '. Presensi akan ditolak kecuali Anda sedang dinas luar kota yang disetujui.' : ''}
            </span>
          )}
          <button onClick={fetchLocation} className="mt-1 min-h-11 self-start rounded-lg px-2 font-medium underline active:bg-line">Perbarui lokasi</button>
        </div>
      )
      : <span className="flex items-center gap-2 text-bad"><MapPinOff className="size-4" aria-hidden="true" />{geo.message}</span>;

  const verdictKind = photo?.verdict?.kind ?? null;
  const failed = verdictKind === 'mismatch' || verdictKind === 'spoof';

  if (phase === 'review' && photo) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className={cx('relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-black', verdictKind === 'match' && 'ring-4 ring-ok', failed && 'ring-4 ring-bad')}>
          <img src={photo.url} alt="Foto presensi Anda" className="size-full object-cover" />
          {photo.verdict && <VerdictBanner verdict={photo.verdict} />}
        </div>
        {failed && <p className="text-center text-sm text-muted">Anda dapat mengulangi. Bila tetap dikirim, presensi ditandai untuk HC.</p>}
        {verdictKind === 'unclear' && <p className="text-center text-sm text-muted">Ulangi dengan wajah lurus ke kamera dan cahaya cukup agar wajah dapat diverifikasi.</p>}
        <div className="flex flex-col gap-1 rounded-xl bg-sub p-3 text-sm" role="status">
          {geoLine}
          {geo.state === 'error' && <button onClick={fetchLocation} className="mt-1 min-h-11 self-start rounded-lg px-2 font-medium underline active:bg-line">Coba lokasi lagi</button>}
        </div>
        {geo.state === 'error' && (needsLocation
          ? <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm text-bad">Presensi di aplikasi ini memerlukan lokasi. Aktifkan izin lokasi lalu ketuk "Coba lokasi lagi".</p>
          : <p className="text-sm text-muted">Jika dilanjutkan tanpa lokasi, presensi tercatat tanpa titik lokasi dan HC dapat melihatnya.</p>)}
        <ErrorNote error={send.error} />
        <BottomBar>
          <div className="grid grid-cols-2 gap-3">
            <Button variant={failed || verdictKind === 'unclear' ? 'primary' : 'secondary'} onClick={retake} disabled={send.isPending}><RotateCcw className="size-5" aria-hidden="true" />Ulangi</Button>
            <Button variant={failed || verdictKind === 'unclear' ? 'secondary' : 'primary'} onClick={() => send.mutate()} loading={send.isPending} disabled={verdictKind === 'checking' || geo.state === 'loading' || (needsLocation && geo.state === 'error')}>{failed ? 'Kirim tetap' : geo.state === 'error' ? 'Kirim tanpa lokasi' : isIn ? 'Kirim masuk' : 'Kirim pulang'}</Button>
          </div>
        </BottomBar>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {camError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-sub p-6 text-center">
          <CameraOff className="size-10 text-muted" aria-hidden="true" />
          <p role="alert" className="text-sm">{camError}</p>
          <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-fg shadow-primary active:bg-[#0b5f58]">
            <Camera className="size-5" aria-hidden="true" />Buka kamera HP
            <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => void onSystemCamera(e.target.files?.[0] ?? null)} />
          </label>
          <Button variant="ghost" onClick={() => { setCamError(null); setAttempt((a) => a + 1); }}>Coba lagi</Button>
        </div>
      ) : (
        <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
          <svg viewBox="0 0 75 100" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
            <ellipse cx="37.5" cy="46" rx="23" ry="30" fill="none" strokeWidth="0.9" strokeDasharray={camReady ? undefined : '2.5 2'} stroke={camReady ? '#ffffffcc' : '#ffffff66'} />
          </svg>
        </div>
      )}
      {!camError && (
        <p className="text-center text-sm text-muted" role="status" aria-live="polite">
          {camReady ? 'Posisikan wajah lurus di dalam bingkai lalu ketuk Ambil foto.' : 'Membuka kamera…'}
        </p>
      )}
      {!camError && (
        <label className="mx-auto inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted underline active:bg-sub">
          <Camera className="size-4" aria-hidden="true" />Atau ambil lewat kamera HP
          <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => void onSystemCamera(e.target.files?.[0] ?? null)} />
        </label>
      )}
      <div className="rounded-xl bg-sub p-3 text-sm" role="status">{geoLine}</div>
      {geo.state === 'error' && <button onClick={fetchLocation} className="min-h-11 self-start rounded-lg px-2 text-sm font-medium underline active:bg-sub">Coba lokasi lagi</button>}
      {!camError && (
        <BottomBar>
          <Button className="w-full" onClick={() => void capture()} disabled={!camReady}><Camera className="size-5" aria-hidden="true" />Ambil foto</Button>
        </BottomBar>
      )}
    </div>
  );
}

/** Label di bagian bawah kartu foto. Warna selalu disertai ikon dan teks (warna bukan satu-satunya penanda). */
function VerdictBanner({ verdict }: { verdict: Verdict }) {
  const base = 'absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5 px-3 py-3 text-center text-white';
  if (verdict.kind === 'checking') return <div role="status" className={cx(base, 'bg-black/65')}><span className="flex items-center gap-2 font-semibold"><Loader2 className="size-5 animate-spin" aria-hidden="true" />Memeriksa wajah…</span></div>;
  if (verdict.kind === 'match') {
    const t = FACE_VERDICT_TEXT.match;
    return <div role="status" className={cx(base, 'bg-ok')}><span className="flex items-center gap-2 text-lg font-bold"><CheckCircle2 className="size-6" aria-hidden="true" />{t.title}</span><span className="text-sm">{t.sub}</span></div>;
  }
  if (verdict.kind === 'mismatch' || verdict.kind === 'spoof') {
    const t = FACE_VERDICT_TEXT[verdict.kind];
    return <div role="alert" className={cx(base, 'bg-bad')}><span className="flex items-center gap-2 text-lg font-bold"><XCircle className="size-6" aria-hidden="true" />{t.title}</span><span className="text-sm">{t.sub}</span></div>;
  }
  const msg = verdict.message;
  return <div role="status" className={cx(base, 'bg-black/70')}><span className="flex items-center gap-2 font-semibold"><TriangleAlert className="size-5" aria-hidden="true" />{verdict.kind === 'unclear' ? 'Belum bisa diverifikasi' : 'Tidak diverifikasi'}</span><span className="text-sm">{msg}</span></div>;
}
