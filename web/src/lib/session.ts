// Penyimpanan refresh token. Satu-satunya tempat yang perlu diganti saat aplikasi Tauri
// memakai penyimpanan aman perangkat (Keychain/Keystore). Lihat docs/AUTH.md.
const KEY = 'hris.refresh';

export const refreshStore = {
  get(): string | null {
    try { return localStorage.getItem(KEY); } catch { return null; }
  },
  set(token: string) {
    try { localStorage.setItem(KEY, token); } catch { /* penyimpanan diblokir: sesi hanya hidup selama tab terbuka */ }
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* abaikan */ }
  },
};
