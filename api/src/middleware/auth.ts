import { createMiddleware } from 'hono/factory';
import { isAdmin } from '@hris/shared';
import type { AppEnv } from '../env';
import { verifyAccessToken } from '../lib/tokens';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const h = c.req.header('Authorization');
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
  const claims = token ? await verifyAccessToken(c.env.JWT_SECRET, token) : null;
  if (!claims) return c.json({ error: 'Sesi berakhir, silakan masuk lagi' }, 401);
  c.set('user', { id: claims.sub, role: claims.role });
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user || !isAdmin(user.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  await next();
});
