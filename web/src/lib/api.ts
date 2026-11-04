// Klien API. Di web: same-origin '/api'. Di Tauri: isi VITE_API_BASE dengan URL produksi.
// Access token hanya di memori; refresh token lewat lapisan penyimpanan (lib/session.ts).
import { refreshStore } from './session';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface TokenPair { accessToken: string; refreshToken: string; expiresIn: number }

let accessToken: string | null = null;
let onSessionExpired: () => void = () => {};

export const setAccessToken = (t: string | null) => { accessToken = t; };
export const setSessionExpiredHandler = (fn: () => void) => { onSessionExpired = fn; };

export function storeTokens(t: TokenPair) {
  accessToken = t.accessToken;
  refreshStore.set(t.refreshToken);
}

export function clearTokens() {
  accessToken = null;
  refreshStore.clear();
}

async function raw<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...rest.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? `Permintaan gagal (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

// Satu permintaan refresh pada satu waktu: refresh token dirotasi, jadi permintaan paralel akan saling mencabut.
let refreshing: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = refreshStore.get();
    if (!refreshToken) return false;
    try {
      storeTokens(await raw<TokenPair>('/auth/refresh', { method: 'POST', json: { refreshToken } }));
      return true;
    } catch (e) {
      // Hanya 401 yang berarti sesi mati; gangguan jaringan jangan memaksa keluar.
      if (e instanceof ApiError && e.status === 401) clearTokens();
      return false;
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

/** Panggilan API terautentikasi: 401 -> refresh sekali -> ulangi. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  try {
    return await raw<T>(path, init);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    if (await refreshSession()) return raw<T>(path, init);
    onSessionExpired();
    throw e;
  }
}

/** Panggilan tanpa auto-refresh (login: 401 berarti kredensial salah). */
export const apiPublic = raw;
