import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { REPORT_MIN_DATE, addMonths, anniversariesInMonth, birthdaysInMonth, isAdmin, lsaWindow, missingDates, monthLast, parseIsoDate, wibDate, type MomentPerson } from '@hris/shared';
import type { AppEnv } from '../env';
import { employees, master_options } from '../db/schema';
import { buildDaySnapshot, buildMonthSummary } from '../lib/dashboard';
import type { Db } from '../lib/leave-db';
import { requireAuth } from '../middleware/auth';

/**
 * Dashboard Beranda untuk admin/super admin: kehadiran (harian atau bulanan, tanpa mengunduh rekap) dan momen karyawan
 * (ulang tahun, ulang tahun kerja, LSA). Hanya baca; tidak diaudit tiap muat. Tanggal lahir hanya tampil sebagai tanggal dan bulan.
 */
export const dashboard = new Hono<AppEnv>();
dashboard.use('*', requireAuth);

type Ctx = Context<AppEnv>;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

async function adminOnly(c: Ctx, db: Db) {
  const [e] = await db.select({ role: employees.role, active: employees.active }).from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  return Boolean(e && e.active && isAdmin(e.role));
}

/** `?mode=day&date=YYYY-MM-DD` (bawaan hari ini) atau `?mode=month&month=YYYY-MM` (bawaan bulan ini). Tidak boleh melewati hari ini. */
dashboard.get('/attendance', async (c) => {
  const db = drizzle(c.env.DB);
  if (!(await adminOnly(c, db))) return c.json({ error: 'Tidak diizinkan' }, 403);
  const today = wibDate();
  const mode = c.req.query('mode') ?? 'day';
  if (mode === 'day') {
    const date = c.req.query('date') ?? today;
    if (!parseIsoDate(date)) return c.json({ error: 'Tanggal tidak valid' }, 400);
    if (date < REPORT_MIN_DATE) return c.json({ error: 'Tanggal terlalu lama' }, 400);
    if (date > today) return c.json({ error: 'Tanggal tidak boleh setelah hari ini' }, 400);
    return c.json(await buildDaySnapshot(db, date, today));
  }
  if (mode === 'month') {
    const month = c.req.query('month') ?? today.slice(0, 7);
    if (!MONTH.test(month)) return c.json({ error: 'Bulan tidak valid' }, 400);
    if (`${month}-01` < REPORT_MIN_DATE) return c.json({ error: 'Bulan terlalu lama' }, 400);
    if (`${month}-01` > today) return c.json({ error: 'Bulan tidak boleh setelah bulan ini' }, 400);
    const last = monthLast(month) < today ? monthLast(month) : today;
    return c.json(await buildMonthSummary(db, month, last, today));
  }
  return c.json({ error: 'Mode tidak valid' }, 400);
});

/**
 * Momen karyawan karyawan aktif. `?month=YYYY-MM` (bawaan bulan ini) menentukan bulan untuk ulang tahun dan ulang tahun kerja;
 * LSA selalu dari bulan ini sampai 3 bulan ke depan. `missing` = jumlah karyawan aktif yang tanggal lahir/masuknya belum terisi.
 */
dashboard.get('/people', async (c) => {
  const db = drizzle(c.env.DB);
  if (!(await adminOnly(c, db))) return c.json({ error: 'Tidak diizinkan' }, 403);
  const today = wibDate();
  const month = c.req.query('month') ?? today.slice(0, 7);
  if (!MONTH.test(month) || month < '2024-01' || month > addMonths(today.slice(0, 7), 12)) return c.json({ error: 'Bulan tidak valid' }, 400);

  const [rows, opts] = await Promise.all([
    db.select({ id: employees.id, name: employees.name, department_id: employees.department_id, birth_date: employees.birth_date, join_date: employees.join_date })
      .from(employees).where(eq(employees.active, true)),
    db.select({ id: master_options.id, name: master_options.name }).from(master_options),
  ]);
  const dept = new Map(opts.map((o) => [o.id, o.name]));
  const people: MomentPerson[] = rows.map((e) => ({ id: e.id, name: e.name, department: dept.get(e.department_id ?? '') ?? '', birthDate: e.birth_date, joinDate: e.join_date }));
  return c.json({
    month, today,
    birthdays: birthdaysInMonth(people, month, today),
    anniversaries: anniversariesInMonth(people, month, today),
    lsa: lsaWindow(people, today),
    missing: missingDates(people),
    total: people.length,
  });
});
