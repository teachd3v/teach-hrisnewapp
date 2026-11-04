export interface Bindings {
  DB: D1Database;
  STORAGE: R2Bucket;
  /** Penanda tangan access token (HMAC). Secret, bukan var. */
  JWT_SECRET: string;
  /** Penanda tangan tautan berkas R2 berumur pendek. Secret. */
  URL_SIGNING_SECRET: string;
  /** Origin web sendiri, mis. https://app.hrteach.site */
  WEB_ORIGIN: string;
}

export interface AuthUser {
  id: string;
  role: 'employee' | 'admin' | 'super_admin';
}

export type AppEnv = { Bindings: Bindings; Variables: { user: AuthUser } };
