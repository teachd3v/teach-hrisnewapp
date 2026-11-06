// Akses aturan presensi dan lokasi kantor untuk server.
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { asc } from 'drizzle-orm';
import type { AttendancePolicy, OfficeLocation } from '@hris/shared';
import { attendance_policies, office_locations } from '../db/schema';

type Db = DrizzleD1Database;

export const toPolicy = (r: typeof attendance_policies.$inferSelect): AttendancePolicy => ({
  effectiveFrom: r.effective_from, workStart: r.work_start, graceMinutes: r.grace_minutes, locationMode: r.location_mode,
});

export const toOffice = (r: typeof office_locations.$inferSelect): OfficeLocation => ({
  id: r.id, name: r.name, lat: r.lat, lng: r.lng, radiusM: r.radius_m, active: r.active,
});

/** Semua aturan (berurutan menurut tanggal berlaku); kosong berarti pakai bawaan lewat `policyFor`. */
export async function loadPolicies(db: Db): Promise<AttendancePolicy[]> {
  return (await db.select().from(attendance_policies).orderBy(asc(attendance_policies.effective_from))).map(toPolicy);
}

/** Semua lokasi kantor (termasuk nonaktif; penilaian hanya memakai yang aktif). */
export async function loadOffices(db: Db): Promise<OfficeLocation[]> {
  return (await db.select().from(office_locations).orderBy(asc(office_locations.created_at), asc(office_locations.name))).map(toOffice);
}
