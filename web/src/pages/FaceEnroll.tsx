import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraOff, CheckCircle2, Loader2, RotateCcw, ScanFace, ShieldCheck, Trash2 } from 'lucide-react';
import { FACE_ENROLL_MIN, cosine } from '@hris/shared';
import type { FaceDetector } from '@mediapipe/tasks-vision';
import { api } from '../lib/api';
import { fmtDate } from '../lib/leave-types';
import { loadFaceDetector, snapshotVideo } from '../lib/face';
import { alignFace, embedFace, faceFeatures, headPose, liveFromInput, liveInput, loadFaceModels, type FaceModels } from '../lib/face-ml';
import { useFaceStatus } from '../lib/face-status';
import { BottomBar, Button, Card, Chip, ErrorNote, Sheet, Spinner } from '../ui';

// Pendaftaran hadap depan: beberapa sampel diambil otomatis saat wajah lurus, diam, dan tajam. Kondisinya sengaja sama dengan saat
// presensi (AttendanceCapture hanya memverifikasi wajah hadap depan), jadi tidak ada putaran kepala: sampel pose menoleh tidak pernah
// jadi pembanding yang relevan dan, karena pencocokan memakai skor tertinggi, justru menambah peluang salah orang.
const SHOTS = FACE_ENROLL_MIN; // 3 sampel: semuanya hadap depan dan nyaris serupa, jadi lebih banyak tidak menambah ketahanan yang berarti
const HOLD_MS = 400; // wajah harus lurus dan di tengah selama ini sebelum sampel diambil
const GAP_MS = 300; // jeda antar sampel supaya tidak identik
const YAW_MAX = 0.15; // sama dengan gerbang arah wajah saat presensi
const SHARP_MIN = 150; // sampel lebih buram dari ini dilewati (tergantung kamera; dari uji di HP: bingkai bagus 250-900)
const OUTLIER_MEAN_SIM = 0.2; // sampel yang rata-rata kemiripannya ke sampel lain di bawah ini dibuang
const BLUR_MSG_MS = 1200; // pesan "kurang tajam" ditahan selama ini agar terbaca

/** `live`: median skor wajah asli sampel (penanda untuk HC, bukan penolak); null bila model liveness tidak tersedia. */
interface Enrolled { vectors: Float32Array[]; photo: Blob; stats: { lum: number; sharp: number; eyeRatio: number; live: number | null } }
type View = 'status' | 'consent' | 'capture' | 'review';

/** Buang sampel pencilan (buram/salah): rata-rata kemiripannya ke sampel lain terlalu rendah. */
function trimOutliers<T extends { emb: Float32Array }>(s: T[]): T[] {
  return s.filter((a, i) => {
    const others = s.filter((_, j) => j !== i);
    return others.length === 0 || others.reduce((t, b) => t + cosine(a.emb, b.emb), 0) / others.length >= OUTLIER_MEAN_SIM;
  });
}

/** Kamera + deteksi + pengambilan sampel. Memanggil onDone sekali setelah cukup sampel. */
function Capturer({ onDone, onCancel }: { onDone: (r: Enrolled) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const force = useRef(false);
  const [msg, setMsg] = useState('Menyiapkan kamera dan model…');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false, raf = 0;
    let det: FaceDetector | null = null;
    let stream: MediaStream | null = null;
    let models: FaceModels | null = null;
    const samples: { emb: Float32Array; feat: { lum: number; sharp: number; eyeRatio: number }; live: number | null }[] = [];
    let refPhoto: Blob | null = null;
    let hold: number | null = null, lastShot = 0, blurAt = -Infinity, busy = false, smooth: { yaw: number; pitch: number }[] = [];
    let finished = false;
    const stop = () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); stream = null; det?.close(); det = null; };

    const finish = () => {
      if (finished) return;
      finished = true;
      stop();
      const kept = trimOutliers(samples);
      if (kept.length < FACE_ENROLL_MIN || !refPhoto) { setErr('Hasil pendaftaran kurang konsisten (kemungkinan terlalu gelap, buram, atau wajah bergerak). Ulangi di tempat yang lebih terang dan tahan HP lebih stabil.'); return; }
      const avg = (k: 'lum' | 'sharp' | 'eyeRatio') => kept.reduce((t, s) => t + s.feat[k], 0) / kept.length;
      const lives = kept.map((s) => s.live).filter((x): x is number => x !== null).sort((a, b) => a - b);
      const live = lives.length ? lives[Math.floor((lives.length - 1) / 2)]! : null;
      onDone({ vectors: kept.map((s) => s.emb), photo: refPhoto, stats: { lum: avg('lum'), sharp: avg('sharp'), eyeRatio: avg('eyeRatio'), live } });
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
        const wait = (text: string) => { setMsg(text); setReady(false); hold = null; };
        if (!d || !kps || kps.length < 4 || !bb) { wait('Wajah tidak terlihat'); smooth = []; return; }
        const cx = (bb.originX + bb.width / 2) / w, cy = (bb.originY + bb.height / 2) / h;
        if (bb.width < w * 0.22 || cx < 0.25 || cx > 0.75 || cy < 0.2 || cy > 0.8) { wait(bb.width < w * 0.22 ? 'Dekatkan wajah ke kamera' : 'Posisikan wajah di tengah'); return; }
        smooth.push(headPose(kps, w, h)); if (smooth.length > 3) smooth.shift();
        const yaw = smooth.reduce((t, q) => t + q.yaw, 0) / smooth.length;
        // "Ambil sekarang" melewati gerbang arah dan jeda tahan (untuk wajah yang arah-nya salah terbaca), tetapi tidak gerbang ketajaman.
        if (Math.abs(yaw) >= YAW_MAX && !force.current) { wait('Hadap lurus ke kamera'); return; }

        hold ??= now;
        setReady(true);
        setMsg(now - blurAt < BLUR_MSG_MS ? 'Kurang tajam: tahan HP stabil atau cari tempat lebih terang' : 'Tahan, tatap kamera');
        if (now - lastShot < GAP_MS || (!force.current && now - hold < HOLD_MS)) return;
        force.current = false;

        busy = true;
        void (async () => {
          try {
            const aligned = alignFace(v, kps, w, h);
            const feat = faceFeatures(aligned);
            if (feat.sharp < SHARP_MIN) { blurAt = performance.now(); return; }
            const liveIn = liveInput(v, bb, w, h); // dari bingkai yang sama dengan sampel, sebelum menunggu apa pun
            refPhoto ??= await snapshotVideo(v);
            const emb = await embedFace(models!, aligned);
            const live = await liveFromInput(models!, liveIn).catch(() => null);
            if (cancelled || finished) return;
            samples.push({ emb, feat, live });
            lastShot = performance.now();
            setDone(samples.length);
            if (samples.length >= SHOTS) finish();
          } catch (e) {
            console.error('sampel wajah gagal', e);
          } finally { busy = false; }
        })();
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
          <ellipse cx="37.5" cy="47" rx="23" ry="30" fill="none" strokeWidth="0.8" strokeDasharray={ready ? undefined : '2.5 2'} stroke={ready ? '#22c55e' : '#ffffffaa'} />
        </svg>
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-3 text-center font-semibold text-white drop-shadow" role="status" aria-live="polite">{msg}</div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-3" aria-hidden="true">
          {Array.from({ length: SHOTS }, (_, i) => <span key={i} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: i < done ? '#22c55e' : '#ffffff66' }} />)}
        </div>
      </div>
      <p className="text-center text-sm text-muted">Tatap kamera dan tahan sebentar. Sampel diambil otomatis ({done}/{SHOTS}).</p>
      <BottomBar>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onCancel}>Batal</Button>
          <Button variant="secondary" onClick={() => { force.current = true; }}>Ambil sekarang</Button>
        </div>
      </BottomBar>
    </div>
  );
}

/** Daftarkan wajah untuk verifikasi presensi: persetujuan biometrik, beberapa sampel hadap depan, kirim ke HC untuk dicocokkan dengan KTP. */
/**
 * `flow`: dipakai di dalam penyiapan akun (pages/Setup). Layar status dilewati (langsung persetujuan); batal memanggil `onCancel`
 * dan pendaftaran yang terkirim memanggil `onDone`, alih-alih kembali ke layar status.
 */
export default function FaceEnroll({ flow }: { flow?: { onDone: () => void; onCancel: () => void } } = {}) {
  const status = useFaceStatus();
  const qc = useQueryClient();
  const [view, setView] = useState<View>(flow ? 'consent' : 'status');
  const exit = () => (flow ? flow.onCancel() : setView('status'));
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['face-status'] });
      if (flow) { flow.onDone(); return; }
      setSent(true); setView('status'); setData(null); setAgree(false);
    },
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
        <label className="flex min-h-12 items-start gap-3 rounded-xl bg-surface shadow-card p-3">
          <input type="checkbox" className="mt-1 size-5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span className="text-sm">Saya telah membaca dan menyetujui penggunaan data wajah saya untuk verifikasi presensi.</span>
        </label>
        <BottomBar>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={exit}>Batal</Button>
            <Button disabled={!agree} onClick={() => { setAttempt((n) => n + 1); setView('capture'); }}>Lanjut</Button>
          </div>
        </BottomBar>
      </div>
    );
  }

  if (view === 'capture') {
    return <Capturer key={attempt} onCancel={exit} onDone={(r) => { setData({ ...r, url: URL.createObjectURL(r.photo) }); setView('review'); }} />;
  }

  if (view === 'review' && data) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className="mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-black"><img src={data.url} alt="Foto referensi wajah Anda" className="size-full object-cover" /></div>
        <p className="rounded-xl bg-sub p-3 text-sm" role="status"><CheckCircle2 className="mr-1 inline size-4 text-ok" aria-hidden="true" />{data.vectors.length} sampel wajah siap dikirim</p>
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
          <li>Tatap kamera lurus dan tahan beberapa detik; sampel diambil otomatis.</li>
          <li>Pegang HP stabil setinggi wajah agar foto tidak buram.</li>
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
