import type { NotifyInput } from './leave-notifications';

// Verifikasi wajah pada presensi (lihat docs/FACE.md). Arsitektur hybrid: HP menghitung embedding dan skor "wajah asli" (liveness),
// server mencocokkan dengan template karyawan dan menyimpan hasilnya sebagai snapshot. Template tidak pernah dikirim ke HP.
// Dipakai server (penentu) dan klien (tampilan).

/** Model embedding yang dipakai. Embedding dari model berbeda tidak bisa dibandingkan; ganti model berarti daftar ulang. */
export const FACE_MODEL_VERSION = 'sface-int8-2021dec';
export const FACE_DIM = 128;
/**
 * Jumlah sampel (vektor) per pendaftaran. Pendaftaran mengambil 5 sampel hadap depan; minimum 3 supaya satu-dua sampel
 * yang dibuang (buram/pencilan) tidak memaksa mengulang. Template lama (sampai 10 sampel dari pendaftaran melingkar) tetap sah.
 */
export const FACE_ENROLL_MIN = 3;
export const FACE_ENROLL_MAX = 12;

/** 'off' = tidak ada verifikasi wajah; 'flag' = hasil hanya ditandai untuk HC, presensi tidak pernah ditolak karena wajah. */
export type FaceMode = 'off' | 'flag';
/** match = cocok; mismatch = ada template tetapi tidak cocok; spoof = skor wajah asli di bawah ambang (foto/layar?); none = tidak dinilai. */
export type FaceResult = 'match' | 'mismatch' | 'spoof' | 'none';
export const FACE_RESULTS: readonly FaceResult[] = ['match', 'mismatch', 'spoof', 'none'];
export type FaceTemplateStatus = 'pending' | 'approved' | 'rejected';

export const FACE_RESULT_LABEL: Record<FaceResult, string> = {
  match: 'Wajah cocok', mismatch: 'Wajah tidak cocok', spoof: 'Diduga foto/layar', none: 'Wajah tidak dinilai',
};

export interface FaceSettings {
  mode: FaceMode;
  /** skor kemiripan kosinus minimum agar dianggap cocok (0-1) */
  threshold: number;
  /** skor wajah asli minimum (0-1) */
  liveThreshold: number;
}

/** Ambang awal dari uji prototipe (docs/FACE.md): orang beda <= 0,31, orang sama >= 0,78 pada bingkai bagus; wajah asli >= 0,57, serangan <= 0,17. */
export const DEFAULT_FACE_SETTINGS: FaceSettings = { mode: 'off', threshold: 0.5, liveThreshold: 0.4 };
export const FACE_THRESHOLD_RANGE = { min: 0.3, max: 0.9 } as const;
export const FACE_LIVE_THRESHOLD_RANGE = { min: 0.1, max: 0.9 } as const;

/** Kunci di tabel app_settings. */
export const FACE_SETTING_KEYS = { mode: 'face_mode', threshold: 'face_threshold', liveThreshold: 'face_live_threshold' } as const;

const inRange = (v: number, r: { min: number; max: number }) => Number.isFinite(v) && v >= r.min && v <= r.max;

/** Tafsirkan baris app_settings. Nilai hilang atau rusak jatuh ke bawaan. */
export function parseFaceSettings(rows: readonly { key: string; value: string }[]): FaceSettings {
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const mode = get(FACE_SETTING_KEYS.mode);
  const t = Number(get(FACE_SETTING_KEYS.threshold));
  const l = Number(get(FACE_SETTING_KEYS.liveThreshold));
  return {
    mode: mode === 'flag' ? 'flag' : 'off',
    threshold: get(FACE_SETTING_KEYS.threshold) !== undefined && inRange(t, FACE_THRESHOLD_RANGE) ? t : DEFAULT_FACE_SETTINGS.threshold,
    liveThreshold: get(FACE_SETTING_KEYS.liveThreshold) !== undefined && inRange(l, FACE_LIVE_THRESHOLD_RANGE) ? l : DEFAULT_FACE_SETTINGS.liveThreshold,
  };
}

/** Validasi masukan pengaturan dari super admin; mengembalikan pesan galat atau null. */
export function faceSettingsError(b: { mode?: unknown; threshold?: unknown; liveThreshold?: unknown }): string | null {
  if (b.mode !== 'off' && b.mode !== 'flag') return 'Mode verifikasi wajah tidak valid';
  if (typeof b.threshold !== 'number' || !inRange(b.threshold, FACE_THRESHOLD_RANGE)) return `Ambang kemiripan harus ${FACE_THRESHOLD_RANGE.min}-${FACE_THRESHOLD_RANGE.max}`;
  if (typeof b.liveThreshold !== 'number' || !inRange(b.liveThreshold, FACE_LIVE_THRESHOLD_RANGE)) return `Ambang wajah asli harus ${FACE_LIVE_THRESHOLD_RANGE.min}-${FACE_LIVE_THRESHOLD_RANGE.max}`;
  return null;
}

// ---- vektor wajah

const sum2 = (v: ArrayLike<number>) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!; return s; };

/** Vektor valid: tepat FACE_DIM angka berhingga dan tidak nol. */
export function validEmbedding(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === FACE_DIM && v.every((x) => typeof x === 'number' && Number.isFinite(x)) && sum2(v) > 1e-9;
}

/** Salinan ternormalkan (panjang 1). Memanggil dengan vektor nol menghasilkan vektor nol. */
export function normalize(v: ArrayLike<number>): Float32Array {
  const n = Math.sqrt(sum2(v)) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / n;
  return out;
}

/** Kemiripan kosinus dua vektor ternormalkan. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** Skor tertinggi `emb` terhadap sampel template; null bila template kosong. */
export function bestScore(templateVectors: readonly ArrayLike<number>[], emb: ArrayLike<number>): number | null {
  let best: number | null = null;
  for (const v of templateVectors) { const s = cosine(v, emb); if (best === null || s > best) best = s; }
  return best;
}

/** Simpan vektor sebagai base64 float32 little-endian (ringkas untuk D1). */
export function encodeVectors(vs: readonly ArrayLike<number>[]): string {
  const buf = new Uint8Array(vs.length * FACE_DIM * 4);
  const dv = new DataView(buf.buffer);
  vs.forEach((v, i) => { for (let j = 0; j < FACE_DIM; j++) dv.setFloat32((i * FACE_DIM + j) * 4, v[j]!, true); });
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function decodeVectors(b64: string): Float32Array[] {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const dv = new DataView(buf.buffer);
  const n = Math.floor(buf.length / (FACE_DIM * 4));
  return Array.from({ length: n }, (_, i) => Float32Array.from({ length: FACE_DIM }, (_, j) => dv.getFloat32((i * FACE_DIM + j) * 4, true)));
}

/** Batas percobaan verifikasi (sebelum presensi dikirim) per karyawan: mencegah menebak template lewat percobaan berulang. */
export const FACE_VERIFY_LIMIT = { max: 10, windowMinutes: 10 } as const;

/** Teks verdict yang ditampilkan di kartu foto presensi. Judul mengikuti permintaan produk; subjudul menjelaskan. */
export const FACE_VERDICT_TEXT: Record<'match' | 'mismatch' | 'spoof', { title: string; sub: string }> = {
  match: { title: 'Verified Face', sub: 'Wajah cocok' },
  mismatch: { title: 'Face not Verified', sub: 'Wajah tidak cocok dengan yang didaftarkan' },
  spoof: { title: 'Face not Verified', sub: 'Gunakan wajah asli, bukan foto atau layar' },
};

// ---- penilaian

/**
 * Hasil verifikasi satu presensi. Urutan: tanpa template atau tanpa skor -> none; skor wajah asli di bawah ambang -> spoof
 * (foto/layar bisa sangat mirip pemiliknya, jadi diperiksa lebih dulu); selain itu cocok bila skor >= ambang kemiripan.
 * Skor wajah asli yang tidak tersedia (model gagal dimuat) tidak menggugurkan penilaian identitas.
 */
export function assessFace(input: { hasTemplate: boolean; score: number | null; live: number | null }, s: Pick<FaceSettings, 'threshold' | 'liveThreshold'>): FaceResult {
  if (!input.hasTemplate || input.score === null) return 'none';
  if (input.live !== null && input.live < s.liveThreshold) return 'spoof';
  return input.score >= s.threshold ? 'match' : 'mismatch';
}

// ---- persetujuan biometrik (draf; perlu ditinjau pemilik/HC sebelum fitur diaktifkan)

export const FACE_CONSENT_VERSION = '2026-11-v1';
export const FACE_CONSENT_TEXT: readonly string[] = [
  'Data wajah adalah data biometrik, yaitu data pribadi yang bersifat spesifik. Aplikasi ini memakainya hanya untuk memastikan bahwa presensi dilakukan oleh Anda sendiri, bukan oleh orang lain atau lewat foto/layar.',
  'Yang disimpan: vektor angka hasil perhitungan dari wajah Anda (template) dan satu foto referensi untuk dicocokkan HC dengan KTP. Pada tiap presensi disimpan hasil penilaian wajah dan foto presensi yang sudah ada.',
  'Yang bisa melihat: Anda, HC, dan super admin. Akses HC ke foto tercatat di log audit. Template tidak ditampilkan dan tidak dikirim ke perangkat siapa pun.',
  'Hak Anda: Anda dapat menarik persetujuan kapan saja dan template serta foto referensi dihapus. Bila wajah tidak berhasil dikenali, presensi tetap dapat dilakukan dan ditandai untuk HC.',
  'Template dihapus saat Anda menarik persetujuan, saat HC mereset pendaftaran, atau saat akun Anda dinonaktifkan.',
];

// ---- notifikasi

export function planFaceRequested(ref: { id: string; employeeId: string; employeeName: string; adminIds: string[] }): NotifyInput[] {
  return ref.adminIds.filter((id) => id !== ref.employeeId).map((id) => ({
    employeeId: id, type: 'face.requested' as const, title: `Pendaftaran wajah dari ${ref.employeeName}`,
    body: 'Menunggu pencocokan dengan KTP oleh HC.', href: '/admin/wajah', entityId: ref.id,
  }));
}

export function planFaceDecided(ref: { id: string; employeeId: string; approved: boolean }): NotifyInput[] {
  return [{
    employeeId: ref.employeeId, type: 'face.decided', title: ref.approved ? 'Pendaftaran wajah disetujui' : 'Pendaftaran wajah ditolak',
    body: ref.approved ? 'Verifikasi wajah pada presensi kini aktif untuk Anda.' : 'Buka Profil untuk melihat alasan dan mendaftar ulang.', href: '/profil/wajah', entityId: ref.id,
  }];
}
