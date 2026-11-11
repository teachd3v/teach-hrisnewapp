import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  FACE_CONSENT_TEXT, FACE_CONSENT_VERSION, FACE_ENROLL_MAX, FACE_ENROLL_MIN, FACE_MODEL_VERSION, FACE_SETTING_KEYS,
  encodeVectors, faceSettingsError, isAdmin, normalize, planFaceDecided, planFaceRequested, validEmbedding,
} from '@hris/shared';
import type { AppEnv } from '../env';
import { app_settings, audit_log, employee_documents, employees, face_templates } from '../db/schema';
import { auditRow } from '../lib/audit';
import { FACE_PREFIX, loadFaceSettings, purgeFace } from '../lib/face';
import { adminRecipientIds, notifyStmts, resolveStmt, type Db } from '../lib/leave-db';
import { pushNotify } from '../lib/push';
import { MB, validateUpload } from '../lib/upload';
import { requireAuth } from '../middleware/auth';

/**
 * Pendaftaran dan persetujuan wajah. Karyawan mendaftar (persetujuan biometrik, vektor dari perangkat, satu foto referensi);
 * HC mencocokkan foto referensi dengan KTP lalu menyetujui. Template tidak pernah dikirim ke klien. Pengaturan oleh super admin.
 */
export const face = new Hono<AppEnv>();
face.use('*', requireAuth);

type Ctx = Context<AppEnv>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batch = (db: Db, stmts: any[]) => db.batch(stmts as [any, ...any[]]);
const one = async <T>(p: Promise<T[]>) => (await p)[0];
const ip = (c: Ctx) => c.req.header('CF-Connecting-IP');
const PHOTO_MAX = 3 * MB;
const NOTE_MAX = 300;

async function actor(c: Ctx, db: Db) {
  const [e] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  return e && e.active ? e : null;
}

const publicTemplate = (r: typeof face_templates.$inferSelect) => ({
  id: r.id, status: r.status, sampleCount: r.sample_count, createdAt: r.created_at, decidedAt: r.decided_at, note: r.status === 'rejected' ? r.decision_note : null,
});

/** Status pendaftaran sendiri + pengaturan (ambang hanya untuk admin) + teks persetujuan. */
face.get('/status', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const [settings, rows] = await Promise.all([
    loadFaceSettings(db),
    db.select().from(face_templates).where(eq(face_templates.employee_id, me.id)).orderBy(desc(face_templates.created_at)),
  ]);
  const approved = rows.find((r) => r.status === 'approved');
  const pending = rows.find((r) => r.status === 'pending');
  // Penolakan terakhir hanya relevan bila lebih baru dari template aktif dan tidak ada pengajuan yang sedang menunggu.
  const rejected = !pending ? rows.find((r) => r.status === 'rejected' && (!approved || r.created_at > approved.created_at)) : undefined;
  return c.json({
    settings: isAdmin(me.role) ? settings : { mode: settings.mode },
    consent: { version: FACE_CONSENT_VERSION, text: FACE_CONSENT_TEXT },
    modelVersion: FACE_MODEL_VERSION,
    active: Boolean(approved),
    approved: approved ? publicTemplate(approved) : null,
    pending: pending ? publicTemplate(pending) : null,
    rejected: rejected ? publicTemplate(rejected) : null,
  });
});

/** Daftar wajah: multipart `photo` (referensi), `vectors` (JSON larik vektor), `stats` (JSON), `consent`='1', `consentVersion`. */
face.post('/enroll', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const declared = Number(c.req.header('Content-Length'));
  if (Number.isFinite(declared) && declared > PHOTO_MAX + 256 * 1024) return c.json({ error: 'Data terlalu besar' }, 413);
  const form = await c.req.parseBody().catch(() => null);
  if (!form) return c.json({ error: 'Data tidak valid' }, 400);

  if (form.consent !== '1' || form.consentVersion !== FACE_CONSENT_VERSION) return c.json({ error: 'Persetujuan penggunaan data wajah diperlukan' }, 400);
  const file = form.photo;
  if (!(file instanceof File)) return c.json({ error: 'Foto referensi wajib diambil' }, 400);
  const v = await validateUpload(file, { maxBytes: PHOTO_MAX, kinds: ['jpeg', 'png', 'webp'] });
  if (!v.ok) return c.json({ error: v.error }, 400);

  let raw: unknown;
  try { raw = JSON.parse(typeof form.vectors === 'string' ? form.vectors : ''); } catch { raw = null; }
  if (!Array.isArray(raw) || raw.length < FACE_ENROLL_MIN || raw.length > FACE_ENROLL_MAX || !raw.every(validEmbedding)) {
    return c.json({ error: `Data wajah tidak valid (butuh ${FACE_ENROLL_MIN}-${FACE_ENROLL_MAX} sampel)` }, 400);
  }
  const vectors = (raw as number[][]).map((x) => normalize(x));
  let stats: string | null = null;
  try {
    const s = JSON.parse(typeof form.stats === 'string' ? form.stats : 'null') as Record<string, unknown> | null;
    if (s && ['lum', 'sharp', 'eyeRatio'].every((k) => typeof s[k] === 'number' && Number.isFinite(s[k] as number))) stats = JSON.stringify({ lum: s.lum, sharp: s.sharp, eyeRatio: s.eyeRatio });
  } catch { /* statistik opsional */ }

  const id = crypto.randomUUID();
  const key = `${FACE_PREFIX}${me.id}/${id}.${v.ext}`;
  await c.env.STORAGE.put(key, v.buffer, { httpMetadata: { contentType: v.contentType } });
  const now = new Date().toISOString();

  // Satu pengajuan menunggu per karyawan: yang lama (belum diputuskan) diganti.
  const oldPending = await db.select({ id: face_templates.id, key: face_templates.reference_photo_key }).from(face_templates)
    .where(and(eq(face_templates.employee_id, me.id), eq(face_templates.status, 'pending')));
  const adminIds = await adminRecipientIds(db);
  const notes = planFaceRequested({ id, employeeId: me.id, employeeName: me.name, adminIds });
  try {
    await batch(db, [
      ...(oldPending.length ? [db.delete(face_templates).where(inArray(face_templates.id, oldPending.map((o) => o.id)))] : []),
      db.insert(face_templates).values({
        id, employee_id: me.id, vectors: encodeVectors(vectors), sample_count: vectors.length, model_version: FACE_MODEL_VERSION, status: 'pending',
        consent_at: now, consent_version: FACE_CONSENT_VERSION, reference_photo_key: key, stats, created_at: now,
      }),
      db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'face.enrolled', targetType: 'face_template', targetId: id, targetLabel: me.name, ip: ip(c), details: { samples: vectors.length, model: FACE_MODEL_VERSION } })),
      ...oldPending.map((o) => resolveStmt(db, o.id)),
      ...notifyStmts(db, notes),
    ]);
  } catch (e) {
    await c.env.STORAGE.delete(key).catch(() => {});
    throw e;
  }
  await Promise.all(oldPending.map((o) => c.env.STORAGE.delete(o.key).catch(() => {})));
  pushNotify(c, notes);
  return c.json({ id }, 201);
});

/** Tarik persetujuan: hapus semua template dan foto referensi sendiri. */
face.delete('/me', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);
  const removed = await purgeFace(c.env.STORAGE, db, me.id);
  if (!removed.length) return c.json({ ok: true, removed: 0 });
  await batch(db, [
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'face.withdrawn', targetType: 'face_template', targetId: me.id, targetLabel: me.name, ip: ip(c), details: { removed: removed.length } })),
    ...removed.map((id) => resolveStmt(db, id)),
  ]);
  return c.json({ ok: true, removed: removed.length });
});

// ------------------------------------------------------------------ HC

/** HC: antrean pendaftaran (dengan foto referensi dan KTP terbaru untuk dicocokkan) dan daftar yang sudah aktif. */
face.get('/admin', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const rows = await db.select().from(face_templates).where(inArray(face_templates.status, ['pending', 'approved'])).orderBy(asc(face_templates.created_at));
  const ids = [...new Set(rows.map((r) => r.employee_id))];
  const names = new Map<string, string>();
  const ktp = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    for (const e of await db.select({ id: employees.id, name: employees.name }).from(employees).where(inArray(employees.id, chunk))) names.set(e.id, e.name);
    const docs = await db.select({ employee_id: employee_documents.employee_id, key: employee_documents.file_key }).from(employee_documents)
      .where(and(inArray(employee_documents.employee_id, chunk), eq(employee_documents.category, 'ktp'))).orderBy(desc(employee_documents.created_at));
    for (const d of docs) if (!ktp.has(d.employee_id)) ktp.set(d.employee_id, d.key);
  }
  const active = (await db.select({ id: employees.id }).from(employees).where(eq(employees.active, true))).length;
  const approved = rows.filter((r) => r.status === 'approved');
  return c.json({
    settings: await loadFaceSettings(db),
    coverage: { enrolled: new Set(approved.map((r) => r.employee_id)).size, active },
    pending: rows.filter((r) => r.status === 'pending').map((r) => ({
      ...publicTemplate(r), employeeId: r.employee_id, name: names.get(r.employee_id) ?? '-', photoKey: r.reference_photo_key, ktpKey: ktp.get(r.employee_id) ?? null, replacing: approved.some((a) => a.employee_id === r.employee_id),
    })),
    approved: approved.map((r) => ({ ...publicTemplate(r), employeeId: r.employee_id, name: names.get(r.employee_id) ?? '-' })),
  });
});

/** HC memutuskan pendaftaran. Tidak boleh memutuskan pendaftaran sendiri kecuali super admin. Persetujuan menggantikan template lama. */
face.post('/:id/decision', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json<{ approve?: unknown; note?: unknown }>().catch(() => ({} as never));
  if (typeof b.approve !== 'boolean') return c.json({ error: 'Keputusan tidak valid' }, 400);
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, NOTE_MAX) : '';
  if (!b.approve && !note) return c.json({ error: 'Tulis alasan penolakan agar karyawan tahu apa yang perlu diperbaiki' }, 400);

  const row = await one(db.select().from(face_templates).where(eq(face_templates.id, id)).limit(1));
  if (!row) return c.json({ error: 'Pendaftaran tidak ditemukan' }, 404);
  if (row.status !== 'pending') return c.json({ error: 'Pendaftaran ini sudah diputuskan' }, 409);
  if (row.employee_id === me.id && me.role !== 'super_admin') return c.json({ error: 'Anda tidak dapat menyetujui pendaftaran wajah sendiri' }, 403);
  const owner = await one(db.select({ name: employees.name, active: employees.active }).from(employees).where(eq(employees.id, row.employee_id)).limit(1));
  if (!owner?.active) return c.json({ error: 'Karyawan tidak aktif' }, 409);

  const now = new Date().toISOString();
  const claimed = await db.update(face_templates).set({ status: b.approve ? 'approved' : 'rejected', decided_by: me.id, decided_at: now, decision_note: note || null })
    .where(and(eq(face_templates.id, id), eq(face_templates.status, 'pending'))).returning({ id: face_templates.id });
  if (!claimed.length) return c.json({ error: 'Pendaftaran ini sudah diputuskan' }, 409);

  // Template aktif lama (bila ada) digantikan: baris dan foto referensinya dihapus.
  const replaced = b.approve
    ? await db.select({ id: face_templates.id, key: face_templates.reference_photo_key }).from(face_templates).where(and(eq(face_templates.employee_id, row.employee_id), eq(face_templates.status, 'approved')))
    : [];
  const old = replaced.filter((r) => r.id !== id);
  const decided = planFaceDecided({ id, employeeId: row.employee_id, approved: b.approve });
  try {
    await batch(db, [
      ...(old.length ? [db.delete(face_templates).where(inArray(face_templates.id, old.map((o) => o.id)))] : []),
      db.insert(audit_log).values(auditRow({
        actorId: me.id, actorName: me.name, action: 'face.decision', targetType: 'face_template', targetId: id, targetLabel: owner.name, ip: ip(c),
        details: { decision: b.approve ? 'setuju' : 'tolak', note: note || undefined, replaced: old.length || undefined },
      })),
      resolveStmt(db, id, { exceptEmployeeId: row.employee_id }),
      ...notifyStmts(db, decided),
    ]);
  } catch (e) {
    await db.update(face_templates).set({ status: 'pending', decided_by: null, decided_at: null, decision_note: null }).where(eq(face_templates.id, id));
    console.error('keputusan wajah gagal diterapkan', e);
    return c.json({ error: 'Gagal menyimpan keputusan. Coba lagi.' }, 409);
  }
  await Promise.all(old.map((o) => c.env.STORAGE.delete(o.key).catch(() => {})));
  if (!b.approve) await c.env.STORAGE.delete(row.reference_photo_key).catch(() => {}); // foto ditolak tidak perlu disimpan
  pushNotify(c, decided);
  return c.json({ ok: true });
});

/** HC: reset (hapus semua template dan foto referensi) seorang karyawan. */
face.delete('/employee/:employeeId', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const employeeId = c.req.param('employeeId');
  const owner = await one(db.select({ name: employees.name }).from(employees).where(eq(employees.id, employeeId)).limit(1));
  if (!owner) return c.json({ error: 'Karyawan tidak ditemukan' }, 404);
  const removed = await purgeFace(c.env.STORAGE, db, employeeId);
  if (!removed.length) return c.json({ ok: true, removed: 0 });
  await batch(db, [
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'face.reset', targetType: 'face_template', targetId: employeeId, targetLabel: owner.name, ip: ip(c), details: { removed: removed.length } })),
    ...removed.map((id) => resolveStmt(db, id)),
  ]);
  return c.json({ ok: true, removed: removed.length });
});

/** Pengaturan verifikasi wajah: hanya super admin. */
face.put('/settings', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || me.role !== 'super_admin') return c.json({ error: 'Hanya super admin yang dapat mengubah pengaturan verifikasi wajah' }, 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const err = faceSettingsError(b);
  if (err) return c.json({ error: err }, 400);
  const before = await loadFaceSettings(db);
  const after = { mode: b.mode as 'off' | 'flag', threshold: b.threshold as number, liveThreshold: b.liveThreshold as number };
  const now = new Date().toISOString();
  const put = (key: string, value: string) => db.insert(app_settings).values({ key, value, updated_by: me.id, updated_at: now })
    .onConflictDoUpdate({ target: app_settings.key, set: { value, updated_by: me.id, updated_at: now } });
  await batch(db, [
    put(FACE_SETTING_KEYS.mode, after.mode), put(FACE_SETTING_KEYS.threshold, String(after.threshold)), put(FACE_SETTING_KEYS.liveThreshold, String(after.liveThreshold)),
    db.insert(audit_log).values(auditRow({ actorId: me.id, actorName: me.name, action: 'setting.changed', targetType: 'setting', targetId: 'face', targetLabel: 'Verifikasi wajah presensi', ip: ip(c), details: { before, after } })),
  ]);
  return c.json({ ok: true, ...after });
});
