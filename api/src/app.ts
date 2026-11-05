import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './env';
import { auth } from './routes/auth';
import { leave } from './routes/leave';
import { files } from './routes/files';
import { admin } from './routes/admin';
import { master } from './routes/master';
import { notificationRoutes } from './routes/notifications';

// Origin aplikasi Tauri (Android: http(s)://tauri.localhost, iOS/macOS: tauri://localhost)
const TAURI_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];

export const app = new Hono<AppEnv>().basePath('/api');

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const allowed = [c.env.WEB_ORIGIN, 'http://localhost:5173', ...TAURI_ORIGINS];
      return allowed.includes(origin) ? origin : null;
    },
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  }),
);

app.get('/health', (c) => c.json({ ok: true }));
app.route('/auth', auth);
app.route('/leave', leave);
app.route('/files', files);
app.route('/admin', admin);
app.route('/master', master);
app.route('/notifications', notificationRoutes);

app.notFound((c) => c.json({ error: 'Tidak ditemukan' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Terjadi kesalahan pada server' }, 500);
});
