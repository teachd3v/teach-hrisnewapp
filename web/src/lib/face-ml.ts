// Verifikasi wajah di perangkat (docs/FACE.md): embedding SFace (128 dimensi) dan liveness pasif MiniFASNetV2, dijalankan dengan onnxruntime-web (WASM).
// Model disajikan dari aplikasi sendiri (/models), bukan CDN. Tidak ada gambar yang dikirim ke pihak lain untuk penghitungan ini.
import type * as OrtNS from 'onnxruntime-web';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { FACE_DIM, normalize } from '@hris/shared';

const SFACE_URL = '/models/sface_int8.onnx';
const SPOOF_URL = '/models/MiniFASNetV2.onnx';

export interface FaceModels {
  ort: typeof OrtNS;
  sface: OrtNS.InferenceSession;
  /** null bila model liveness tidak dapat dimuat (penilaian identitas tetap berjalan tanpa skor wajah asli) */
  spoof: OrtNS.InferenceSession | null;
}

/** Titik kunci ternormalisasi (0..1) dari detektor wajah: mata, hidung, tengah mulut, ... */
export type Keypoints = readonly { x: number; y: number }[];
/** Kotak wajah dalam piksel bingkai video. */
export interface PixelBox { originX: number; originY: number; width: number; height: number }

let loading: Promise<FaceModels> | null = null;

/** Muat model sekali (hasil dipakai ulang). Model embedding wajib; liveness opsional. */
export function loadFaceModels(): Promise<FaceModels> {
  loading ??= (async () => {
    const ort = await import('onnxruntime-web/wasm');
    ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
    ort.env.wasm.numThreads = 1; // tanpa isolasi lintas-origin hanya satu thread yang tersedia
    ort.env.logLevel = 'error';
    const get = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Model gagal dimuat (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    };
    const [sfaceBuf, spoofBuf] = await Promise.all([get(SFACE_URL), get(SPOOF_URL).catch(() => null)]);
    const sface = await ort.InferenceSession.create(sfaceBuf, { executionProviders: ['wasm'] });
    const spoof = spoofBuf ? await ort.InferenceSession.create(spoofBuf, { executionProviders: ['wasm'] }).catch(() => null) : null;
    return { ort, sface, spoof };
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

// Titik acuan ArcFace 112x112: mata (kiri/kanan di gambar), ujung hidung, tengah mulut (rata-rata dua sudut mulut).
const TEMPLATE_PTS: [number, number][] = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [56.1396, 92.2848]];

/** Titik gambar [mata kiri di gambar, mata kanan di gambar, hidung, tengah mulut] dalam piksel. */
function facePoints(kps: Keypoints, w: number, h: number): [number, number][] {
  const e = [kps[0]!, kps[1]!].map((p) => [p.x * w, p.y * h] as [number, number]).sort((a, b) => a[0] - b[0]);
  return [e[0]!, e[1]!, [kps[2]!.x * w, kps[2]!.y * h], [kps[3]!.x * w, kps[3]!.y * h]];
}

/** Transformasi kemiripan (skala + rotasi + geser) terbaik dari titik gambar ke titik acuan. */
function fitSimilarity(src: [number, number][], dst: [number, number][]) {
  const n = src.length;
  let msx = 0, msy = 0, mdx = 0, mdy = 0;
  src.forEach((p, i) => { msx += p[0] / n; msy += p[1] / n; mdx += dst[i]![0] / n; mdy += dst[i]![1] / n; });
  let re = 0, im = 0, den = 0;
  src.forEach((p, i) => {
    const sx = p[0] - msx, sy = p[1] - msy, dx = dst[i]![0] - mdx, dy = dst[i]![1] - mdy;
    re += sx * dx + sy * dy; im += sx * dy - sy * dx; den += sx * sx + sy * sy;
  });
  const a = re / den, b = im / den;
  return { a, b, tx: mdx - (a * msx - b * msy), ty: mdy - (b * msx + a * msy) };
}

/** Wajah diselaraskan ke 112x112 dari bingkai (video/kanvas) dengan titik kunci detektor. Bingkai tidak dicerminkan. */
export function alignFace(source: CanvasImageSource, kps: Keypoints, w: number, h: number): ImageData {
  const { a, b, tx, ty } = fitSimilarity(facePoints(kps, w, h), TEMPLATE_PTS);
  const c = document.createElement('canvas');
  c.width = c.height = 112;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(a, b, -b, a, tx, ty);
  ctx.drawImage(source, 0, 0);
  return ctx.getImageData(0, 0, 112, 112);
}

/** Embedding ternormalisasi (panjang 1) dari wajah yang sudah diselaraskan. */
export async function embedFace(m: FaceModels, img: ImageData): Promise<Float32Array> {
  const plane = 112 * 112, x = new Float32Array(3 * plane), d = img.data;
  for (let i = 0; i < plane; i++) { x[i] = d[i * 4]!; x[plane + i] = d[i * 4 + 1]!; x[2 * plane + i] = d[i * 4 + 2]!; } // NCHW, RGB 0..255
  const out = await m.sface.run({ [m.sface.inputNames[0]!]: new m.ort.Tensor('float32', x, [1, 3, 112, 112]) });
  const v = out[m.sface.outputNames[0]!]!.data as Float32Array;
  if (v.length !== FACE_DIM) throw new Error('Keluaran model tidak sesuai');
  return normalize(v);
}

/**
 * Masukan MiniFASNetV2 dari bingkai: potong area di sekitar kotak wajah (skala 2,7), 80x80, BGR mentah 0..255, NCHW.
 * Sinkron dan tidak butuh model, jadi bisa dipanggil tepat saat foto diambil lalu dijalankan nanti.
 */
export function liveInput(source: CanvasImageSource, bb: PixelBox, w: number, h: number): Float32Array {
  const bw = bb.width, bh = bb.height, scale = Math.min((h - 1) / bh, (w - 1) / bw, 2.7), nw = bw * scale, nh = bh * scale;
  const cx = bb.originX + bw / 2, cy = bb.originY + bh / 2;
  let x0 = cx - nw / 2, y0 = cy - nh / 2, x1 = cx + nw / 2, y1 = cy + nh / 2;
  if (x0 < 0) { x1 -= x0; x0 = 0; }
  if (y0 < 0) { y1 -= y0; y0 = 0; }
  if (x1 > w - 1) { x0 -= x1 - w + 1; x1 = w - 1; }
  if (y1 > h - 1) { y0 -= y1 - h + 1; y1 = h - 1; }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(w - 1, Math.floor(x1)); y1 = Math.min(h - 1, Math.floor(y1));
  const c = document.createElement('canvas');
  c.width = c.height = 80;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, 80, 80);
  const d = ctx.getImageData(0, 0, 80, 80).data, plane = 6400, x = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) { x[i] = d[i * 4 + 2]!; x[plane + i] = d[i * 4 + 1]!; x[2 * plane + i] = d[i * 4]!; } // BGR
  return x;
}

/** Skor "wajah asli" 0..1 dari masukan `liveInput` (kelas indeks 1 = asli). null bila model liveness tidak tersedia. */
export async function liveFromInput(m: FaceModels, input: Float32Array): Promise<number | null> {
  if (!m.spoof) return null;
  const out = await m.spoof.run({ [m.spoof.inputNames[0]!]: new m.ort.Tensor('float32', input, [1, 3, 80, 80]) });
  const l = Array.from(out[m.spoof.outputNames[0]!]!.data as Float32Array);
  const mx = Math.max(...l), e = l.map((v) => Math.exp(v - mx)), s = e.reduce((a, b) => a + b, 0);
  return e[1]! / s;
}

/** Skor "wajah asli" langsung dari bingkai (gabungan `liveInput` dan `liveFromInput`). */
export const liveScore = (m: FaceModels, source: CanvasImageSource, bb: PixelBox, w: number, h: number) => liveFromInput(m, liveInput(source, bb, w, h));

/** Ciri gambar wajah yang sudah diselaraskan: cahaya, ketajaman (variansi Laplacian), dan dominasi tepi pada pita mata. */
export function faceFeatures(img: ImageData): { lum: number; sharp: number; eyeRatio: number } {
  const d = img.data, W = 112, g = new Float32Array(W * W);
  for (let i = 0; i < W * W; i++) g[i] = 0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!;
  let ls = 0, ln = 0;
  for (let y = 24; y < 96; y++) for (let x = 24; x < 88; x++) { ls += g[y * W + x]!; ln++; }
  let lm = 0, l2 = 0, lc = 0;
  for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
    const v = 4 * g[y * W + x]! - g[y * W + x - 1]! - g[y * W + x + 1]! - g[(y - 1) * W + x]! - g[(y + 1) * W + x]!;
    lm += v; l2 += v * v; lc++;
  }
  const edge = (y0: number, y1: number, x0: number, x1: number) => {
    let s = 0, c = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += Math.abs(g[y * W + x + 1]! - g[y * W + x - 1]!) + Math.abs(g[(y + 1) * W + x]! - g[(y - 1) * W + x]!); c++; }
    return s / c;
  };
  return { lum: ls / ln, sharp: l2 / lc - (lm / lc) ** 2, eyeRatio: edge(38, 66, 14, 98) / (edge(16, 100, 16, 96) + 1e-6) };
}

/** Pose kepala kasar dari titik kunci: yaw (kiri-kanan) dan pitch (atas-bawah), relatif terhadap pose depan. */
export function headPose(kps: Keypoints, w: number, h: number): { yaw: number; pitch: number } {
  const [e0, e1, n, m] = facePoints(kps, w, h) as [[number, number], [number, number], [number, number], [number, number]];
  const mid = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2];
  const d = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]) || 1;
  return { yaw: (n[0] - mid[0]!) / d, pitch: (n[1] - mid[1]!) / Math.max(1, m[1] - mid[1]!) };
}
