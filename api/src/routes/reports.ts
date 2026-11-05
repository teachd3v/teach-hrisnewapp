import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { REPORT_MAX_DAYS, REPORT_MIN_DATE, isAdmin, parseIsoDate, wibDate } from '@hris/shared';
import type { AppEnv } from '../env';
import { employees } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { buildReport, departmentExists } from '../lib/report';
import { requireAuth } from '../middleware/auth';

export const reports = new Hono<AppEnv>();
reports.use('*', requireAuth);

const spanDays = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;

/**
 * Rekap presensi + cuti untuk HC pada rentang tanggal bebas: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (paling lebar ${REPORT_MAX_DAYS} hari,
 * tidak boleh melewati hari ini), `&department=<id master>` opsional. Setiap pengambilan tercatat di audit.
 */
reports.get('/range', async (c) => {
  const db = drizzle(c.env.DB);
  const [me] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  if (!me || !me.active || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);

  const today = wibDate();
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  if (!parseIsoDate(from) || !parseIsoDate(to)) return c.json({ error: 'Tanggal tidak valid' }, 400);
  if (from < REPORT_MIN_DATE) return c.json({ error: 'Tanggal awal terlalu lama' }, 400);
  if (to < from) return c.json({ error: 'Tanggal akhir harus sama atau setelah tanggal awal' }, 400);
  if (to > today) return c.json({ error: 'Tanggal akhir tidak boleh setelah hari ini' }, 400);
  if (spanDays(from, to) > REPORT_MAX_DAYS) return c.json({ error: `Rentang maksimal ${REPORT_MAX_DAYS} hari` }, 400);
  const department = c.req.query('department') || null;
  if (department && !(await departmentExists(db, department))) return c.json({ error: 'Departemen tidak ditemukan' }, 404);

  const report = await buildReport(db, from, to, department, today);
  await writeAudit(db, { actorId: me.id, actorName: me.name, action: 'report.range', targetType: 'report', targetId: `${from}..${to}`, targetLabel: report.departmentName ?? 'Semua departemen', ip: c.req.header('CF-Connecting-IP'), details: { employees: report.summary.length } });
  return c.json(report);
});
