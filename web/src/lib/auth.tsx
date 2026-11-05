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
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChange] = useState(false);

  const reset = useCallback(() => {
    clearTokens();
    setUser(null);
    setMustChange(false);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(reset);
    let cancelled = false;
    (async () => {
      // Pulihkan sesi dari refresh token tersimpan.
      if (refreshStore.get() && (await refreshSession())) {
        try {
          const me = await api<User>('/auth/me');
          if (!cancelled) { setUser(me); void syncPushSubscription(); }
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
      setUser(res.user);
      void syncPushSubscription();
    },
    async logout() {
      const refreshToken = refreshStore.get();
      await detachFromServer(); // lepas langganan push perangkat dari akun ini selagi token masih berlaku
      reset();
      if (refreshToken) await apiPublic('/auth/logout', { method: 'POST', json: { refreshToken } }).catch(() => {});
    },
    async changePassword(currentPassword, newPassword) {
      await api('/auth/change-password', { method: 'POST', json: { currentPassword, newPassword } });
      reset(); // server mencabut semua sesi: masuk lagi dengan password baru
    },
  }), [user, loading, mustChangePassword, reset]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth harus di dalam AuthProvider');
  return v;
}
