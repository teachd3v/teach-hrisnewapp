import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, CameraOff, Loader2, MapPin, MapPinOff, RotateCcw } from 'lucide-react';
import type { FaceDetector } from '@mediapipe/tasks-vision';
import { api } from '../lib/api';
import { getPosition, type Fix } from '../lib/geo';
import { assessLocation } from '@hris/shared';
import { useToday } from './Attendance';
import { km } from '../lib/attendance-types';
import { isFaceReady, loadFaceDetector, mapBoxToView, type ViewBox } from '../lib/face';
import { BottomBar, Button, ErrorNote } from '../ui';

const HOLD_MS = 3000; // wajah harus stabil selama ini sebelum foto diambil otomatis
const OUT_W = 900;

type Phase = 'live' | 'review';
type Geo = { state: 'loading' } | { state: 'ok'; fix: Fix } | { state: 'error'; message: string };

/** Ambil foto dari frame video: potong tengah 3:4, tidak dicerminkan (hasil nyata, bukan tampilan cermin). */
function snapshot(video: HTMLVideoElement): Promise<Blob | null> {
  const vw = video.videoWidth, vh = video.videoHeight;
  const targetRatio = 3 / 4;
  let sw = vw, sh = vh, sx = 0, sy = 0;
  if (vw / vh > targetRatio) { sw = Math.round(vh * targetRatio); sx = Math.round((vw - sw) / 2); } else { sh = Math.round(vw / targetRatio); sy = Math.round((vh - sh) / 2); }
  const scale = Math.min(1, OUT_W / sw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

export default function AttendanceCapture() {
  const { type } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const holdSince = useRef<number | null>(null);
  const capturing = useRef(false);
  const faceNow = useRef(false); // ada wajah siap pada frame terakhir (untuk tombol manual)

  const [phase, setPhase] = useState<Phase>('live');
  const [camError, setCamError] = useState<string | null>(null);
  const [detector, setDetector] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [geo, setGeo] = useState<Geo>({ state: 'loading' });
  // Mode blokir: lokasi wajib, jadi "Kirim tanpa lokasi" tidak tersedia.
  const todayData = useToday().data;
  const needsLocation = todayData?.policy.locationMode === 'block';
  const [attempt, setAttempt] = useState(0);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; face: boolean } | null>(null);

  const isIn = type === 'in';
  const stopCamera = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }, []);

  const fetchLocation = useCallback(() => {
    setGeo({ state: 'loading' });
    getPosition().then((fix) => setGeo({ state: 'ok', fix })).catch((e: Error) => setGeo({ state: 'error', message: e.message }));
  }, []);

  // Lokasi: mulai sejak layar dibuka (paralel dengan kamera).
  useEffect(() => { fetchLocation(); }, [fetchLocation]);

  // Kamera + deteksi wajah (hanya saat fase 'live').
  useEffect(() => {
    if (phase !== 'live') return;
    let cancelled = false;
    let raf = 0;
    let det: FaceDetector | null = null;
    capturing.current = false;
    holdSince.current = null;
    setCountdown(null);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setCamError(null);
      } catch (e) {
        const name = (e as Error).name;
        setCamError(name === 'NotAllowedError' ? 'Izin kamera ditolak. Aktifkan izin kamera untuk situs/aplikasi ini.' : name === 'NotFoundError' ? 'Kamera tidak ditemukan.' : 'Kamera tidak dapat dibuka.');
        return;
      }
      try {
        det = await loadFaceDetector();
        if (cancelled) return;
        setDetector('ready');
      } catch {
        if (!cancelled) setDetector('unavailable');
        return;
      }
      let last = 0;
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        const v = videoRef.current;
        const el = boxRef.current;
        if (!v || !det || v.readyState < 2 || capturing.current || now - last < 100) return;
        last = now;
        const dets = det.detectForVideo(v, now).detections;
        const b = dets[0]?.boundingBox;
        const ready = b && isFaceReady(b, v.videoWidth, v.videoHeight);
        faceNow.current = Boolean(ready);
        if (el) {
          if (b) {
            const m: ViewBox = mapBoxToView(b, v.videoWidth, v.videoHeight, v.clientWidth, v.clientHeight, true);
            Object.assign(el.style, { display: 'block', left: `${m.x}px`, top: `${m.y}px`, width: `${m.w}px`, height: `${m.h}px`, borderColor: ready ? '#facc15' : 'rgba(250,204,21,0.45)' });
          } else el.style.display = 'none';
        }
        if (ready) {
          holdSince.current ??= now;
          const left = HOLD_MS - (now - holdSince.current);
          setCountdown(Math.max(1, Math.ceil(left / 1000)));
          if (left <= 0) void capture(true);
        } else { holdSince.current = null; setCountdown(null); }
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => { cancelled = true; cancelAnimationFrame(raf); det?.close(); stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, attempt]);

  async function capture(face: boolean) {
    const v = videoRef.current;
    if (!v || capturing.current || v.readyState < 2) return;
    capturing.current = true;
    const blob = await snapshot(v);
    if (!blob) { capturing.current = false; return; }
    stopCamera();
    setPhoto({ blob, url: URL.createObjectURL(blob), face });
    setPhase('review');
  }

  function onSystemCamera(file: File | null) {
    if (!file) return;
    setPhoto({ blob: file, url: URL.createObjectURL(file), face: false });
    setPhase('review');
  }
  function retake() { if (photo) URL.revokeObjectURL(photo.url); setPhoto(null); setPhase('live'); }

  const send = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('photo', photo!.blob, 'presensi.jpg');
      if (geo.state === 'ok') { fd.append('lat', String(geo.fix.lat)); fd.append('lng', String(geo.fix.lng)); fd.append('accuracy', String(Math.round(geo.fix.accuracy))); }
      fd.append('face', photo!.face ? '1' : '0');
      return api(`/attendance/${isIn ? 'clock-in' : 'clock-out'}`, { method: 'POST', body: fd });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['att-today'] });
      void qc.invalidateQueries({ queryKey: ['att-mine'] });
      navigate('/presensi', { replace: true, state: { flash: isIn ? 'Presensi masuk tercatat.' : 'Presensi pulang tercatat.' } });
    },
  });

  useEffect(() => () => { stopCamera(); }, [stopCamera]);
  if (type !== 'in' && type !== 'out') return <Navigate to="/presensi" replace />;

  // Penilaian di layar hanya informasi; keputusan resmi (termasuk pengecualian dinas luar kota) tetap di server.
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

  if (phase === 'review' && photo) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className="mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-black"><img src={photo.url} alt="Foto presensi Anda" className="size-full object-cover" /></div>
        <div className="flex flex-col gap-1 rounded-xl bg-sub p-3 text-sm" role="status">
          {geoLine}
          {!photo.face && <span className="text-muted">Wajah tidak terdeteksi otomatis pada foto ini.</span>}
          {geo.state === 'error' && <button onClick={fetchLocation} className="mt-1 min-h-11 self-start rounded-lg px-2 font-medium underline active:bg-line">Coba lokasi lagi</button>}
        </div>
        {geo.state === 'error' && (needsLocation
          ? <p role="alert" className="rounded-xl bg-bad-bg p-3 text-sm text-bad">Presensi di aplikasi ini memerlukan lokasi. Aktifkan izin lokasi lalu ketuk "Coba lokasi lagi".</p>
          : <p className="text-sm text-muted">Jika dilanjutkan tanpa lokasi, presensi tercatat tanpa titik lokasi dan HC dapat melihatnya.</p>)}
        <ErrorNote error={send.error} />
        <BottomBar>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={retake} disabled={send.isPending}><RotateCcw className="size-5" aria-hidden="true" />Ulangi</Button>
            <Button onClick={() => send.mutate()} loading={send.isPending} disabled={geo.state === 'loading' || (needsLocation && geo.state === 'error')}>{geo.state === 'error' ? 'Kirim tanpa lokasi' : isIn ? 'Kirim masuk' : 'Kirim pulang'}</Button>
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
          <p role="alert">{camError}</p>
          <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-fg active:bg-black">
            <Camera className="size-5" aria-hidden="true" />Buka kamera sistem
            <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => onSystemCamera(e.target.files?.[0] ?? null)} />
          </label>
          <Button variant="ghost" onClick={() => { setCamError(null); setAttempt((a) => a + 1); }}>Coba lagi</Button>
        </div>
      ) : (
        <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
          <div ref={boxRef} className="pointer-events-none absolute hidden rounded-lg border-4" aria-hidden="true" />
          {countdown !== null && <div className="pointer-events-none absolute inset-0 grid place-items-center text-7xl font-bold text-white drop-shadow-lg" aria-hidden="true">{countdown}</div>}
        </div>
      )}
      <p className="text-center text-sm text-muted" role="status" aria-live="polite">
        {camError ? '' : detector === 'unavailable' ? 'Deteksi wajah tidak tersedia. Ketuk "Ambil foto" setelah wajah di tengah.' : detector === 'loading' ? 'Menyiapkan deteksi wajah…' : countdown !== null ? `Tahan posisi, foto otomatis dalam ${countdown}…` : 'Posisikan wajah di tengah bingkai.'}
      </p>
      <div className="rounded-xl bg-sub p-3 text-sm" role="status">{geoLine}</div>
      {geo.state === 'error' && <button onClick={fetchLocation} className="min-h-11 self-start rounded-lg px-2 text-sm font-medium underline active:bg-sub">Coba lokasi lagi</button>}
      {!camError && <BottomBar><Button className="w-full" onClick={() => void capture(detector === 'ready' && faceNow.current)}><Camera className="size-5" aria-hidden="true" />Ambil foto</Button></BottomBar>}
    </div>
  );
}
