import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { isAdmin } from '@hris/shared';
import type { AppEnv } from '../env';
import { employees, leave_requests } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { signFileLink, verifyFileLink } from '../lib/signed-url';
import { requireAuth } from '../middleware/auth';

/**
 * Berkas R2 tidak pernah dibuka langsung. Klien meminta tautan lewat POST /link (terautentikasi, dicek haknya),
 * lalu membuka GET /get dengan tanda tangan berumur 5 menit.
 */
export const files = new Hono<AppEnv>();

const LEAVE_PREFIX = 'leave_attachments/';

files.post('/link', requireAuth, async (c) => {
  const { key } = await c.req.json<{ key?: string }>().catch(() => ({} as { key?: string }));
  if (typeof key !== 'string' || !key.startsWith(LEAVE_PREFIX) || key.includes('..')) return c.json({ error: 'Berkas tidak ditemukan' }, 404);

  const db = drizzle(c.env.DB);
  const meId = c.get('user').id;
  const [me] = await db.select().from(employees).where(eq(employees.id, meId)).limit(1);
  if (!me || !me.active) return c.json({ error: 'Sesi berakhir' }, 401);

  const [req] = await db.select({ owner: leave_requests.employee_id }).from(leave_requests).where(eq(leave_requests.attachment_key, key)).limit(1);
  if (!req) return c.json({ error: 'Berkas tidak ditemukan' }, 404);

  // Pemilik, admin, atau atasan langsung pemilik.
  let allowed = req.owner === meId || isAdmin(me.role);
  if (!allowed) {
    const [owner] = await db.select({ manager_id: employees.manager_id }).from(employees).where(eq(employees.id, req.owner)).limit(1);
    allowed = owner?.manager_id === meId;
  }
  if (!allowed) return c.json({ error: 'Berkas tidak ditemukan' }, 404);

  if (req.owner !== meId) {
    await writeAudit(db, { actorId: me.id, actorName: me.name, action: 'file.access', targetType: 'leave_attachment', targetId: key, targetLabel: req.owner, ip: c.req.header('CF-Connecting-IP') });
  }
  const { exp, sig } = await signFileLink(c.env.URL_SIGNING_SECRET, key);
  return c.json({ url: `/api/files/get?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}`, expiresAt: exp });
});

files.get('/get', async (c) => {
  const key = c.req.query('key') ?? '';
  const exp = Number(c.req.query('exp'));
  const sig = c.req.query('sig') ?? '';
  if (!key.startsWith(LEAVE_PREFIX) || !(await verifyFileLink(c.env.URL_SIGNING_SECRET, key, exp, sig))) {
    return c.json({ error: 'Tautan tidak valid atau sudah kedaluwarsa' }, 403);
  }
  const obj = await c.env.STORAGE.get(key);
  if (!obj) return c.json({ error: 'Berkas tidak ditemukan' }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
