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
  /** Secret bersama dengan Worker cron (cron/). Tanpa ini /api/internal/cron menolak semua. */
  CRON_SECRET?: string;
  /** Hanya untuk uji lokal (.dev.vars): izinkan ?now= pada /api/internal/cron. Jangan diset di produksi. */
  CRON_ALLOW_NOW?: string;
  /** Service binding privat ke Worker Container `teach-hris-face` (YuNet + AuraFace v1 + MiniFASNetV2). */
  FACE_SERVICE?: Fetcher;
  /** Opsional untuk uji lokal (.dev.vars) tanpa Container Worker, mis. http://127.0.0.1:8080. */
  FACE_SERVICE_URL?: string;
}

export interface AuthUser {
  id: string;
  role: 'employee' | 'admin' | 'super_admin';
}

export type AppEnv = { Bindings: Bindings; Variables: { user: AuthUser } };
