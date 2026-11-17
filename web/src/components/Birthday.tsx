import { useEffect, useMemo, useRef, useState } from 'react';
import { Cake } from 'lucide-react';
import { Button, Sheet } from '../ui';
import { birthdaySeen, markBirthdaySeen } from '../lib/birthday';

const COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6'];

/** Balon naik dan rumbai turun di seluruh layar pada hari ulang tahun. Tidak menghalangi sentuhan; animasi dimatikan bila diminta sistem. */
export function BirthdayDecor() {
  const balloons = useMemo(() => Array.from({ length: 9 }, (_, i) => ({
    left: 3 + i * 11 + (i % 3) * 2, delay: (i % 5) * 1.3, dur: 11 + (i % 4) * 2.5, color: COLORS[i % COLORS.length]!, size: 34 + (i % 3) * 10,
  })), []);
  const streamers = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    left: 5 + i * 12, delay: i * 0.9, color: COLORS[(i + 2) % COLORS.length]!,
  })), []);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
      {balloons.map((b, i) => (
        <span key={`b${i}`} className="bday-balloon absolute -bottom-32" style={{ left: `${b.left}%`, width: b.size, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}>
          <svg width={b.size} height={b.size * 1.5} viewBox="0 0 40 60">
            <ellipse cx="20" cy="22" rx="18" ry="21" fill={b.color} />
            <ellipse cx="13" cy="13" rx="4" ry="6" fill="white" opacity="0.5" />
            <path d="M20 43 L16 48 L24 48 Z" fill={b.color} />
            <path d="M20 48 Q14 53 20 58" stroke="#94a3b8" fill="none" strokeWidth="1" />
          </svg>
        </span>
      ))}
      {streamers.map((s, i) => (
        <span key={`s${i}`} className="bday-streamer absolute -top-24 w-2 rounded-full" style={{ left: `${s.left}%`, height: 96, background: s.color, animationDelay: `${s.delay}s` }} />
      ))}
    </div>
  );
}

/** Ucapan sekali per tahun saat aplikasi pertama dibuka pada hari ulang tahun. */
export function BirthdayPopup({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(() => !birthdaySeen(userId));
  const close = () => { markBirthdaySeen(userId); setOpen(false); };
  return (
    <Sheet open={open} onClose={close} title="Selamat ulang tahun!">
      <div className="mt-2 flex flex-col items-center gap-3 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-pink-100 text-pink-600" aria-hidden="true"><Cake className="size-8" /></span>
        <p className="text-lg font-bold">Selamat ulang tahun, {name}!</p>
        <p className="text-muted">Semoga panjang umur, sehat selalu, dan rezekinya lancar. Terima kasih sudah tumbuh bersama TEACH.</p>
        <Button className="w-full" onClick={close}>Terima kasih</Button>
      </div>
    </Sheet>
  );
}

/** Pengingat kecil di layar presensi pada hari ulang tahun. */
export function BirthdayBanner({ name }: { name: string }) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl bg-pink-50 p-3 text-pink-900 ring-1 ring-pink-200">
      <Cake className="size-6 shrink-0" aria-hidden="true" />
      <p className="text-sm font-semibold">Hari ini ulang tahunmu, {name}. Selamat, semoga harinya menyenangkan!</p>
    </div>
  );
}

/**
 * Tiup lilin sebelum presensi masuk pada hari ulang tahun. Utamanya memakai mikrofon: hembusan keras terdeteksi di perangkat
 * (suara tidak direkam dan tidak dikirim), lalu api padam. Bila izin mikrofon ditolak atau tidak didukung, atau tiupan tidak
 * terdeteksi, tersedia tombol tiup. Hanya sekali per hari di perangkat ini.
 */
export function BirthdayCandle({ name, onDone }: { name: string; onDone: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'listening' | 'blown'>('idle');
  const [hint, setHint] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  // Lepas mikrofon bila layar ditutup di tengah jalan.
  useEffect(() => () => { stopRef.current?.(); }, []);

  function blow() {
    stopRef.current?.();
    stopRef.current = null;
    setPhase('blown');
  }

  function cancelListening() {
    stopRef.current?.();
    stopRef.current = null;
    setPhase('idle');
  }

  async function listen() {
    setHint(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      setHint('Perangkat ini tidak bisa mendeteksi tiupan. Pakai tombol tiup.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      setHint('Izin mikrofon belum diberikan. Pakai tombol tiup, atau izinkan mikrofon di pengaturan browser lalu coba lagi.');
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const started = performance.now();
    let raf = 0;
    let calibSum = 0;
    let calibN = 0;
    let loudSince = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    };
    stopRef.current = finish;
    setPhase('listening');

    const CALIBRATE_MS = 800;
    const LISTEN_MS = 25000;
    const tick = (now: number) => {
      if (finished) return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      const elapsed = now - started;

      // Kalibrasi: kebisingan ruangan dirata-ratakan dulu, lalu tiupan dibandingkan dengan itu.
      if (elapsed < CALIBRATE_MS) {
        calibSum += rms;
        calibN += 1;
      } else {
        const noise = calibN ? calibSum / calibN : 0.01;
        const threshold = Math.max(0.12, noise * 5);
        if (rms > threshold) {
          if (!loudSince) loudSince = now;
          // Hembusan harus bertahan sebentar, supaya tepukan atau suara sesaat tidak dianggap tiupan.
          if (now - loudSince > 180) { blow(); return; }
        } else {
          loudSince = 0;
        }
      }

      if (elapsed > LISTEN_MS) {
        finish();
        stopRef.current = null;
        setPhase('idle');
        setHint('Tiupan belum terdeteksi. Coba lagi, atau pakai tombol tiup.');
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  const blown = phase === 'blown';
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm font-semibold text-pink-700">Selamat ulang tahun, {name}!</p>
        <h1 className="text-2xl font-extrabold">
          {blown ? 'Harapanmu sudah terkabul' : phase === 'listening' ? 'Tiup ke arah HP sekarang' : 'Yuk, tiup lilinnya'}
        </h1>
        <button type="button" onClick={blow} disabled={blown} aria-label={blown ? 'Lilin sudah ditiup' : 'Tiup lilin dengan ketukan'}
          className="relative grid place-items-center rounded-3xl bg-surface px-10 pb-6 pt-16 shadow-card active:scale-95 disabled:active:scale-100">
          <span className="absolute left-1/2 top-3 -translate-x-1/2">
            {blown
              ? <span className="block size-10 rounded-full bg-slate-300/70 blur-[2px]" aria-hidden="true" />
              : <span className="block size-6 rounded-full bg-amber-400 shadow-[0_0_18px_6px_rgba(251,191,36,0.6)] motion-safe:animate-pulse" aria-hidden="true" />}
          </span>
          <span className="block h-2 w-3 rounded-sm bg-pink-300" aria-hidden="true" />
          <span className="mt-1 flex gap-3" aria-hidden="true">
            <span className="block h-20 w-5 rounded-t-md bg-pink-400" />
            <span className="block h-20 w-5 rounded-t-md bg-sky-400" />
            <span className="block h-20 w-5 rounded-t-md bg-amber-400" />
          </span>
          <span className="mt-1 block h-4 w-56 rounded-xl bg-pink-200" aria-hidden="true" />
        </button>
        {phase === 'listening' && <p role="status" className="text-sm text-muted motion-safe:animate-pulse">Mendengarkan…</p>}
        {hint && <p role="status" className="max-w-xs text-sm text-warn">{hint}</p>}
        {blown && <p role="status" className="max-w-xs text-muted">Semoga panjang umur, sehat selalu, dan harinya menyenangkan.</p>}
      </div>
      <div className="flex flex-col gap-2 pt-4">
        {blown && <Button className="w-full" onClick={onDone}>Lanjut presensi</Button>}
        {phase === 'idle' && <Button className="w-full" onClick={() => void listen()}>Tiup lilin dengan suara</Button>}
        {phase === 'listening' && <Button variant="secondary" className="w-full" onClick={cancelListening}>Batal</Button>}
        {!blown && <Button variant={phase === 'idle' ? 'secondary' : 'ghost'} className="w-full" onClick={blow}>Tiup pakai tombol</Button>}
      </div>
    </div>
  );
}
