import { useEffect, useRef, useState } from 'react';
import type { FaceDetector } from '@mediapipe/tasks-vision';

// Halaman uji perangkat (spike). Buka di aplikasi Tauri di HP asli: /spike. Bukan fitur produk.
// Menguji: (1) kamera + deteksi wajah, (2) GPS, (3) login token ke API (CORS), (4) cadangan kamera via <input capture>.

const isTauri = '__TAURI_INTERNALS__' in window;
type Result = { ok: boolean; text: string } | null;

function Section({ title, result, children }: { title: string; result: Result; children: React.ReactNode }) {
  return (
    <section className="rounded border p-3">
      <h2 className="font-medium">{title}</h2>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
      {result && (
        <pre className={`mt-2 whitespace-pre-wrap text-xs ${result.ok ? 'text-green-700' : 'text-red-700'}`}>
          {result.ok ? 'BERHASIL: ' : 'GAGAL: '}{result.text}
        </pre>
      )}
    </section>
  );
}

export default function Spike() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const [cam, setCam] = useState<Result>(null);
  const [face, setFace] = useState<string>('belum jalan');
  const [gps, setGps] = useState<Result>(null);
  const [net, setNet] = useState<Result>(null);
  const [file, setFile] = useState<Result>(null);
  const [apiBase, setApiBase] = useState((import.meta.env.VITE_API_BASE as string | undefined) ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function startCamera() {
    setCam(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      const s = stream.getVideoTracks()[0]!.getSettings();
      setCam({ ok: true, text: `kamera terbuka ${s.width}x${s.height}` });

      setFace('memuat model…');
      const t0 = performance.now();
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks('/mediapipe'); // WASM dibundel, bukan CDN
      let delegate: 'GPU' | 'CPU' = 'GPU';
      let det: FaceDetector;
      try {
        det = await FaceDetector.createFromOptions(vision, { baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite', delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.6 });
      } catch {
        delegate = 'CPU';
        det = await FaceDetector.createFromOptions(vision, { baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite', delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.6 });
      }
      const loadMs = Math.round(performance.now() - t0);
      let frames = 0;
      let last = performance.now();
      let fps = 0;
      const tick = () => {
        if (v.readyState >= 2) {
          const r = det.detectForVideo(v, performance.now());
          frames++;
          const now = performance.now();
          if (now - last >= 1000) { fps = frames; frames = 0; last = now; }
          setFace(`model dimuat ${loadMs} ms (${delegate}) · ${fps} fps · wajah terdeteksi: ${r.detections.length}`);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setCam({ ok: false, text: `${(e as Error).name}: ${(e as Error).message}` });
      setFace('tidak jalan');
    }
  }

  async function testGps() {
    setGps(null);
    try {
      if (isTauri) {
        const { checkPermissions, requestPermissions, getCurrentPosition } = await import('@tauri-apps/plugin-geolocation');
        let p = await checkPermissions();
        if (p.location !== 'granted') p = await requestPermissions(['location']);
        const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
        setGps({ ok: true, text: `plugin Tauri: ${pos.coords.latitude}, ${pos.coords.longitude} (±${Math.round(pos.coords.accuracy)} m)` });
      } else {
        const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 }));
        setGps({ ok: true, text: `browser: ${pos.coords.latitude}, ${pos.coords.longitude} (±${Math.round(pos.coords.accuracy)} m)` });
      }
    } catch (e) {
      setGps({ ok: false, text: String((e as Error).message ?? e) });
    }
  }

  async function testLogin() {
    setNet(null);
    try {
      const base = apiBase.replace(/\/$/, '');
      const health = await fetch(`${base}/api/health`).then((r) => r.json());
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as { accessToken?: string; error?: string };
      setNet({
        ok: res.ok,
        text: `origin app: ${location.origin}\nhealth: ${JSON.stringify(health)}\nlogin: HTTP ${res.status} ${body.accessToken ? '(token diterima)' : body.error ?? ''}`,
      });
    } catch (e) {
      setNet({ ok: false, text: `${(e as Error).message} (periksa URL API dan CORS)` });
    }
  }


  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4 text-sm">
      <h1 className="text-lg font-semibold">Spike perangkat</h1>
      <p className="text-xs text-gray-600">Lingkungan: {isTauri ? 'aplikasi Tauri' : 'browser biasa'} · {navigator.userAgent}</p>

      <Section title="1. Kamera + deteksi wajah (MediaPipe)" result={cam}>
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        </div>
        <button className="rounded bg-black p-2 text-white" onClick={() => void startCamera()}>Buka kamera depan</button>
        <p className="text-xs">{face}</p>
      </Section>

      <Section title="2. GPS" result={gps}>
        <button className="rounded bg-black p-2 text-white" onClick={() => void testGps()}>Ambil lokasi</button>
      </Section>

      <Section title="3. Login token ke API (CORS)" result={net}>
        <input className="rounded border p-2" placeholder="URL API, mis. https://xxx.pages.dev" value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
        <input className="rounded border p-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="rounded border p-2" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="rounded bg-black p-2 text-white" onClick={() => void testLogin()}>Tes health + login</button>
      </Section>

      <Section title="4. Cadangan: foto via input file (capture)" result={file}>
        <input type="file" accept="image/*" capture="user" onChange={(e) => {
          const f = e.target.files?.[0];
          setFile(f ? { ok: true, text: `${f.name || 'foto'} · ${f.type} · ${Math.round(f.size / 1024)} KB` } : { ok: false, text: 'tidak ada berkas' });
        }} />
      </Section>
    </main>
  );
}
