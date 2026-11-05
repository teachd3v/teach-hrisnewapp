import { Hono } from 'hono';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  IP_BLOCK_MINUTES,
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGINS,
  MAX_FAILED_LOGINS_PER_IP,
  REFRESH_TOKEN_TTL_DAYS,
  type Role,
} from '@hris/shared';
import type { AppEnv } from '../env';
import { audit_log, credentials, employees, refresh_tokens } from '../db/schema';
import { burnPasswordCheck, hashPassword, validateNewPassword, verifyPassword } from '../lib/password';
import { newRefreshToken, sha256, signAccessToken } from '../lib/tokens';
import { writeAudit } from '../lib/audit';
import { requireAuth } from '../middleware/auth';

/** Login berbasis token (lihat docs/AUTH.md). Tidak ada cookie. */
export const auth = new Hono<AppEnv>();

const GENERIC_LOGIN_ERROR = 'Email atau password salah';
const dayMs = 24 * 60 * 60 * 1000;

async function issueTokens(
  db: DrizzleD1Database,
  env: AppEnv['Bindings'],
  emp: { id: string; role: Role },
  opts: { familyId?: string; deviceLabel?: string | null },
) {
  const refreshToken = newRefreshToken();
  const now = Date.now();
  await db.insert(refresh_tokens).values({
    id: crypto.randomUUID(),
    employee_id: emp.id,
    family_id: opts.familyId ?? crypto.randomUUID(),
    token_hash: await sha256(refreshToken),
    device_label: opts.deviceLabel ?? null,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + REFRESH_TOKEN_TTL_DAYS * dayMs).toISOString(),
  });
  return {
    accessToken: await signAccessToken(env.JWT_SECRET, emp.id, emp.role, ACCESS_TOKEN_TTL_SECONDS),
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

const clientIp = (req: { header: (n: string) => string | undefined }) => req.header('CF-Connecting-IP') ?? null;

auth.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; device?: string }>().catch(() => ({}) as never);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password || password.length > 128) return c.json({ error: GENERIC_LOGIN_ERROR }, 401);

  const db = drizzle(c.env.DB);
  const ip = clientIp(c.req);

  // Pembatas per alamat IP: terlalu banyak gagal masuk dari satu IP -> tolak tanpa menghitung PBKDF2 (hemat CPU).
  // Tanpa IP (mis. pengembangan lokal) pembatas dilewati; batas per akun tetap berlaku.
  if (ip) {
    const since = new Date(Date.now() - IP_BLOCK_MINUTES * 60_000).toISOString();
    const [r] = await db.select({ n: sql<number>`count(*)` }).from(audit_log)
      .where(and(eq(audit_log.action, 'auth.login_failed'), eq(audit_log.ip, ip), gte(audit_log.at, since)));
    if (Number(r?.n ?? 0) >= MAX_FAILED_LOGINS_PER_IP) {
      // Catat pemblokiran sekali per jendela agar log tidak dibanjiri oleh percobaan yang ditolak.
      const [seen] = await db.select({ id: audit_log.id }).from(audit_log)
        .where(and(eq(audit_log.action, 'auth.ip_blocked'), eq(audit_log.ip, ip), gte(audit_log.at, since))).limit(1);
      if (!seen) await writeAudit(db, { action: 'auth.ip_blocked', ip, details: { failures: Number(r?.n), windowMinutes: IP_BLOCK_MINUTES } });
      return c.json({ error: `Terlalu banyak percobaan masuk yang gagal dari jaringan ini. Coba lagi dalam ${IP_BLOCK_MINUTES} menit.` }, 429, { 'Retry-After': String(IP_BLOCK_MINUTES * 60) });
    }
  }

  const [row] = await db
    .select({ emp: employees, cred: credentials })
    .from(employees)
    .innerJoin(credentials, eq(credentials.employee_id, employees.id))
    .where(eq(employees.email, email))
    .limit(1);

  if (!row || !row.emp.active) {
    await burnPasswordCheck(password); // samakan waktu respons
    await writeAudit(db, { action: 'auth.login_failed', targetLabel: email, ip, details: { reason: 'unknown_or_inactive' } });
    return c.json({ error: GENERIC_LOGIN_ERROR }, 401);
  }

  const { emp, cred } = row;
  if (cred.locked_until && cred.locked_until > new Date().toISOString()) {
    await writeAudit(db, { actorId: emp.id, actorName: emp.name, action: 'auth.login_locked', ip });
    return c.json({ error: `Akun dikunci sementara. Coba lagi dalam ${LOCKOUT_MINUTES} menit` }, 429);
  }

  if (!(await verifyPassword(password, cred.password_hash))) {
    // Penambahan atomik di SQL; kunci saat mencapai batas.
    const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
    await db
      .update(credentials)
      .set({
        failed_attempts: sql`${credentials.failed_attempts} + 1`,
        locked_until: sql`CASE WHEN ${credentials.failed_attempts} + 1 >= ${MAX_FAILED_LOGINS} THEN ${lockUntil} ELSE ${credentials.locked_until} END`,
      })
      .where(eq(credentials.employee_id, emp.id));
    await writeAudit(db, { actorId: emp.id, actorName: emp.name, action: 'auth.login_failed', ip, details: { reason: 'bad_password' } });
    return c.json({ error: GENERIC_LOGIN_ERROR }, 401);
  }

  await db.update(credentials).set({ failed_attempts: 0, locked_until: null }).where(eq(credentials.employee_id, emp.id));
  const tokens = await issueTokens(db, c.env, emp, { deviceLabel: body.device?.slice(0, 80) });
  await writeAudit(db, { actorId: emp.id, actorName: emp.name, action: 'auth.login', ip });
  return c.json({
    ...tokens,
    mustChangePassword: cred.must_change_password,
    user: { id: emp.id, name: emp.name, email: emp.email, role: emp.role },
  });
});

auth.post('/refresh', async (c) => {
  const body = await c.req.json<{ refreshToken?: string }>().catch(() => ({}) as never);
  if (typeof body.refreshToken !== 'string' || !body.refreshToken) return c.json({ error: 'Sesi berakhir' }, 401);

  const db = drizzle(c.env.DB);
  const [tok] = await db
    .select()
    .from(refresh_tokens)
    .where(eq(refresh_tokens.token_hash, await sha256(body.refreshToken)))
    .limit(1);
  const now = new Date().toISOString();
  if (!tok || tok.revoked_at || tok.expires_at <= now) return c.json({ error: 'Sesi berakhir' }, 401);

  // Klaim token secara atomik: hanya satu permintaan yang boleh menukar token ini.
  const claimed = await c.env.DB
    .prepare('UPDATE refresh_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL')
    .bind(now, tok.id)
    .run();
  if (!claimed.meta.changes) {
    // Token lama dipakai ulang: cabut seluruh family.
    await db.update(refresh_tokens).set({ revoked_at: now }).where(and(eq(refresh_tokens.family_id, tok.family_id), isNull(refresh_tokens.revoked_at)));
    await writeAudit(db, { actorId: tok.employee_id, action: 'auth.refresh_reuse_detected', ip: clientIp(c.req) });
    return c.json({ error: 'Sesi berakhir' }, 401);
  }

  const [emp] = await db.select().from(employees).where(eq(employees.id, tok.employee_id)).limit(1);
  if (!emp || !emp.active) return c.json({ error: 'Sesi berakhir' }, 401);
  return c.json(await issueTokens(db, c.env, emp, { familyId: tok.family_id, deviceLabel: tok.device_label }));
});

auth.post('/logout', async (c) => {
  const body = await c.req.json<{ refreshToken?: string }>().catch(() => ({}) as never);
  if (typeof body.refreshToken === 'string' && body.refreshToken) {
    const db = drizzle(c.env.DB);
    const [tok] = await db.select().from(refresh_tokens).where(eq(refresh_tokens.token_hash, await sha256(body.refreshToken))).limit(1);
    if (tok) {
      await db.update(refresh_tokens).set({ revoked_at: new Date().toISOString() }).where(and(eq(refresh_tokens.family_id, tok.family_id), isNull(refresh_tokens.revoked_at)));
    }
  }
  return c.json({ ok: true }); // selalu sukses: klien tetap menghapus token lokal
});

auth.get('/me', requireAuth, async (c) => {
  const db = drizzle(c.env.DB);
  const [emp] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  if (!emp || !emp.active) return c.json({ error: 'Sesi berakhir' }, 401);
  return c.json({ id: emp.id, name: emp.name, email: emp.email, role: emp.role, title: emp.title });
});

/** Ganti password: mencabut semua sesi; klien harus login ulang. */
auth.post('/change-password', requireAuth, async (c) => {
  const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>().catch(() => ({}) as never);
  const { currentPassword, newPassword } = body;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') return c.json({ error: 'Data tidak lengkap' }, 400);
  const invalid = validateNewPassword(newPassword);
  if (invalid) return c.json({ error: invalid }, 400);
  if (newPassword === currentPassword) return c.json({ error: 'Password baru harus berbeda' }, 400);

  const db = drizzle(c.env.DB);
  const id = c.get('user').id;
  const [cred] = await db.select().from(credentials).where(eq(credentials.employee_id, id)).limit(1);
  if (!cred || !(await verifyPassword(currentPassword, cred.password_hash))) return c.json({ error: 'Password saat ini salah' }, 400);

  const now = new Date().toISOString();
  await db.batch([
    db.update(credentials).set({ password_hash: await hashPassword(newPassword), must_change_password: false, password_changed_at: now, failed_attempts: 0, locked_until: null }).where(eq(credentials.employee_id, id)),
    db.update(refresh_tokens).set({ revoked_at: now }).where(and(eq(refresh_tokens.employee_id, id), isNull(refresh_tokens.revoked_at))),
  ]);
  await writeAudit(db, { actorId: id, action: 'auth.password_changed', ip: clientIp(c.req) });
  return c.json({ ok: true });
});
