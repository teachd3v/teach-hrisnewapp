// Akses jenis cuti (tabel leave_types) untuk server.
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { asc } from 'drizzle-orm';
import type { LeaveTypeMeta } from '@hris/shared';
import { leave_types } from '../db/schema';

type Db = DrizzleD1Database;

export const toMeta = (r: typeof leave_types.$inferSelect): LeaveTypeMeta => ({
  key: r.key, label: r.label, description: r.description, defaultQuota: r.default_quota,
  requiresAttachment: r.requires_attachment, timeBased: r.time_based, gender: r.gender,
  active: r.active, system: r.system, sortOrder: r.sort_order,
});

/** Semua jenis cuti (termasuk nonaktif, karena pengajuan lama masih merujuknya), berurutan. */
export async function loadLeaveTypes(db: Db): Promise<LeaveTypeMeta[]> {
  return (await db.select().from(leave_types).orderBy(asc(leave_types.sort_order), asc(leave_types.label))).map(toMeta);
}

/** Himpunan pengenal jenis per jam (izin terlambat/pulang cepat dan jenis per jam buatan admin). */
export const timeBasedKeys = (types: readonly LeaveTypeMeta[]) => new Set(types.filter((t) => t.timeBased).map((t) => t.key));

/** Nama tampilan untuk sebuah pengenal; pengenal yang sudah tidak ada ditampilkan apa adanya. */
export const labelMap = (types: readonly LeaveTypeMeta[]) => new Map(types.map((t) => [t.key, t.label]));
