// Deteksi wajah di perangkat (MediaPipe BlazeFace). Tidak ada gambar yang dikirim ke pihak lain.
// Model dan WASM disajikan dari aplikasi sendiri (bukan CDN) agar jalan di dalam aplikasi Tauri.
import type { FaceDetector } from '@mediapipe/tasks-vision';

export type VideoBox = { originX: number; originY: number; width: number; height: number };
export type ViewBox = { x: number; y: number; w: number; h: number };

export async function loadFaceDetector(): Promise<FaceDetector> {
  const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks('/mediapipe');
  const create = (delegate: 'GPU' | 'CPU') =>
    FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite', delegate },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.6,
    });
  try { return await create('GPU'); } catch { return await create('CPU'); } // sebagian HP tidak mendukung GPU
}

/** Kotak wajah (piksel video asli) -> koordinat elemen <video> di layar ('cover', dengan opsi cermin horizontal). */
export function mapBoxToView(b: VideoBox, videoW: number, videoH: number, viewW: number, viewH: number, mirror = false): ViewBox {
  const scale = Math.max(viewW / videoW, viewH / videoH);
  const offX = (viewW - videoW * scale) / 2;
  const offY = (viewH - videoH * scale) / 2;
  const w = b.width * scale;
  const x = b.originX * scale + offX;
  return { x: mirror ? viewW - x - w : x, y: b.originY * scale + offY, w, h: b.height * scale };
}

/** Wajah siap difoto: cukup besar dan di area tengah frame. */
export function isFaceReady(b: VideoBox, videoW: number, videoH: number): boolean {
  if (b.width < videoW * 0.2) return false;
  const cx = (b.originX + b.width / 2) / videoW;
  const cy = (b.originY + b.height / 2) / videoH;
  return cx > 0.2 && cx < 0.8 && cy > 0.15 && cy < 0.85;
}
