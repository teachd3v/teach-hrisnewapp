// Klien API. Di web: same-origin '/api'. Di Tauri: isi VITE_API_BASE dengan URL produksi.
// Token disimpan lewat lapisan penyimpanan (web: memori + refresh; Tauri: penyimpanan aman). Lihat docs/AUTH.md.
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Permintaan gagal (${res.status})`);
  }
  return res.json() as Promise<T>;
}
