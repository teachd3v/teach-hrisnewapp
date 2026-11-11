import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraOff, CheckCircle2, Loader2, RotateCcw, ScanFace, ShieldCheck, Trash2 } from 'lucide-react';
import { FACE_ENROLL_MIN, cosine } from '@hris/shared';
import type { FaceDetector } from '@mediapipe/tasks-vision';
import { api } from '../lib/api';
import { fmtDate } from '../lib/leave-types';
import { loadFaceDetector, snapshotVideo } from '../lib/face';
import { alignFace, embedFace, faceFeatures, headPose, loadFaceModels, type FaceModels } from '../lib/face-ml';
import { useFaceStatus } from '../lib/face-status';
import { BottomBar, Button, Card, Chip, ErrorNote, Sheet, Spinner } from '../ui';

// Pendaftaran bertahap: hadap depan (2 sampel), lalu satu putaran kepala melingkar yang dibagi 8 arah (1 sampel per arah).
const HOLD_MS = 500;
const YAW_NEED = 0.2;
const PITCH_NEED = 0.12;
const GAP_MS = 250;
const FRONT_SHOTS = 2;
const CIRCLE_SHOTS = 8;
const CIRCLE_MIN_DONE = 6;
const SHARP_MIN = 150; // sampel lebih buram dari ini dilewati (tergantung kamera; dari uji di HP: bingkai bagus 250-900)
const OUTLIER_MEAN_SIM = 0.2; // sampel yang rata-rata kemiripannya ke sampel lain di bawah ini dibuang

interface Enrolled { vectors: Float32Array[]; photo: Blob; stats: { lum: number; sharp: number; eyeRatio: number } }
type View = 'status' | 'consent' | 'capture' | 'review';

const sectorOf = (sx: number, sy: number) => ((Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) % 8) + 8) % 8;

/** Buang sampel pencilan (buram/salah): rata-rata kemiripannya ke sampel lain terlalu rendah. */
function trimOutliers<T extends { emb: Float32Array }>(s: T[]): T[] {
  return s.filter((a, i) => {
    const others = s.filter((_, j) => j !== i);
    return others.length === 0 || others.reduce((t, b) => t + cosine(a.emb, b.emb), 0) / others.length >= OUTLIER_MEAN_SIM;
  });
}

const arc = (k: number) => {
  const R = 35, cx = 37.5, cy = 50, a0 = ((k * 45 - 17) * Math.PI) / 180, a1 = ((k * 45 + 17) * Math.PI) / 180;
  return `M ${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)}`;
};

/** Kamera + deteksi + pengambilan sampel. Memanggil onDone sekali setelah cukup sampel. */
function Capturer({ onDone, onCancel }: { onDone: (r: Enrolled) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const force = useRef(false);
  const finishNow = useRef(false);
  const [msg, setMsg] = useState('Menyiapkan kamera dan model…');
  const [err, setErr] = useState<string | null>(null);
  const [front, setFront] = useState(0);
  const [sectors, setSectors] = useState<boolean[]>(Array(8).fill(false));
  const [dot, setDot] = useState({ x: 0, y: 0 });
  const circleDone = sectors.filter(Boolean).length;
  const inCircle = front >= FRONT_SHOTS;

  useEffect(() => {
    let cancelled = false, raf = 0;
    let det: FaceDetector | null = null;
    let stream: MediaStream | null = null;
    let models: FaceModels | null = null;
    const samples: { emb: Float32Array; feat: { lum: number; sharp: number; eyeRatio: number } }[] = [];
    let refPhoto: Blob | null = null;
    const frontPoses: { yaw: number; pitch: number }[] = [];
    let base = { yaw: 0, pitch: 0 };
    const secs: boolean[] = Array(8).fill(false);
    let frontDone = 0, lastVec: { x: number; y: number } | null = null, hold: number | null = null, lastShot = 0, busy = false, smooth: { yaw: number; pitch: number }[] = [];
    let finished = false;
    const stop = () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); stream = null; det?.close(); det = null; };

    const finish = () => {
      if (finished) return;
      finished = true;
      stop();
      const kept = trimOutliers(samples);
      if (kept.length < FACE_ENROLL_MIN || !refPhoto) { setErr('Hasil pendaftaran kurang konsisten (kemungkinan terlalu gelap, buram, atau wajah bergerak terlalu cepat). Ulangi di tempat yang lebih terang dan putar kepala lebih pelan.'); return; }
      const avg = (k: 'lum' | 'sharp' | 'eyeRatio') => kept.reduce((t, s) => t + s.feat[k], 0) / kept.length;
      onDone({ vectors: kept.map((s) => s.emb), photo: refPhoto, stats: { lum: avg('lum'), sharp: avg('sharp'), eyeRatio: avg('eyeRatio') } });
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
      } catch (e) {
        const name = (e as Error).name;
        setErr(name === 'NotAllowedError' ? 'Izin kamera ditolak. Aktifkan izin kamera untuk situs/aplikasi ini.' : name === 'NotFoundError' ? 'Kamera tidak ditemukan.' : 'Kamera tidak dapat dibuka.');
        return;
      }
      try {
        [models, det] = await Promise.all([loadFaceModels(), loadFaceDetector()]);
      } catch {
        if (!cancelled) setErr('Model verifikasi wajah gagal dimuat. Periksa koneksi lalu coba lagi.');
        stop();
        return;
      }
      if (cancelled) { stop(); return; }
      setMsg('Hadap lurus ke kamera');

      let last = 0;
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        const v = videoRef.current;
        if (!v || !det || !models || busy || finished || v.readyState < 2 || now - last < 100) return;
        last = now;
        const dets = det.detectForVideo(v, now).detections;
        const d = dets.sort((a, b) => (b.boundingBox?.width ?? 0) - (a.boundingBox?.width ?? 0))[0];
        const w = v.videoWidth, h = v.videoHeight;
        const kps = d?.keypoints;
        const bb = d?.boundingBox;
        if (!d || !kps || kps.length < 4 || !bb) { setMsg('Wajah tidak terlihat'); hold = null; smooth = []; return; }
        const cx = (bb.originX + bb.width / 2) / w, cy = (bb.originY + bb.height / 2) / h;
        if (bb.width < w * 0.22 || cx < 0.25 || cx > 0.75 || cy < 0.2 || cy > 0.8) { setMsg(bb.width < w * 0.22 ? 'Dekatkan wajah ke kamera' : 'Posisikan wajah di tengah'); hold = null; return; }
        smooth.push(headPose(kps, w, h)); if (smooth.length > 3) smooth.shift();
        const p = { yaw: smooth.reduce((t, q) => t + q.yaw, 0) / smooth.length, pitch: smooth.reduce((t, q) => t + q.pitch, 0) / smooth.length };

        const shoot = async (mark: () => void) => {
          busy = true;
          try {
            const aligned = alignFace(v, kps, w, h);
            const feat = faceFeatures(aligned);
            if (feat.sharp < SHARP_MIN) { setMsg('Kurang tajam, tahan sebentar'); return; }
            if (!refPhoto && frontDone === 0) refPhoto = await snapshotVideo(v);
            samples.push({ emb: await embedFace(models!, aligned), feat });
            lastShot = performance.now();
            mark();
          } catch (e) {
            console.error('sampel wajah gagal', e);
          } finally { busy = false; }
        };

        if (frontDone < FRONT_SHOTS) {
          const ok = Math.abs(p.yaw) < 0.12;
          setMsg(ok ? 'Tahan, lurus ke kamera' : 'Hadap lurus ke kamera');
          if (ok || force.current) {
            hold ??= now;
            if ((force.current || now - hold >= HOLD_MS) && now - lastShot >= 600) {
              force.current = false; frontPoses.push(p);
              void shoot(() => {
                frontDone++; setFront(frontDone); hold = null;
                if (frontDone >= FRONT_SHOTS) { base = { yaw: frontPoses.reduce((t, q) => t + q.yaw, 0) / frontPoses.length, pitch: frontPoses.reduce((t, q) => t + q.pitch, 0) / frontPoses.length }; lastVec = null; }
              });
            }
          } else hold = null;
          return;
        }

        // Putaran melingkar: vektor kepala relatif pose depan, dinormalkan per sumbu, ke arah layar (video dicerminkan).
        const x = (p.yaw - base.yaw) / YAW_NEED, y = (p.pitch - base.pitch) / PITCH_NEED, r = Math.hypot(x, y);
        const sx = -x, sy = y;
        setDot({ x: sx, y: sy });
        const sector = sectorOf(sx, sy);
        const vel = lastVec ? Math.hypot(x - lastVec.x, y - lastVec.y) : 0;
        lastVec = { x, y };
        const count = secs.filter(Boolean).length;
        setMsg(`Putar kepala pelan membentuk lingkaran (${count}/${CIRCLE_SHOTS})`);
        if (finishNow.current && count >= CIRCLE_MIN_DONE) { finish(); return; }
        const want = (r >= 1 && r < 6 && !secs[sector] && vel < 0.35) || (force.current && r >= 0.4);
        if (want && now - lastShot >= GAP_MS) {
          force.current = false;
          void shoot(() => {
            secs[sector] = true;
            setSectors([...secs]);
            if (secs.filter(Boolean).length >= CIRCLE_SHOTS) finish();
          });
        }
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => { cancelled = true; if (!finished) stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (err) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-sub p-6 text-center">
        <CameraOff className="size-10 text-muted" aria-hidden="true" />
        <p role="alert">{err}</p>
        <Button variant="secondary" onClick={onCancel}>Kembali</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
        <svg viewBox="0 0 75 100" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {inCircle && sectors.map((on, k) => <path key={k} d={arc(k)} fill="none" strokeWidth="3" strokeLinecap="round" stroke={on ? '#22c55e' : '#ffffff66'} />)}
          {inCircle && <circle r="2.2" fill="#facc15" cx={37.5 + Math.max(-38, Math.min(38, dot.x * 35))} cy={50 + Math.max(-38, Math.min(38, dot.y * 35))} />}
        </svg>
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-3 text-center font-semibold text-white drop-shadow" role="status" aria-live="polite">{msg}</div>
      </div>
      <p className="text-center text-sm text-muted">
        {!inCircle ? `Tahap 1 dari 2: hadap lurus (${front}/${FRONT_SHOTS}).` : `Tahap 2 dari 2: putar kepala pelan satu lingkaran sampai semua segmen hijau (${circleDone}/${CIRCLE_SHOTS}).`}
      </p>
      <BottomBar>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onCancel}>Batal</Button>
          {inCircle && circleDone >= CIRCLE_MIN_DONE
            ? <Button onClick={() => { finishNow.current = true; }}>Selesai</Button>
            : <Button variant="secondary" onClick={() => { force.current = true; }}>Ambil sekarang</Button>}
        </div>
      </BottomBar>
    </div>
  );
}

/** Daftarkan wajah untuk verifikasi presensi: persetujuan biometrik, pendaftaran bertahap, kirim ke HC untuk dicocokkan dengan KTP. */
export default function FaceEnroll() {
  const status = useFaceStatus();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('status');
  const [agree, setAgree] = useState(false);
  const [data, setData] = useState<(Enrolled & { url: string }) | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sent, setSent] = useState(false);
  const [attempt, setAttempt] = useState(0); // kunci Capturer: kamera dimulai ulang hanya saat pendaftaran diulang
  const s = status.data;

  useEffect(() => () => { if (data) URL.revokeObjectURL(data.url); }, [data]);

  const submit = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('photo', data!.photo, 'referensi.jpg');
      fd.append('vectors', JSON.stringify(data!.vectors.map((v) => Array.from(v, (x) => +x.toFixed(5)))));
      fd.append('stats', JSON.stringify(data!.stats));
      fd.append('consent', '1');
      fd.append('consentVersion', s!.consent.version);
      return api('/face/enroll', { method: 'POST', body: fd });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['face-status'] }); setSent(true); setView('status'); setData(null); setAgree(false); },
  });
  const withdraw = useMutation({
    mutationFn: () => api('/face/me', { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['face-status'] }); setConfirmDelete(false); setSent(false); },
  });

  if (status.isPending) return <Spinner />;
  if (!s) return <ErrorNote error={status.error} />;

  if (view === 'consent') {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><ShieldCheck className="size-5" aria-hidden="true" /><h2 className="text-lg font-semibold">Persetujuan data wajah</h2></div>
          {s.consent.text.map((t, i) => <p key={i} className="text-sm">{t}</p>)}
        </Card>
        <label className="flex min-h-12 items-start gap-3 rounded-xl border border-line p-3">
          <input type="checkbox" className="mt-1 size-5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span className="text-sm">Saya telah membaca dan menyetujui penggunaan data wajah saya untuk verifikasi presensi.</span>
        </label>
        <BottomBar>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setView('status')}>Batal</Button>
            <Button disabled={!agree} onClick={() => { setAttempt((n) => n + 1); setView('capture'); }}>Lanjut</Button>
          </div>
        </BottomBar>
      </div>
    );
  }

  if (view === 'capture') {
    return <Capturer key={attempt} onCancel={() => setView('status')} onDone={(r) => { setData({ ...r, url: URL.createObjectURL(r.photo) }); setView('review'); }} />;
  }

  if (view === 'review' && data) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className="mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-black"><img src={data.url} alt="Foto referensi wajah Anda" className="size-full object-cover" /></div>
        <p className="rounded-xl bg-sub p-3 text-sm" role="status"><CheckCircle2 className="mr-1 inline size-4 text-ok" aria-hidden="true" />{data.vectors.length} sampel wajah siap dikirim. Foto di atas dipakai HC untuk mencocokkan dengan KTP Anda.</p>
        <ErrorNote error={submit.error} />
        <BottomBar>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => { setData(null); setAttempt((n) => n + 1); setView('capture'); }} disabled={submit.isPending}><RotateCcw className="size-5" aria-hidden="true" />Ulangi</Button>
            <Button onClick={() => submit.mutate()} loading={submit.isPending}>Kirim ke HC</Button>
          </div>
        </BottomBar>
      </div>
    );
  }

  const exists = s.active || s.pending || s.rejected;
  return (
    <div className="flex flex-col gap-4">
      {sent && <p role="status" className="flex items-center gap-2 rounded-xl bg-ok-bg p-3 text-sm font-medium text-ok"><CheckCircle2 className="size-5" aria-hidden="true" />Pendaftaran terkirim. HC akan mencocokkan foto Anda dengan KTP.</p>}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <ScanFace className="size-8" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">Wajah untuk presensi</p>
            <p className="text-sm text-muted">{s.settings.mode === 'off' ? 'Verifikasi wajah belum diaktifkan oleh admin.' : 'Presensi Anda akan dicocokkan dengan wajah yang didaftarkan.'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.active && <Chip tone="ok">Aktif{s.approved?.decidedAt ? ` sejak ${fmtDate(s.approved.decidedAt.slice(0, 10))}` : ''}</Chip>}
          {s.pending && <Chip tone="info">Menunggu HC mencocokkan dengan KTP</Chip>}
          {s.rejected && <Chip tone="bad">Ditolak HC</Chip>}
          {!exists && <Chip>Belum terdaftar</Chip>}
        </div>
        {s.rejected?.note && <p className="rounded-xl bg-bad-bg p-3 text-sm text-bad">Alasan: {s.rejected.note}</p>}
        {s.pending && s.active && <p className="text-sm text-muted">Wajah lama tetap dipakai sampai pendaftaran baru disetujui.</p>}
      </Card>

      <Card className="text-sm">
        <p className="mb-1 font-semibold">Tips pendaftaran</p>
        <ul className="list-disc pl-5 text-muted">
          <li>Cahaya cukup dan merata, tanpa masker atau kacamata hitam.</li>
          <li>Hadap lurus dulu, lalu putar kepala pelan satu lingkaran (atas, kanan, bawah, kiri).</li>
          <li>Pegang HP stabil dan jangan bergerak terlalu cepat agar foto tidak buram.</li>
        </ul>
      </Card>

      <Button onClick={() => { setSent(false); setView('consent'); }}>{s.active || s.pending ? 'Daftar ulang wajah' : 'Daftarkan wajah'}</Button>
      {exists && <Button variant="secondary" onClick={() => setConfirmDelete(true)}><Trash2 className="size-5" aria-hidden="true" />Tarik persetujuan dan hapus data wajah</Button>}

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Hapus data wajah?">
        <p className="text-sm">Template wajah dan foto referensi Anda akan dihapus permanen. Presensi tetap bisa dilakukan, tetapi wajah tidak lagi diverifikasi dan akan ditandai untuk HC.</p>
        <ErrorNote error={withdraw.error} />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Batal</Button>
          <Button variant="danger" loading={withdraw.isPending} onClick={() => withdraw.mutate()}>Hapus</Button>
        </div>
      </Sheet>
      {withdraw.isPending && <Loader2 className="mx-auto size-5 animate-spin" aria-hidden="true" />}
    </div>
  );
}
