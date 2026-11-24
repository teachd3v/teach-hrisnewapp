import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, CameraOff, CheckCircle2, Loader2, RotateCcw, ScanFace, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDate } from '../lib/leave-types';
import { cameraErrorMessage, normalizePhotoFile, openFrontCamera, snapshotVideo } from '../lib/face';
import { useFaceStatus } from '../lib/face-status';
import { BottomBar, Button, Card, Chip, ErrorNote, Sheet, Spinner } from '../ui';

type View = 'status' | 'consent' | 'capture' | 'review';

/** Kamera murni tanpa WASM: karyawan mengambil 1 foto hadap depan (lewat kamera browser atau kamera sistem HP). */
function Capturer({ onDone, onCancel }: { onDone: (photo: Blob) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setErr(null);
    (async () => {
      try {
        const stream = await openFrontCamera();
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setErr(cameraErrorMessage(e));
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [attempt]);

  async function takePhoto() {
    const v = videoRef.current;
    if (!v || busy || v.readyState < 2) return;
    setBusy(true);
    try {
      const blob = await snapshotVideo(v, 900, 0.88);
      if (!blob) { setBusy(false); return; }
      stop();
      onDone(blob);
    } catch {
      setBusy(false);
    }
  }

  async function onSystemCamera(file: File | null) {
    if (!file || busy) return;
    setBusy(true);
    try {
      const blob = await normalizePhotoFile(file, 1080, 0.88);
      stop();
      onDone(blob);
    } finally {
      setBusy(false);
    }
  }

  if (err) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-sub p-6 text-center">
        <CameraOff className="size-10 text-muted" aria-hidden="true" />
        <p role="alert" className="text-sm">{err}</p>
        <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-fg shadow-primary active:bg-[#0b5f58]">
          <Camera className="size-5" aria-hidden="true" />Buka kamera HP
          <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => void onSystemCamera(e.target.files?.[0] ?? null)} />
        </label>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Kembali</Button>
          <Button variant="ghost" onClick={() => setAttempt((a) => a + 1)}>Coba kamera lagi</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
        <svg viewBox="0 0 75 100" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          <ellipse cx="37.5" cy="46" rx="23" ry="30" fill="none" strokeWidth="0.9" strokeDasharray={ready ? undefined : '2.5 2'} stroke={ready ? '#ffffffcc' : '#ffffff66'} />
        </svg>
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-3 text-center text-sm font-semibold text-white drop-shadow" role="status" aria-live="polite">
          {ready ? 'Hadap lurus ke kamera' : 'Membuka kamera…'}
        </div>
      </div>
      <p className="text-center text-sm text-muted">Posisikan wajah di dalam bingkai dengan cahaya cukup, lalu ketuk Ambil foto.</p>
      <label className="mx-auto inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted underline active:bg-sub">
        <Camera className="size-4" aria-hidden="true" />Kamera browser bermasalah? Pakai kamera HP
        <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => void onSystemCamera(e.target.files?.[0] ?? null)} />
      </label>
      <BottomBar>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Batal</Button>
          <Button onClick={() => void takePhoto()} loading={busy} disabled={!ready}><Camera className="size-5" aria-hidden="true" />Ambil foto</Button>
        </div>
      </BottomBar>
    </div>
  );
}

/**
 * Daftarkan wajah untuk verifikasi presensi: persetujuan biometrik, 1 foto hadap depan, validasi & ekstraksi di server,
 * lalu masuk antrean HC untuk dicocokkan dengan KTP.
 * `flow`: dipakai di dalam penyiapan akun (pages/Setup).
 */
export default function FaceEnroll({ flow }: { flow?: { onDone: () => void; onCancel: () => void } } = {}) {
  const status = useFaceStatus();
  const qc = useQueryClient();
  const [view, setView] = useState<View>(flow ? 'consent' : 'status');
  const exit = () => (flow ? flow.onCancel() : setView('status'));
  const [agree, setAgree] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sent, setSent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const s = status.data;

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const submit = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('photo', photo!.blob, 'referensi.jpg');
      fd.append('consent', '1');
      fd.append('consentVersion', s!.consent.version);
      return api('/face/enroll', { method: 'POST', body: fd });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['face-status'] });
      if (flow) { flow.onDone(); return; }
      setSent(true); setView('status'); setPhoto(null); setAgree(false);
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
        <label className="flex min-h-12 items-start gap-3 rounded-xl bg-surface p-3 shadow-card">
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
    return (
      <Capturer
        key={attempt}
        onCancel={exit}
        onDone={(blob) => {
          submit.reset();
          setPhoto({ blob, url: URL.createObjectURL(blob) });
          setView('review');
        }}
      />
    );
  }

  if (view === 'review' && photo) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className="mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-black">
          <img src={photo.url} alt="Foto referensi wajah Anda" className="size-full object-cover" />
        </div>
        {submit.isPending ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-sub p-3 text-sm text-muted" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />Memeriksa kualitas wajah di server…
          </p>
        ) : !submit.error ? (
          <p className="rounded-xl bg-sub p-3 text-sm text-muted" role="status">Pastikan wajah terlihat jelas, hadap lurus, dan hanya Anda di foto sebelum mengirim ke HC.</p>
        ) : null}
        <ErrorNote error={submit.error} />
        <BottomBar>
          <div className="grid grid-cols-2 gap-3">
            <Button variant={submit.error ? 'primary' : 'secondary'} onClick={() => { setPhoto(null); submit.reset(); setAttempt((n) => n + 1); setView('capture'); }} disabled={submit.isPending}>
              <RotateCcw className="size-5" aria-hidden="true" />Ulangi
            </Button>
            <Button variant={submit.error ? 'secondary' : 'primary'} onClick={() => submit.mutate()} loading={submit.isPending}>Kirim ke HC</Button>
          </div>
        </BottomBar>
      </div>
    );
  }

  const exists = s.active || s.pending || s.rejected;
  return (
    <div className="flex flex-col gap-4">
      {sent && <p role="status" className="flex items-center gap-2 rounded-xl bg-ok-bg p-3 text-sm font-medium text-ok"><CheckCircle2 className="size-5" aria-hidden="true" />Pendaftaran terkirim. HC akan mencocokkan foto Anda dengan KTP.</p>}
      {s.needsReenroll && (
        <p role="status" className="rounded-xl bg-warn-bg p-3 text-sm text-warn">
          Sistem verifikasi wajah telah diperbarui agar lebih cepat dan akurat di semua HP. Silakan daftar ulang 1 foto wajah Anda.
        </p>
      )}
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
          {s.needsReenroll && <Chip tone="warn">Perlu daftar ulang</Chip>}
          {!exists && !s.needsReenroll && <Chip>Belum terdaftar</Chip>}
        </div>
        {s.rejected?.note && <p className="rounded-xl bg-bad-bg p-3 text-sm text-bad">Alasan: {s.rejected.note}</p>}
        {s.pending && s.active && <p className="text-sm text-muted">Wajah lama tetap dipakai sampai pendaftaran baru disetujui.</p>}
      </Card>

      <Card className="text-sm">
        <p className="mb-1 font-semibold">Tips pendaftaran</p>
        <ul className="list-disc pl-5 text-muted">
          <li>Cahaya cukup dan merata, tanpa masker atau kacamata hitam.</li>
          <li>Posisikan wajah lurus di dalam bingkai lalu tekan Ambil foto.</li>
          <li>Jika kamera browser bermasalah, gunakan tombol Kamera HP.</li>
        </ul>
      </Card>

      <Button onClick={() => { setSent(false); setView('consent'); }}>{s.active || s.pending || s.needsReenroll ? 'Daftar ulang wajah' : 'Daftarkan wajah'}</Button>
      {(exists || s.needsReenroll) && <Button variant="secondary" onClick={() => setConfirmDelete(true)}><Trash2 className="size-5" aria-hidden="true" />Tarik persetujuan dan hapus data wajah</Button>}

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Hapus data wajah?">
        <p className="text-sm">Template wajah dan foto referensi Anda akan dihapus permanen. Presensi tetap bisa dilakukan bila mode wajah dimatikan, atau perlu mendaftar ulang saat aktif.</p>
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
