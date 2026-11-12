/**
 * Wallpaper pribadi: gambar yang diunggah karyawan menjadi latar aplikasi. Disimpan di perangkat ini saja (IndexedDB), per akun,
 * tidak dikirim ke server. Tingkat transparansi disimpan di localStorage. Gambar dikecilkan saat diunggah (sisi terpanjang 1280 px, JPEG).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';

const DB_NAME = 'hris-wallpaper';
const STORE = 'kv';
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
export const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_SIDE = 1280;
export const DEFAULT_TRANSPARENCY = 50;
export const MAX_TRANSPARENCY = 90;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Penyimpanan tidak tersedia di perangkat ini')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Penyimpanan tidak dapat dibuka'));
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Penyimpanan gagal'));
    });
  } finally { db.close(); }
}

const blobKey = (userId: string) => `bg:${userId}`;
const tKey = (userId: string) => `hris.wallpaper.t.${userId}`;

function readTransparency(userId: string): number {
  try {
    const n = Number(localStorage.getItem(tKey(userId)));
    return localStorage.getItem(tKey(userId)) !== null && Number.isFinite(n) ? Math.min(MAX_TRANSPARENCY, Math.max(0, Math.round(n))) : DEFAULT_TRANSPARENCY;
  } catch { return DEFAULT_TRANSPARENCY; }
}

/** Periksa lalu kecilkan gambar pilihan pengguna menjadi JPEG yang ringan. Melempar galat berpesan Indonesia bila tidak layak. */
export async function prepareWallpaper(file: File): Promise<Blob> {
  if (!ACCEPT.split(',').includes(file.type)) throw new Error('Format gambar harus JPG, PNG, atau WebP');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Gambar terlalu besar (maks. 15 MB)');
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('Gambar tidak dapat dibuka. Coba gambar lain'); }
  try {
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s));
    const h = Math.max(1, Math.round(bmp.height * s));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Pengolah gambar tidak tersedia');
    ctx.fillStyle = '#ffffff'; // PNG transparan dialasi putih agar tidak jadi hitam saat dijadikan JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gambar gagal diolah'))), 'image/jpeg', 0.82));
  } finally { bmp.close(); }
}

/** Kecerahan rata-rata gambar (0 gelap sampai 1 terang), dari cuplikan 24x24. */
async function averageLuminance(blob: Blob): Promise<number | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 24;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) { bmp.close(); return null; }
    ctx.drawImage(bmp, 0, 0, 24, 24);
    bmp.close();
    const d = ctx.getImageData(0, 0, 24, 24).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255;
    return sum / (d.length / 4);
  } catch { return null; }
}

/** Kecerahan latar bawaan aplikasi (0..1) dan kecerahan campuran terendah yang masih membuat teks di luar kartu terbaca. */
const BASE_LUMA = 0.93;
const READABLE_LUMA = 0.72;

/**
 * Batas bawah transparansi untuk gambar dengan kecerahan rata-rata `lum`. Gambar terang bebas diatur penuh; gambar yang lebih gelap
 * dibatasi (kelipatan 5) agar campuran gambar dan latar tetap cukup terang untuk teks gelap di luar kartu.
 */
export function minTransparencyFor(lum: number | null): number {
  if (lum === null || lum >= READABLE_LUMA) return 0;
  const maxOpacity = Math.min(1, (BASE_LUMA - READABLE_LUMA) / (BASE_LUMA - lum));
  return Math.min(MAX_TRANSPARENCY, Math.ceil(((1 - maxOpacity) * 100) / 5) * 5);
}

interface WallpaperState {
  /** Alamat objek gambar (blob:), null bila belum ada wallpaper. */
  url: string | null;
  /** Transparansi yang berlaku: 0 = wallpaper tampak penuh, MAX_TRANSPARENCY = sangat samar. Tidak pernah di bawah `minTransparency`. */
  transparency: number;
  /** Batas bawah untuk gambar yang gelap, supaya teks di luar kartu tetap terbaca (0 untuk gambar terang). */
  minTransparency: number;
  supported: boolean;
  setImage: (file: File) => Promise<void>;
  setTransparency: (t: number) => void;
  clear: () => Promise<void>;
}

const Ctx = createContext<WallpaperState>({ url: null, transparency: DEFAULT_TRANSPARENCY, minTransparency: 0, supported: true, setImage: async () => {}, setTransparency: () => {}, clear: async () => {} });
export const useWallpaper = () => useContext(Ctx);

export function WallpaperProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [lum, setLum] = useState<number | null>(null);
  const [supported, setSupported] = useState(true);
  const [transparency, setT] = useState(DEFAULT_TRANSPARENCY);

  // Muat wallpaper milik akun yang sedang masuk (ganti akun = ganti wallpaper).
  useEffect(() => {
    let cancelled = false;
    setBlob(null);
    if (!userId) return;
    setT(readTransparency(userId));
    idb<Blob | undefined>('readonly', (s) => s.get(blobKey(userId)) as IDBRequest<Blob | undefined>)
      .then((b) => { if (!cancelled) { setBlob(b instanceof Blob ? b : null); setSupported(true); } })
      .catch(() => { if (!cancelled) setSupported(false); });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!blob) { setUrl(null); setLum(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    let cancelled = false;
    void averageLuminance(blob).then((l) => { if (!cancelled) setLum(l); });
    return () => { cancelled = true; URL.revokeObjectURL(u); };
  }, [blob]);

  const setImage = useCallback(async (file: File) => {
    if (!userId) return;
    const out = await prepareWallpaper(file);
    setBlob(out); // tampil segera, meski penyimpanan gagal (berlaku selama aplikasi terbuka)
    try { await idb('readwrite', (s) => s.put(out, blobKey(userId))); setSupported(true); } catch { setSupported(false); }
  }, [userId]);

  const clear = useCallback(async () => {
    if (!userId) return;
    setBlob(null);
    try { await idb('readwrite', (s) => s.delete(blobKey(userId))); } catch { /* tidak ada yang perlu dihapus */ }
  }, [userId]);

  const setTransparency = useCallback((t: number) => {
    const v = Math.min(MAX_TRANSPARENCY, Math.max(0, Math.round(t)));
    setT(v);
    if (userId) { try { localStorage.setItem(tKey(userId), String(v)); } catch { /* preferensi tidak tersimpan */ } }
  }, [userId]);

  const minTransparency = minTransparencyFor(lum);
  const value = useMemo(() => ({ url, transparency: Math.max(transparency, minTransparency), minTransparency, supported, setImage, setTransparency, clear }), [url, transparency, minTransparency, supported, setImage, setTransparency, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
