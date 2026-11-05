export interface Bindings {
  DB: D1Database;
  STORAGE: R2Bucket;
  /** Penanda tangan access token (HMAC). Secret, bukan var. */
  JWT_SECRET: string;
  /** Penanda tangan tautan berkas R2 berumur pendek. Secret. */
  URL_SIGNING_SECRET: string;
  /** Origin web sendiri, mis. https://app.hrteach.site */
  WEB_ORIGIN: string;
  /** Kunci publik VAPID (base64url). Var, bukan secret. Tanpa ini push dimatikan. */
  VAPID_PUBLIC_KEY?: string;
  /** Kunci privat VAPID (base64url). Secret. */
  VAPID_PRIVATE_KEY?: string;
  /** Kontak VAPID (URL https atau mailto). Jangan memakai email pribadi. */
  VAPID_SUBJECT?: string;
}

export interface AuthUser {
  id: string;
  role: 'employee' | 'admin' | 'super_admin';
}

export type AppEnv = { Bindings: Bindings; Variables: { user: AuthUser } };
