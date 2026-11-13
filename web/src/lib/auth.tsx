import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '@hris/shared';
import { api, apiPublic, clearTokens, refreshSession, setSessionExpiredHandler, storeTokens, type TokenPair } from './api';
import { refreshStore } from './session';
import { detachFromServer, syncPushSubscription } from './push';

export interface User { id: string; name: string; email: string; role: Role }

interface AuthState {
  user: User | null;
  /** true selama memeriksa sesi tersimpan saat aplikasi dibuka */
  loading: boolean;
  mustChangePassword: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /**
   * true bila password awal yang baru saja dipakai masuk masih diingat (di memori saja), sehingga layar ganti password pertama
   * tidak perlu memintanya lagi. Hilang saat aplikasi dimuat ulang.
   */
  hasInitialPassword: boolean;
  /** `currentPassword` null = pakai password awal yang diingat. Perangkat ini tetap masuk; perangkat lain keluar. */
  changePassword(currentPassword: string | null, newPassword: string): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChange] = useState(false);
  // Password awal hanya disimpan di memori, dan hanya selama akun masih wajib menggantinya.
  const [initialPassword, setInitialPassword] = useState<string | null>(null);

  const reset = useCallback(() => {
    clearTokens();
    setUser(null);
    setMustChange(false);
    setInitialPassword(null);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(reset);
    let cancelled = false;
    (async () => {
      // Pulihkan sesi dari refresh token tersimpan.
      if (refreshStore.get() && (await refreshSession())) {
        try {
          const { mustChangePassword: must, ...me } = await api<User & { mustChangePassword?: boolean }>('/auth/me');
          if (!cancelled) { setUser(me); setMustChange(Boolean(must)); void syncPushSubscription(); }
        } catch { /* sesi tidak valid: tampil login */ }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reset]);

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    mustChangePassword,
    async login(email, password) {
      const res = await apiPublic<TokenPair & { mustChangePassword: boolean; user: User }>('/auth/login', {
        method: 'POST',
        json: { email, password, device: navigator.userAgent.slice(0, 80) },
      });
      storeTokens(res);
      setMustChange(res.mustChangePassword);
      setInitialPassword(res.mustChangePassword ? password : null);
      setUser(res.user);
      void syncPushSubscription();
    },
    async logout() {
      const refreshToken = refreshStore.get();
      await detachFromServer(); // lepas langganan push perangkat dari akun ini selagi token masih berlaku
      reset();
      if (refreshToken) await apiPublic('/auth/logout', { method: 'POST', json: { refreshToken } }).catch(() => {});
    },
    hasInitialPassword: initialPassword !== null,
    async changePassword(currentPassword, newPassword) {
      const res = await api<TokenPair>('/auth/change-password', {
        method: 'POST',
        json: { currentPassword: currentPassword ?? initialPassword ?? '', newPassword, device: navigator.userAgent.slice(0, 80) },
      });
      // Server mencabut semua sesi lama lalu memberi sesi baru untuk perangkat ini: tidak perlu masuk lagi.
      storeTokens(res);
      setMustChange(false);
      setInitialPassword(null);
    },
  }), [user, loading, mustChangePassword, initialPassword, reset]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth harus di dalam AuthProvider');
  return v;
}
