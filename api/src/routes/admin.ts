import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm';
import { LEAVE_TYPES, isAdmin, parseIsoDate, type Role } from '@hris/shared';
import type { AppEnv } from '../env';
import { audit_log, credentials, employees, holidays, leave_quotas, refresh_tokens } from '../db/schema';
import { auditRow } from '../lib/audit';
import { getBalances, type Db } from '../lib/leave-db';
import { hashPassword, validateNewPassword } from '../lib/password';
import { requireAuth } from '../middleware/auth';

/**
 * Menu admin. Admin (HC) mengelola karyawan, atasan, password awal, kuota, dan hari libur.
 * Hanya super admin yang boleh: mengubah peran, data kepegawaian (jabatan, departemen, level, status, tanggal masuk),
 * menonaktifkan akun, dan menyentuh akun admin/super admin lain.
 */
export const admin = new Hono<AppEnv>();
admin.use('*', requireAuth);

type Employee = typeof employees.$inferSelect;
type Ctx = Context<AppEnv>;

const ROLES: Role[] = ['employee', 'admin', 'super_admin'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS = ['Laki-laki', 'Perempuan'];
const KEPEGAWAIAN = ['title', 'dept', 'level', 'employment_status', 'join_date'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batch = (db: Db, stmts: any[]) => db.batch(stmts as [any, ...any[]]);
const one = async <T>(p: Promise<T[]>) => (await p)[0];

/** Pelaku diambil ulang dari D1 (peran di token bisa basi). Null bila bukan admin. */
async function adminActor(c: Ctx, db: Db): Promise<Employee | null> {
  const [e] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  return e && e.active && isAdmin(e.role) ? e : null;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ip = (c: Ctx) => c.req.header('CF-Connecting-IP') ?? null;

// ------------------------------------------------------------------ karyawan

admin.get('/employees', async (c) => {
  const db = drizzle(c.env.DB);
  if (!(await adminActor(c, db))) return c.json({ error: 'Tidak diizinkan' }, 403);
  const rows = await db.select({
    id: employees.id, employee_code: employees.employee_code, name: employees.name, email: employees.email, phone: employees.phone,
    gender: employees.gender, title: employees.title, dept: employees.dept, level: employees.level,
    employment_status: employees.employment_status, join_date: employees.join_date, role: employees.role,
    manager_id: employees.manager_id, is_top_leader: employees.is_top_leader, active: employees.active,
  }).from(employees).orderBy(asc(employees.name));
  return c.json(rows);
});

/** Apakah `candidateId` berada di rantai atasan `startId` ke atas (atau sama dengan)? Dipakai mencegah atasan melingkar. */
async function inChain(db: Db, startId: string, candidateId: string): Promise<boolean> {
  const seen = new Set<string>();
  let cur: string | null = startId;
  while (cur && !seen.has(cur)) {
    if (cur === candidateId) return true;
    seen.add(cur);
    cur = (await one(db.select({ m: employees.manager_id }).from(employees).where(eq(employees.id, cur)).limit(1)))?.m ?? null;
  }
  return false;
}

function validateFields(b: Record<string, unknown>): string | null {
  if ('name' in b && !text(b.name, 100)) return 'Nama wajib diisi';
  if ('email' in b && !EMAIL_RE.test(text(b.email, 120))) return 'Format email tidak valid';
  if ('gender' in b && b.gender !== null && b.gender !== '' && !GENDERS.includes(b.gender as string)) return 'Jenis kelamin tidak valid';
  if ('join_date' in b && b.join_date && !parseIsoDate(String(b.join_date))) return 'Tanggal masuk tidak valid';
  if ('role' in b && !ROLES.includes(b.role as Role)) return 'Peran tidak valid';
  return null;
}

admin.post('/employees', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await adminActor(c, db);
  if (!me) return c.json({ error: 'Tidak diizinkan' }, 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const superAdmin = me.role === 'super_admin';

  const invalid = validateFields({ name: b.name, email: b.email, gender: b.gender ?? null, join_date: b.join_date ?? null, role: b.role ?? 'employee' });
  if (invalid) return c.json({ error: invalid }, 400);
  const password = typeof b.password === 'string' ? b.password : '';
  const pwErr = validateNewPassword(password);
  if (pwErr) return c.json({ error: `Password awal: ${pwErr}` }, 400);

  const role = (b.role as Role | undefined) ?? 'employee';
  if (role !== 'employee' && !superAdmin) return c.json({ error: 'Hanya super admin yang dapat membuat akun admin' }, 403);
  if (!superAdmin && KEPEGAWAIAN.some((k) => text(b[k], 100))) return c.json({ error: 'Data kepegawaian hanya dapat diisi super admin' }, 403);

  const email = text(b.email, 120).toLowerCase();
  if (await one(db.select({ id: employees.id }).from(employees).where(eq(employees.email, email)).limit(1))) {
    return c.json({ error: 'Email sudah terdaftar' }, 409);
  }
  const managerId = text(b.manager_id, 64) || null;
  if (managerId && !(await one(db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, managerId), eq(employees.active, true))).limit(1)))) {
    return c.json({ error: 'Atasan tidak ditemukan atau tidak aktif' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await batch(db, [
    db.insert(employees).values({
      id, name: text(b.name, 100), email, phone: text(b.phone, 30) || null, gender: text(b.gender, 20) || null,
      employee_code: text(b.employee_code, 30) || null,
      title: text(b.title, 100) || null, dept: text(b.dept, 100) || null, level: text(b.level, 50) || null,
      employment_status: text(b.employment_status, 50) || null, join_date: text(b.join_date, 10) || null,
      role, manager_id: managerId, is_top_leader: Boolean(b.is_top_leader) && !managerId, active: true, created_at: now, updated_at: now,
    }),
    db.insert(credentials).values({ employee_id: id, password_hash: await hashPassword(password), must_change_password: true }),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'employee.created', targetType: 'employee', targetId: id, targetLabel: text(b.name, 100), ip: ip(c), details: { email, role, manager_id: managerId } })),
  ]);
  return c.json({ id }, 201);
});

admin.patch('/employees/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await adminActor(c, db);
  if (!me) return c.json({ error: 'Tidak diizinkan' }, 403);
  const id = c.req.param('id');
  const superAdmin = me.role === 'super_admin';
  const [target] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!target) return c.json({ error: 'Karyawan tidak ditemukan' }, 404);
  if (isAdmin(target.role) && !superAdmin && target.id !== me.id) return c.json({ error: 'Akun admin hanya dapat diubah super admin' }, 403);

  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const invalid = validateFields(b);
  if (invalid) return c.json({ error: invalid }, 400);

  const set: Partial<typeof employees.$inferInsert> = {};
  const changes: Record<string, unknown> = {};
  const assign = <K extends keyof typeof employees.$inferInsert>(k: K, v: (typeof employees.$inferInsert)[K]) => {
    if (target[k as keyof Employee] !== v) { set[k] = v; changes[k] = v; }
  };

  if ('name' in b) assign('name', text(b.name, 100));
  if ('phone' in b) assign('phone', text(b.phone, 30) || null);
  if ('gender' in b) assign('gender', text(b.gender, 20) || null);
  if ('employee_code' in b) assign('employee_code', text(b.employee_code, 30) || null);
  if ('email' in b) {
    const email = text(b.email, 120).toLowerCase();
    if (email !== target.email) {
      if (await one(db.select({ id: employees.id }).from(employees).where(and(eq(employees.email, email), ne(employees.id, id))).limit(1))) return c.json({ error: 'Email sudah terdaftar' }, 409);
      assign('email', email);
    }
  }

  // Data kepegawaian, peran, dan status aktif: hanya super admin.
  const restricted = KEPEGAWAIAN.some((k) => k in b) || 'role' in b || 'active' in b;
  if (restricted && !superAdmin) return c.json({ error: 'Perubahan data kepegawaian, peran, dan status akun hanya dapat dilakukan super admin' }, 403);
  for (const k of KEPEGAWAIAN) if (k in b) assign(k, text(b[k], 100) || null);
  if ('role' in b) {
    if (target.role === 'super_admin' && b.role !== 'super_admin') {
      const others = await one(db.select({ n: sql<number>`count(*)` }).from(employees).where(and(eq(employees.role, 'super_admin'), eq(employees.active, true), ne(employees.id, id))));
      if (!others || Number(others.n) === 0) return c.json({ error: 'Harus tersisa minimal satu super admin aktif' }, 400);
    }
    assign('role', b.role as Role);
  }
  let deactivate = false;
  if ('active' in b) {
    const active = Boolean(b.active);
    if (!active && target.id === me.id) return c.json({ error: 'Anda tidak dapat menonaktifkan akun sendiri' }, 400);
    if (!active && target.role === 'super_admin') {
      const others = await one(db.select({ n: sql<number>`count(*)` }).from(employees).where(and(eq(employees.role, 'super_admin'), eq(employees.active, true), ne(employees.id, id))));
      if (!others || Number(others.n) === 0) return c.json({ error: 'Harus tersisa minimal satu super admin aktif' }, 400);
    }
    deactivate = !active && target.active;
    assign('active', active);
  }

  // Struktur organisasi: atasan dan pucuk pimpinan.
  if ('manager_id' in b || 'is_top_leader' in b) {
    const managerId = 'manager_id' in b ? text(b.manager_id, 64) || null : target.manager_id;
    const top = 'is_top_leader' in b ? Boolean(b.is_top_leader) : target.is_top_leader;
    if (top && managerId) return c.json({ error: 'Pucuk pimpinan tidak boleh punya atasan' }, 400);
    if (managerId) {
      if (managerId === id) return c.json({ error: 'Karyawan tidak dapat menjadi atasan dirinya sendiri' }, 400);
      if (!(await one(db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, managerId), eq(employees.active, true))).limit(1)))) return c.json({ error: 'Atasan tidak ditemukan atau tidak aktif' }, 400);
      if (await inChain(db, managerId, id)) return c.json({ error: 'Atasan tidak valid: akan membentuk rantai melingkar' }, 400);
    }
    assign('manager_id', managerId);
    assign('is_top_leader', top);
  }

  if (!Object.keys(set).length) return c.json({ ok: true, changed: false });
  set.updated_at = new Date().toISOString();
  await batch(db, [
    db.update(employees).set(set).where(eq(employees.id, id)),
    ...(deactivate ? [db.update(refresh_tokens).set({ revoked_at: set.updated_at }).where(and(eq(refresh_tokens.employee_id, id), isNull(refresh_tokens.revoked_at)))] : []),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'employee.updated', targetType: 'employee', targetId: id, targetLabel: target.name, ip: ip(c), details: { before: Object.fromEntries(Object.keys(changes).map((k) => [k, target[k as keyof Employee]])), after: changes } })),
  ]);
  return c.json({ ok: true, changed: true });
});

/** Setel password sementara: wajib diganti saat login, akun dibuka kuncinya, semua sesi dicabut. */
admin.post('/employees/:id/reset-password', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await adminActor(c, db);
  if (!me) return c.json({ error: 'Tidak diizinkan' }, 403);
  const id = c.req.param('id');
  const [target] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!target) return c.json({ error: 'Karyawan tidak ditemukan' }, 404);
  if (isAdmin(target.role) && me.role !== 'super_admin' && target.id !== me.id) return c.json({ error: 'Password akun admin hanya dapat direset super admin' }, 403);
  const { password } = await c.req.json<{ password?: string }>().catch(() => ({} as { password?: string }));
  const pwErr = validateNewPassword(password ?? '');
  if (pwErr) return c.json({ error: pwErr }, 400);

  const now = new Date().toISOString();
  await batch(db, [
    db.update(credentials).set({ password_hash: await hashPassword(password!), must_change_password: true, failed_attempts: 0, locked_until: null }).where(eq(credentials.employee_id, id)),
    db.update(refresh_tokens).set({ revoked_at: now }).where(and(eq(refresh_tokens.employee_id, id), isNull(refresh_tokens.revoked_at))),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'employee.password_reset', targetType: 'employee', targetId: id, targetLabel: target.name, ip: ip(c) })),
  ]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ kuota cuti

/** Saldo satu karyawan untuk satu tahun, termasuk apakah jatah khusus sudah ditetapkan. */
admin.get('/quotas', async (c) => {
  const db = drizzle(c.env.DB);
  if (!(await adminActor(c, db))) return c.json({ error: 'Tidak diizinkan' }, 403);
  const employeeId = c.req.query('employeeId') ?? '';
  const year = Number(c.req.query('year')) || new Date().getUTCFullYear();
  if (!employeeId || !Number.isInteger(year) || year < 2020 || year > 2100) return c.json({ error: 'Parameter tidak valid' }, 400);
  if (!(await one(db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1)))) return c.json({ error: 'Karyawan tidak ditemukan' }, 404);
  return c.json(await getBalances(db, employeeId, year));
});

/** `quota: null` menghapus jatah khusus (kembali ke bawaan). */
admin.put('/quotas', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await adminActor(c, db);
  if (!me) return c.json({ error: 'Tidak diizinkan' }, 403);
  const b = await c.req.json<{ employeeId?: string; leaveType?: string; year?: number; quota?: number | null }>().catch(() => ({} as never));
  const { employeeId, leaveType, year, quota } = b;
  if (!employeeId || !LEAVE_TYPES.some((t) => t.key === leaveType) || !Number.isInteger(year) || year! < 2020 || year! > 2100) return c.json({ error: 'Data tidak valid' }, 400);
  if (quota !== null && (typeof quota !== 'number' || !Number.isFinite(quota) || quota < 0 || quota > 366 || quota * 2 !== Math.round(quota * 2))) {
    return c.json({ error: 'Jatah harus 0-366 hari (kelipatan 0,5) atau kosong untuk bawaan' }, 400);
  }
  const target = await one(db.select({ name: employees.name }).from(employees).where(eq(employees.id, employeeId)).limit(1));
  if (!target) return c.json({ error: 'Karyawan tidak ditemukan' }, 404);

  await batch(db, [
    quota === null
      ? db.delete(leave_quotas).where(and(eq(leave_quotas.employee_id, employeeId), eq(leave_quotas.leave_type, leaveType!), eq(leave_quotas.year, year!)))
      : db.insert(leave_quotas).values({ employee_id: employeeId, leave_type: leaveType!, year: year!, quota }).onConflictDoUpdate({ target: [leave_quotas.employee_id, leave_quotas.leave_type, leave_quotas.year], set: { quota } }),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'leave.quota_set', targetType: 'employee', targetId: employeeId, targetLabel: target.name, ip: ip(c), details: { leaveType, year, quota } })),
  ]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ hari libur

admin.get('/holidays', async (c) => {
  const db = drizzle(c.env.DB);
  if (!(await adminActor(c, db))) return c.json({ error: 'Tidak diizinkan' }, 403);
  const year = Number(c.req.query('year')) || new Date().getUTCFullYear();
  return c.json(await db.select().from(holidays).where(and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`))).orderBy(asc(holidays.date)));
});

admin.post('/holidays', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await adminActor(c, db);
  if (!me) return c.json({ error: 'Tidak diizinkan' }, 403);
  const b = await c.req.json<{ date?: string; name?: string; type?: string }>().catch(() => ({} as never));
  const name = text(b.name, 100);
  if (!b.date || !parseIsoDate(b.date)) return c.json({ error: 'Tanggal tidak valid' }, 400);
  if (!name) return c.json({ error: 'Nama hari libur wajib diisi' }, 400);
  if (b.type !== 'NATIONAL' && b.type !== 'JOINT') return c.json({ error: 'Jenis tidak valid' }, 400);
  await batch(db, [
    db.insert(holidays).values({ date: b.date, name, type: b.type }).onConflictDoUpdate({ target: holidays.date, set: { name, type: b.type } }),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'holiday.set', targetType: 'holiday', targetId: b.date, targetLabel: name, ip: ip(c), details: { type: b.type } })),
  ]);
  return c.json({ ok: true }, 201);
});

admin.delete('/holidays/:date', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await adminActor(c, db);
  if (!me) return c.json({ error: 'Tidak diizinkan' }, 403);
  const date = c.req.param('date');
  if (!parseIsoDate(date)) return c.json({ error: 'Tanggal tidak valid' }, 400);
  const row = await one(db.select().from(holidays).where(eq(holidays.date, date)).limit(1));
  if (!row) return c.json({ error: 'Hari libur tidak ditemukan' }, 404);
  await batch(db, [
    db.delete(holidays).where(eq(holidays.date, date)),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'holiday.deleted', targetType: 'holiday', targetId: date, targetLabel: row.name, ip: ip(c) })),
  ]);
  return c.json({ ok: true });
});
