// Klien internal menuju layanan verifikasi wajah (Cloudflare Container Worker `teach-hris-face` lewat Service Binding).
import { normalize, validEmbedding, type FaceRejectReason } from '@hris/shared';
import type { Bindings } from '../env';

export interface FaceAnalyzeStats {
  lum: number;
  sharp: number;
  yaw: number;
  pitch: number;
  faceRatio: number;
  detScore: number;
  ms?: number;
}

export type FaceAnalyzeResult =
  | { ok: true; embedding: Float32Array; live: number | null; stats: FaceAnalyzeStats }
  | { ok: false; reason: FaceRejectReason; message: string };

const ANALYZE_TIMEOUT_MS = 28_000; // mencakup cold start container AuraFace v1

const REASONS = new Set<FaceRejectReason>([
  'no_face', 'multi_face', 'too_small', 'turned', 'too_dark', 'too_blurry', 'invalid_image', 'service_unavailable',
]);

const asReason = (v: unknown): FaceRejectReason =>
  typeof v === 'string' && REASONS.has(v as FaceRejectReason) ? (v as FaceRejectReason) : 'service_unavailable';

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Kirim foto mentah (JPEG/PNG/WebP) ke Container untuk deteksi, cek kualitas, ekstraksi embedding 512-d, dan liveness. */
export async function analyzeFace(env: Bindings, buffer: ArrayBuffer, contentType: string): Promise<FaceAnalyzeResult> {
  if (!env.FACE_SERVICE && !env.FACE_SERVICE_URL) {
    return { ok: false, reason: 'service_unavailable', message: 'Layanan verifikasi wajah belum terhubung di server.' };
  }
  const fd = new FormData();
  fd.append('photo', new Blob([buffer], { type: contentType }), 'photo.jpg');

  let res: Response;
  try {
    const init: RequestInit = { method: 'POST', body: fd, signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS) };
    res = env.FACE_SERVICE
      ? await env.FACE_SERVICE.fetch('https://face.internal/analyze', init)
      : await fetch(`${env.FACE_SERVICE_URL!.replace(/\/$/, '')}/analyze`, init);
  } catch (e) {
    console.error('face service unreachable', e);
    return { ok: false, reason: 'service_unavailable', message: 'Layanan verifikasi wajah sedang tidak dapat dihubungi. Coba lagi sebentar.' };
  }

  let body: Record<string, unknown> | null = null;
  try { body = (await res.json()) as Record<string, unknown>; } catch { body = null; }

  if (!res.ok || !body) {
    const reason = asReason(body?.reason);
    const message = typeof body?.message === 'string' && body.message
      ? body.message
      : 'Layanan verifikasi wajah sedang sibuk atau baru menyala. Coba lagi.';
    return { ok: false, reason, message };
  }

  if (body.ok !== true) {
    return {
      ok: false,
      reason: asReason(body.reason),
      message: typeof body.message === 'string' && body.message ? body.message : 'Wajah belum dapat dinilai dari foto ini.',
    };
  }

  if (!validEmbedding(body.embedding)) {
    return { ok: false, reason: 'service_unavailable', message: 'Keluaran model wajah tidak valid.' };
  }
  const liveRaw = body.live;
  const live = typeof liveRaw === 'number' && Number.isFinite(liveRaw) && liveRaw >= 0 && liveRaw <= 1 ? liveRaw : null;
  const s = (body.stats ?? {}) as Record<string, unknown>;
  const stats: FaceAnalyzeStats = {
    lum: num(s.lum),
    sharp: num(s.sharp),
    yaw: num(s.yaw),
    pitch: num(s.pitch),
    faceRatio: num(s.faceRatio),
    detScore: num(s.detScore),
    ...(typeof s.ms === 'number' && Number.isFinite(s.ms) ? { ms: s.ms } : {}),
  };
  return { ok: true, embedding: normalize(body.embedding), live, stats };
}
