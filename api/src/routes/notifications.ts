import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { AppEnv } from '../env';
import { notifications } from '../db/schema';
import { requireAuth } from '../middleware/auth';

export const notificationRoutes = new Hono<AppEnv>();
notificationRoutes.use('*', requireAuth);

notificationRoutes.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const me = c.get('user').id;
  const [items, unread] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.employee_id, me)).orderBy(desc(notifications.created_at)).limit(50),
    db.select({ n: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.employee_id, me), isNull(notifications.read_at))),
  ]);
  return c.json({ unread: Number(unread[0]?.n ?? 0), items });
});

notificationRoutes.post('/read-all', async (c) => {
  const db = drizzle(c.env.DB);
  await db.update(notifications).set({ read_at: new Date().toISOString() })
    .where(and(eq(notifications.employee_id, c.get('user').id), isNull(notifications.read_at)));
  return c.json({ ok: true });
});

notificationRoutes.post('/:id/read', async (c) => {
  const db = drizzle(c.env.DB);
  await db.update(notifications).set({ read_at: new Date().toISOString() })
    .where(and(eq(notifications.id, c.req.param('id')), eq(notifications.employee_id, c.get('user').id), isNull(notifications.read_at)));
  return c.json({ ok: true });
});
