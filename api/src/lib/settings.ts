// Akses pengaturan aplikasi (app_settings) dan penerima dampak kebijakan cuti bersama.
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, eq, inArray } from 'drizzle-orm';
import { SETTING_KEYS, parseJointLeaveSettings, type JointLeaveSettings } from '@hris/shared';
import { app_settings, employees } from '../db/schema';

type Db = DrizzleD1Database;

export async function loadJointLeaveSettings(db: Db): Promise<JointLeaveSettings> {
  const rows = await db.select().from(app_settings)
    .where(inArray(app_settings.key, [SETTING_KEYS.jointLeaveDeducts, SETTING_KEYS.jointLeaveExemptStatuses]));
  return parseJointLeaveSettings(rows);
}

/** Karyawan yang dipotong cuti bersama: aktif dan statusnya tidak dikecualikan. Penyaringan tanggal masuk dilakukan pemanggil. */
export async function jointLeaveEmployees(db: Db, settings: JointLeaveSettings) {
  const rows = await db.select({ id: employees.id, join_date: employees.join_date, status: employees.employment_status_id })
    .from(employees).where(and(eq(employees.active, true)));
  return rows.filter((r) => !(r.status && settings.exemptStatusIds.includes(r.status)));
}
