import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, CameraOff, Loader2, MapPin, MapPinOff, RotateCcw } from 'lucide-react';
import type { FaceDetector } from '@mediapipe/tasks-vision';
import { api } from '../lib/api';
import { getPosition, type Fix } from '../lib/geo';
import { assessLocation, FACE_RESULT_LABEL, type FaceResult } from '@hris/shared';
import { useToday } from './Attendance';
import { km } from '../lib/attendance-types';
import { isFaceReady, loadFaceDetector, mapBoxToView, snapshotVideo, type ViewBox } from '../lib/face';
import { alignFace, embedFace, liveScore, loadFaceModels, type FaceModels, type Keypoints, type PixelBox } from '../lib/face-ml';
import { useFaceStatus } from '../lib/face-status';
import { BottomBar, Button, ErrorNote } from '../ui';

const HOLD_MS = 3000; // wajah harus stabil selama ini sebelum foto diambil otomatis
const OUT_W = 900;

type Phase = 'live' | 'review';
type Geo = { state: 'loading' } | { state: 'ok'; fix: Fix } | { state: 'error'; message: string };

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
  const lastDet = useRef<{ kps: Keypoints; bb: PixelBox; w: number; h: number; at: number } | null>(null); // deteksi terakhir (untuk verifikasi wajah)
  const modelsRef = useRef<FaceModels | null>(null);

  const [phase, setPhase] = useState<Phase>('live');
  const [camError, setCamError] = useState<string | null>(null);
  const [detector, setDetector] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [geo, setGeo] = useState<Geo>({ state: 'loading' });
  // Mode blokir: lokasi wajib, jadi "Kirim tanpa lokasi" tidak tersedia.
  const todayData = useToday().data;
  const needsLocation = todayData?.policy.locationMode === 'block';
  const [attempt, setAttempt] = useState(0);
  // Verifikasi wajah: aktif bila admin menyalakan modenya dan karyawan punya template yang disetujui. Embedding dihitung di perangkat; keputusan di server.
  const faceStatus = useFaceStatus().data;
  const faceActive = faceStatus ? faceStatus.settings.mode !== 'off' && faceStatus.active : false;
  const [modelState, setModelState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [checking, setChecking] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; face: boolean; check: { embedding: number[]; live: number | null } | null } | null>(null);

  const isIn = type === 'in';
  const stopCamera = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }, []);

  const fetchLocation = useCallback(() => {
    setGeo({ state: 'loading' });
    getPosition().then((fix) => setGeo({ state: 'ok', fix })).catch((e: Error) => setGeo({ state: 'error', message: e.message }));
  }, []);

  // Lokasi: mulai sejak layar dibuka (paralel dengan kamera).
  useEffect(() => { fetchLocation(); }, [fetchLocation]);

  // Model verifikasi wajah dimuat di latar belakang sejak layar dibuka (gagal dimuat tidak menghalangi presensi).
  useEffect(() => {
    if (!faceActive) return;
    let cancelled = false;
    setModelState('loading');
    loadFaceModels().then((m) => { modelsRef.current = m; if (!cancelled) setModelState('ready'); }).catch(() => { if (!cancelled) setModelState('failed'); });
    return () => { cancelled = true; };
  }, [faceActive]);

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
        const k = dets[0]?.keypoints;
        if (b && k && k.length >= 4) lastDet.current = { kps: k, bb: b, w: v.videoWidth, h: v.videoHeight, at: now };
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
    // Bagian bingkai yang dipakai verifikasi wajah diambil SEKARANG (sinkron) agar sama dengan foto; penghitungannya menyusul.
    const det = lastDet.current;
    const models = modelsRef.current;
    const useFace = faceActive && models && det && performance.now() - det.at < 1500;
    const aligned = useFace ? alignFace(v, det.kps, det.w, det.h) : null;
    const livePromise = useFace ? liveScore(models, v, det.bb, det.w, det.h).catch(() => null) : Promise.resolve(null);
    const blob = await snapshotVideo(v, OUT_W);
    if (!blob) { capturing.current = false; return; }
    let check: { embedding: number[]; live: number | null } | null = null;
    if (aligned && models) {
      setChecking(true);
      try { check = { embedding: Array.from(await embedFace(models, aligned), (x) => +x.toFixed(5)), live: await livePromise }; } catch (e) { console.error('verifikasi wajah gagal dihitung', e); }
      setChecking(false);
    }
    stopCamera();
    setPhoto({ blob, url: URL.createObjectURL(blob), face, check });
    setPhase('review');
  }

  function onSystemCamera(file: File | null) {
    if (!file) return;
    setPhoto({ blob: file, url: URL.createObjectURL(file), face: false, check: null });
    setPhase('review');
  }
  function retake() { if (photo) URL.revokeObjectURL(photo.url); setPhoto(null); setPhase('live'); }

  const send = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('photo', photo!.blob, 'presensi.jpg');
      if (geo.state === 'ok') { fd.append('lat', String(geo.fix.lat)); fd.append('lng', String(geo.fix.lng)); fd.append('accuracy', String(Math.round(geo.fix.accuracy))); }
      fd.append('face', photo!.face ? '1' : '0');
      if (photo!.check) { fd.append('embedding', JSON.stringify(photo!.check.embedding)); if (photo!.check.live !== null) fd.append('live', String(photo!.check.live)); }
      return api<{ face?: FaceResult | null }>(`/attendance/${isIn ? 'clock-in' : 'clock-out'}`, { method: 'POST', body: fd });
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['att-today'] });
      void qc.invalidateQueries({ queryKey: ['att-mine'] });
      const face = res.face ?? null;
      const faceNote = face === 'match' ? ' Wajah cocok.' : '';
      // Mismatch/spoof/none hanya ditandai untuk HC (presensi tidak ditolak karena wajah).
      const faceWarn = face === 'mismatch' || face === 'spoof' ? `${FACE_RESULT_LABEL[face]}. Presensi tetap tercatat dan ditandai untuk HC.` : face === 'none' ? 'Wajah tidak dinilai pada presensi ini; presensi tetap tercatat dan ditandai untuk HC.' : null;
      navigate('/presensi', { replace: true, state: { flash: `${isIn ? 'Presensi masuk tercatat.' : 'Presensi pulang tercatat.'}${faceNote}`, faceWarn } });
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

  // Keterangan verifikasi wajah (hanya bila admin menyalakan modenya): teks selalu ada, hasil resmi di server.
  const faceMode = faceStatus?.settings.mode ?? 'off';
  const faceNote = faceMode === 'off' ? null : !faceStatus?.active
    ? <p className="rounded-xl bg-sub p-3 text-sm text-muted">{faceStatus?.pending ? 'Pendaftaran wajah Anda menunggu HC. Presensi tetap bisa dilakukan.' : <>Wajah Anda belum didaftarkan, jadi tidak diverifikasi. <Link to="/profil/wajah" className="font-medium underline">Daftarkan wajah</Link></>}</p>
    : modelState === 'failed' ? <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn">Verifikasi wajah tidak dapat dijalankan di perangkat ini. Presensi tetap tercatat dan ditandai untuk HC.</p>
      : <p className="rounded-xl bg-sub p-3 text-sm text-muted" role="status">{modelState === 'ready' ? 'Verifikasi wajah aktif: wajah Anda akan dicocokkan dengan yang didaftarkan.' : 'Menyiapkan verifikasi wajah…'}</p>;

  if (phase === 'review' && photo) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className="mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-black"><img src={photo.url} alt="Foto presensi Anda" className="size-full object-cover" /></div>
        <div className="flex flex-col gap-1 rounded-xl bg-sub p-3 text-sm" role="status">
          {geoLine}
          {!photo.face && <span className="text-muted">Wajah tidak terdeteksi otomatis pada foto ini.</span>}
          {faceActive && !photo.check && <span className="text-warn">Wajah tidak dapat diperiksa pada foto ini; presensi tetap tercatat dan ditandai untuk HC.</span>}
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
      {faceNote}
      <div className="rounded-xl bg-sub p-3 text-sm" role="status">{geoLine}</div>
      {geo.state === 'error' && <button onClick={fetchLocation} className="min-h-11 self-start rounded-lg px-2 text-sm font-medium underline active:bg-sub">Coba lokasi lagi</button>}
      {!camError && <BottomBar><Button className="w-full" loading={checking} onClick={() => void capture(detector === 'ready' && faceNow.current)}><Camera className="size-5" aria-hidden="true" />{checking ? 'Memeriksa wajah…' : 'Ambil foto'}</Button></BottomBar>}
    </div>
  );
}
