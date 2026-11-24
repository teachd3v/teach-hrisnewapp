// Pembantu kamera murni untuk PWA (0 MB WASM/ML di perangkat). Deteksi, penyelarasan, embedding, dan liveness berjalan di server.

/** Buka kamera depan dengan fallback constraint bertahap agar tetap jalan di berbagai HP/WebView. */
export async function openFrontCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('Kamera browser tidak didukung'), { name: 'NotSupportedError' });
  }
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false },
    { video: { facingMode: 'user' }, audio: false },
    { video: true, audio: false },
  ];
  let lastErr: unknown;
  for (const c of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) {
      lastErr = e;
      const name = (e as Error)?.name;
      // Jangan coba ulang bila izin memang ditolak atau perangkat memang tidak punya kamera.
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotFoundError') throw e;
    }
  }
  throw lastErr;
}

/** Pesan kesalahan kamera yang jelas dalam bahasa Indonesia. */
export function cameraErrorMessage(err: unknown): string {
  const name = (err as Error)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Izin kamera ditolak. Aktifkan izin kamera untuk situs/aplikasi ini, atau gunakan kamera HP.';
  if (name === 'NotFoundError') return 'Kamera tidak ditemukan pada perangkat ini.';
  if (name === 'NotReadableError') return 'Kamera sedang digunakan aplikasi lain. Tutup aplikasi lain lalu coba lagi.';
  return 'Kamera browser tidak dapat dibuka. Anda tetap bisa memakai tombol "Buka kamera HP" di bawah.';
}

/** Foto dari bingkai video: potong tengah 3:4, maks. `outW` px lebar, JPEG `quality`, tidak dicerminkan (hasil nyata). */
export function snapshotVideo(video: HTMLVideoElement, outW = 900, quality = 0.85): Promise<Blob | null> {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return Promise.resolve(null);
  const targetRatio = 3 / 4;
  let sw = vw, sh = vh, sx = 0, sy = 0;
  if (vw / vh > targetRatio) {
    sw = Math.round(vh * targetRatio);
    sx = Math.round((vw - sw) / 2);
  } else {
    sh = Math.round(vw / targetRatio);
    sy = Math.round((vh - sh) / 2);
  }
  const scale = Math.min(1, outW / sw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Kecilkan foto dari kamera sistem HP (yang sering 4-12 MB) ke JPEG maksimal `maxSide` px agar cepat diunggah
 * dan tidak melewati batas 3 MB server, sekaligus menormalkan orientasi EXIF saat digambar ke kanvas.
 */
export async function normalizePhotoFile(file: File, maxSide = 1080, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return file;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    if (scale === 1 && file.type === 'image/jpeg' && file.size <= 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
