// Akses pengaturan dan template verifikasi wajah untuk server (docs/FACE.md).
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { FACE_SETTING_KEYS, parseFaceSettings, type FaceSettings } from '@hris/shared';
import { app_settings, face_templates } from '../db/schema';

type Db = DrizzleD1Database;

/** Awalan kunci R2 foto referensi pendaftaran wajah. */
export const FACE_PREFIX = 'face_reference/';

export async function loadFaceSettings(db: Db): Promise<FaceSettings> {
  const rows = await db.select().from(app_settings).where(inArray(app_settings.key, Object.values(FACE_SETTING_KEYS)));
  return parseFaceSettings(rows);
}

/** Template aktif (disetujui) terbaru seorang karyawan, atau undefined. */
export async function approvedTemplate(db: Db, employeeId: string) {
  const [row] = await db.select().from(face_templates)
    .where(and(eq(face_templates.employee_id, employeeId), eq(face_templates.status, 'approved')))
    .orderBy(desc(face_templates.decided_at)).limit(1);
  return row;
}

/**
 * Hapus semua template dan foto referensi seorang karyawan (tarik persetujuan, reset HC, akun dinonaktifkan).
 * Mengembalikan id template yang dihapus (untuk menutup notifikasi "perlu aksi").
 */
export async function purgeFace(storage: R2Bucket, db: Db, employeeId: string): Promise<string[]> {
  const rows = await db.select({ id: face_templates.id, key: face_templates.reference_photo_key }).from(face_templates).where(eq(face_templates.employee_id, employeeId));
  if (!rows.length) return [];
  await db.delete(face_templates).where(eq(face_templates.employee_id, employeeId));
  await Promise.all(rows.map((r) => storage.delete(r.key).catch(() => {})));
  return rows.map((r) => r.id);
}
