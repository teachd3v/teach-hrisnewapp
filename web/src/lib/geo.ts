// Lokasi: plugin geolocation Tauri di aplikasi HP; navigator.geolocation di browser.
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface Fix { lat: number; lng: number; accuracy: number }

const TIMEOUT_MS = 15_000;

export async function getPosition(): Promise<Fix> {
  if (isTauri) {
    const { checkPermissions, requestPermissions, getCurrentPosition } = await import('@tauri-apps/plugin-geolocation');
    let p = await checkPermissions();
    if (p.location !== 'granted') p = await requestPermissions(['location']);
    if (p.location !== 'granted') throw new Error('Izin lokasi ditolak. Aktifkan di pengaturan aplikasi.');
    const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
  }
  if (!('geolocation' in navigator)) throw new Error('Perangkat tidak mendukung lokasi.');
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Izin lokasi ditolak. Aktifkan izin lokasi untuk situs/aplikasi ini.' : err.code === err.TIMEOUT ? 'Lokasi tidak ditemukan tepat waktu.' : 'Lokasi tidak tersedia.')),
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 },
    );
  });
}
