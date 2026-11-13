// Keadaan izin kamera dan lokasi di perangkat ini, dibaca TANPA memunculkan dialog sistem. Dipakai layar presensi untuk memutuskan
// apakah perlu menampilkan pengantar sebelum dialog izin muncul (pages/AttendanceCapture).
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** `unknown`: perangkat/peramban tidak bisa memberi tahu (API tidak ada, nama izin tidak dikenal, atau aplikasi native). */
export type PermState = 'granted' | 'prompt' | 'denied' | 'unknown';

const QUERY_TIMEOUT_MS = 800;
const PRIMED_KEY = 'hris.perm.primed';

async function query(name: 'camera' | 'geolocation'): Promise<PermState> {
  try {
    if (isTauri || !navigator.permissions?.query) return 'unknown';
    const asked = navigator.permissions.query({ name: name as PermissionName }).then((s) => s.state as PermState);
    return await Promise.race([asked, new Promise<PermState>((resolve) => setTimeout(() => resolve('unknown'), QUERY_TIMEOUT_MS))]);
  } catch { return 'unknown'; } // mis. Firefox tidak mengenal nama "camera"
}

/** Pengantar izin pernah dilanjutkan di perangkat ini. */
const primed = () => { try { return localStorage.getItem(PRIMED_KEY) === '1'; } catch { return true; } };
export const markPrimed = () => { try { localStorage.setItem(PRIMED_KEY, '1'); } catch { /* tidak diingat */ } };

export interface PermissionNeed { camera: boolean; location: boolean }

/**
 * Izin mana yang perlu diantar sebelum layar presensi meminta kamera dan lokasi. Izin yang sudah diberikan atau sudah ditolak tidak
 * dihitung (yang ditolak ditangani pesan galat di layar presensi). Pengantar hanya sekali per perangkat: sebagian peramban (iPhone)
 * menanyakan izin lagi di tiap sesi, dan pengantar yang muncul setiap hari justru memperlambat presensi.
 */
export async function pendingCapturePermissions(): Promise<PermissionNeed> {
  if (primed()) return { camera: false, location: false };
  const [camera, location] = await Promise.all([query('camera'), query('geolocation')]);
  const needs = (s: PermState) => s === 'prompt' || s === 'unknown';
  return { camera: needs(camera), location: needs(location) };
}
