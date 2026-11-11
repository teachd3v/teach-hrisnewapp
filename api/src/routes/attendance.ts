import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, between, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { LEAVE_KEYS, assessFace, assessLocation, bestScore, decodeVectors, encodeVectors, isAdmin, isWeekendDate, lateMinutes, normalize, policyFor, validEmbedding, validLatLng, wibDate, type AttendanceFlags, type AttendancePolicy, type FaceResult } from '@hris/shared';
import type { AppEnv } from '../env';
import { attendances, audit_log, employees, holidays, leave_requests } from '../db/schema';
import { auditRow } from '../lib/audit';
import type { Db } from '../lib/leave-db';
import { loadOffices, loadPolicies } from '../lib/attendance-policy';
import { approvedTemplate, loadFaceSettings } from '../lib/face';
import { labelMap, loadLeaveTypes, timeBasedKeys } from '../lib/leave-types';
import { MB, validateUpload } from '../lib/upload';
import { requireAuth } from '../middleware/auth';

/**
 * Presensi. Waktu dan tanggal (WIB) selalu dari server. Lokasi hanya dicatat (jarak ke kantor dihitung server),
 * tidak memblokir. Foto selfie wajib; "wajah terdeteksi" berasal dari perangkat dan bukan verifikasi identitas.
 */
export const attendance = new Hono<AppEnv>();
attendance.use('*', requireAuth);

type Ctx = Context<AppEnv>;
type Row = typeof attendances.$inferSelect;
const PHOTO_MAX = 3 * MB;
export const ATTENDANCE_PREFIX = 'attendance/';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batch = (db: Db, stmts: any[]) => db.batch(stmts as [any, ...any[]]);
const one = async <T>(p: Promise<T[]>) => (await p)[0];

async function actor(c: Ctx, db: Db) {
  const [e] = await db.select().from(employees).where(eq(employees.id, c.get('user').id)).limit(1);
  return e && e.active ? e : null;
}

/** `detail`: sertakan skor mentah (hanya untuk HC; karyawan hanya melihat hasilnya). */
const shape = (r: Row, detail = false) => ({
  id: r.id, employee_id: r.employee_id, date: r.date, clock_in: r.clock_in, clock_out: r.clock_out,
  in: r.clock_in ? {
    lat: r.clock_in_lat, lng: r.clock_in_lng, accuracy: r.clock_in_accuracy, distance: r.clock_in_distance, outside: r.clock_in_outside, face: r.clock_in_face, photo: r.clock_in_photo_key, corrected: r.clock_in_corrected,
    faceResult: r.clock_in_face_result, ...(detail ? { faceScore: r.clock_in_face_score, live: r.clock_in_live } : {}),
  } : null,
  out: r.clock_out ? {
    lat: r.clock_out_lat, lng: r.clock_out_lng, accuracy: r.clock_out_accuracy, distance: r.clock_out_distance, outside: r.clock_out_outside, face: r.clock_out_face, photo: r.clock_out_photo_key, corrected: r.clock_out_corrected,
    faceResult: r.clock_out_face_result, ...(detail ? { faceScore: r.clock_out_face_score, live: r.clock_out_live } : {}),
  } : null,
});

/** Konteks hari untuk pasangan (karyawan, tanggal): izin terlambat disetujui, pengajuan lain yang disetujui, hari libur/akhir pekan. */
async function contexts(db: Db, pairs: { employee_id: string; date: string }[]): Promise<Map<string, Omit<AttendanceFlags, 'lateMinutes'>>> {
  const out = new Map<string, Omit<AttendanceFlags, 'lateMinutes'>>();
  if (!pairs.length) return out;
  const ids = [...new Set(pairs.map((p) => p.employee_id))];
  const dates = pairs.map((p) => p.date).sort();
  const minD = dates[0]!, maxD = dates[dates.length - 1]!;

  const leaves: { employee_id: string; leave_type: string; start_date: string; end_date: string }[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    leaves.push(...await db.select({ employee_id: leave_requests.employee_id, leave_type: leave_requests.leave_type, start_date: leave_requests.start_date, end_date: leave_requests.end_date })
      .from(leave_requests)
      .where(and(eq(leave_requests.status, 'approved'), inArray(leave_requests.employee_id, ids.slice(i, i + 80)), lte(leave_requests.start_date, maxD), gte(leave_requests.end_date, minD))));
  }
  const hol = new Map((await db.select().from(holidays).where(between(holidays.date, minD, maxD))).map((h) => [h.date, h.name]));
  const types = await loadLeaveTypes(db);
  const timeBased = timeBasedKeys(types);
  const labels = labelMap(types);

  for (const p of pairs) {
    const mine = leaves.filter((l) => l.employee_id === p.employee_id && l.start_date <= p.date && l.end_date >= p.date);
    const full = mine.find((l) => !timeBased.has(l.leave_type))?.leave_type;
    out.set(`${p.employee_id}|${p.date}`, {
      lateExcused: mine.some((l) => l.leave_type === LEAVE_KEYS.lateIn),
      leaveType: full ? labels.get(full) ?? full : null,
      dayOff: hol.get(p.date) ?? (isWeekendDate(p.date) ? 'Akhir pekan' : null),
    });
  }
  return out;
}

/** Bentuk respons + penanda. Terlambat dihitung saat dibaca (bukan disimpan), jadi izin yang disetujui kemudian ikut berlaku. */
async function annotate(db: Db, rows: Row[], detail = false) {
  const [ctx, policies] = await Promise.all([contexts(db, rows.map((r) => ({ employee_id: r.employee_id, date: r.date }))), loadPolicies(db)]);
  return rows.map((r) => {
    const c = ctx.get(`${r.employee_id}|${r.date}`)!;
    // Batas jam masuk (aturan yang berlaku pada tanggal itu) hanya berlaku di hari kerja (bukan akhir pekan/libur).
    const flags: AttendanceFlags = { lateMinutes: c.dayOff ? 0 : lateMinutes(r.clock_in, policies), ...c };
    return { ...shape(r, detail), flags };
  });
}

const num = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : null);

attendance.get('/today', async (c) => {
  const db = drizzle(c.env.DB);
  const now = new Date();
  const date = wibDate(now);
  const row = await one(db.select().from(attendances).where(and(eq(attendances.employee_id, c.get('user').id), eq(attendances.date, date))).limit(1));
  const meId = c.get('user').id;
  const [record] = row ? await annotate(db, [row]) : [null];
  const day = (await contexts(db, [{ employee_id: meId, date }])).get(`${meId}|${date}`) ?? null;
  const [policies, offices] = await Promise.all([loadPolicies(db), loadOffices(db)]);
  const policy = policyFor(policies, date);
  // Lokasi kantor aktif ikut dikirim agar layar presensi dapat menampilkan jarak sebelum dikirim (penilaian resmi tetap di server).
  return c.json({
    date, serverTime: now.toISOString(), record, day,
    policy: { workStart: policy.workStart, graceMinutes: policy.graceMinutes, locationMode: policy.locationMode },
    faceMode: (await loadFaceSettings(db)).mode,
    offices: offices.filter((o) => o.active).map((o) => ({ id: o.id, name: o.name, lat: o.lat, lng: o.lng, radiusM: o.radiusM, active: true })),
  });
});

/** Riwayat sendiri per bulan: `?month=YYYY-MM` (default bulan ini WIB). */
attendance.get('/mine', async (c) => {
  const db = drizzle(c.env.DB);
  const month = c.req.query('month') ?? wibDate().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return c.json({ error: 'Bulan tidak valid' }, 400);
  const rows = await db.select().from(attendances)
    .where(and(eq(attendances.employee_id, c.get('user').id), gte(attendances.date, `${month}-01`), lte(attendances.date, `${month}-31`)))
    .orderBy(desc(attendances.date));
  return c.json(await annotate(db, rows));
});

/**
 * Mode 'block': alasan presensi harus ditolak, atau null bila boleh. Lokasi wajib; di luar radius (+ margin akurasi GPS) ditolak,
 * kecuali karyawan punya Dinas Luar Kota yang disetujui pada hari itu. Tanpa lokasi kantor aktif tidak ada yang bisa dinilai, jadi tidak memblokir.
 */
async function blockedReason(db: Db, policy: AttendancePolicy, hasActiveOffice: boolean, employeeId: string, date: string, hasLoc: boolean, assessed: ReturnType<typeof assessLocation>): Promise<string | null> {
  if (policy.locationMode !== 'block' || !hasActiveOffice) return null;
  if (!hasLoc) return 'Lokasi wajib untuk presensi. Aktifkan izin lokasi lalu coba lagi.';
  if (!assessed?.blocked) return null;
  const duty = await one(db.select({ id: leave_requests.id }).from(leave_requests).where(and(
    eq(leave_requests.employee_id, employeeId), eq(leave_requests.status, 'approved'), eq(leave_requests.leave_type, LEAVE_KEYS.duty),
    lte(leave_requests.start_date, date), gte(leave_requests.end_date, date),
  )).limit(1));
  if (duty) return null;
  return `Anda berada ${assessed.distance} m dari ${assessed.office.name} (batas ${assessed.office.radiusM} m). Presensi hanya dapat dilakukan di area kantor. Bila Anda sedang dinas atau lokasi tidak akurat, hubungi HC untuk koreksi presensi.`;
}

async function punch(c: Ctx, type: 'in' | 'out') {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me) return c.json({ error: 'Sesi berakhir' }, 401);

  const declared = Number(c.req.header('Content-Length'));
  if (Number.isFinite(declared) && declared > PHOTO_MAX + 64 * 1024) return c.json({ error: 'Foto terlalu besar (maks. 3 MB)' }, 413);
  const form = await c.req.parseBody().catch(() => null);
  const file = form?.photo;
  if (!(file instanceof File)) return c.json({ error: 'Foto wajib diambil' }, 400);
  const v = await validateUpload(file, { maxBytes: PHOTO_MAX, kinds: ['jpeg', 'png', 'webp'] });
  if (!v.ok) return c.json({ error: v.error }, 400);

  const lat = num(form?.lat);
  const lng = num(form?.lng);
  const hasLoc = lat !== null && lng !== null;
  if (hasLoc && !validLatLng(lat, lng)) return c.json({ error: 'Koordinat tidak valid' }, 400);
  const accuracy = num(form?.accuracy);
  const face = form?.face === '1';
  // Verifikasi wajah: embedding (JSON) dan skor wajah asli dari perangkat. Penilaian resmi di server (template tidak pernah dikirim ke klien).
  let emb: Float32Array | null = null;
  try { const raw: unknown = JSON.parse(typeof form?.embedding === 'string' ? form.embedding : 'null'); if (validEmbedding(raw)) emb = normalize(raw); } catch { /* tanpa embedding */ }
  const liveRaw = num(form?.live);
  const live = liveRaw !== null && liveRaw >= 0 && liveRaw <= 1 ? liveRaw : null;

  const now = new Date();
  const date = wibDate(now);
  const [policies, offices] = await Promise.all([loadPolicies(db), loadOffices(db)]);
  const policy = policyFor(policies, date);
  const assessed = assessLocation(hasLoc ? { lat: lat!, lng: lng! } : null, accuracy, offices);
  const distance = assessed?.distance ?? null;
  const outside = assessed ? assessed.outside : null;
  const today = await one(db.select().from(attendances).where(and(eq(attendances.employee_id, me.id), eq(attendances.date, date))).limit(1));
  if (type === 'in' && today) return c.json({ error: 'Anda sudah presensi masuk hari ini' }, 409);
  if (type === 'out') {
    if (!today?.clock_in) return c.json({ error: 'Anda belum presensi masuk hari ini' }, 409);
    if (today.clock_out) return c.json({ error: 'Anda sudah presensi pulang hari ini' }, 409);
  }

  const locationError = await blockedReason(db, policy, offices.some((o) => o.active), me.id, date, hasLoc, assessed);
  if (locationError) return c.json({ error: locationError }, 403);

  // Mode mati: tidak ada penilaian (kolom null). Mode 'flag': hasil hanya ditandai; presensi tidak pernah ditolak karena wajah.
  const faceSettings = await loadFaceSettings(db);
  let faceResult: FaceResult | null = null;
  let faceScore: number | null = null;
  if (faceSettings.mode !== 'off') {
    const tpl = await approvedTemplate(db, me.id);
    if (tpl && emb) faceScore = bestScore(decodeVectors(tpl.vectors), emb);
    faceResult = assessFace({ hasTemplate: Boolean(tpl), score: faceScore, live: emb ? live : null }, faceSettings);
  }
  const faceVec = faceResult && emb ? encodeVectors([emb]) : null;
  const faceLive = faceResult && emb ? live : null;

  const key = `${ATTENDANCE_PREFIX}${me.id}/${date}/${type}-${crypto.randomUUID()}.${v.ext}`;
  await c.env.STORAGE.put(key, v.buffer, { httpMetadata: { contentType: v.contentType } });
  const iso = now.toISOString();
  const auditStmt = db.insert(audit_log).values(auditRow({
    actorId: me.id, actorName: me.name, action: type === 'in' ? 'attendance.clock_in' : 'attendance.clock_out', targetType: 'attendance', targetId: date,
    ip: c.req.header('CF-Connecting-IP'), details: { distance, accuracy, face, hasLoc, outside, ...(faceResult ? { faceResult, faceScore: faceScore === null ? undefined : Math.round(faceScore * 1000) / 1000, live: faceLive ?? undefined } : {}) },
  }));

  try {
    if (type === 'in') {
      await batch(db, [
        db.insert(attendances).values({
          id: crypto.randomUUID(), employee_id: me.id, date, clock_in: iso, clock_in_lat: lat, clock_in_lng: lng, clock_in_accuracy: accuracy,
          clock_in_distance: distance, clock_in_outside: outside, clock_in_face: face, clock_in_face_score: faceScore, clock_in_face_result: faceResult, clock_in_live: faceLive, clock_in_face_vec: faceVec,
          clock_in_photo_key: key, status: 'hadir', created_at: iso,
        }),
        auditStmt,
      ]);
    } else {
      // Update bersyarat: dua permintaan pulang bersamaan tidak sama-sama lolos.
      const done = await db.update(attendances).set({
        clock_out: iso, clock_out_lat: lat, clock_out_lng: lng, clock_out_accuracy: accuracy, clock_out_distance: distance, clock_out_outside: outside, clock_out_face: face, clock_out_face_score: faceScore, clock_out_face_result: faceResult, clock_out_live: faceLive, clock_out_face_vec: faceVec,
        clock_out_photo_key: key,
      }).where(and(eq(attendances.id, today!.id), isNull(attendances.clock_out))).returning({ id: attendances.id });
      if (!done.length) throw new Error('already');
      await auditStmt;
    }
  } catch (e) {
    await c.env.STORAGE.delete(key).catch(() => {});
    const dup = type === 'in'
      ? await one(db.select({ id: attendances.id }).from(attendances).where(and(eq(attendances.employee_id, me.id), eq(attendances.date, date))).limit(1))
      : (e as Error).message === 'already';
    if (dup) return c.json({ error: type === 'in' ? 'Anda sudah presensi masuk hari ini' : 'Anda sudah presensi pulang hari ini' }, 409);
    throw e;
  }
  return c.json({ ok: true, time: iso, date, distance, face: faceResult });
}

attendance.post('/clock-in', (c) => punch(c, 'in'));
attendance.post('/clock-out', (c) => punch(c, 'out'));

/** HC: presensi semua karyawan aktif pada satu tanggal (`?date=YYYY-MM-DD`, default hari ini WIB). */
attendance.get('/admin', async (c) => {
  const db = drizzle(c.env.DB);
  const me = await actor(c, db);
  if (!me || !isAdmin(me.role)) return c.json({ error: 'Tidak diizinkan' }, 403);
  const date = c.req.query('date') ?? wibDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Tanggal tidak valid' }, 400);

  const [people, rows] = await Promise.all([
    db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.active, true)).orderBy(asc(employees.name)),
    db.select().from(attendances).where(eq(attendances.date, date)),
  ]);
  const annotated = new Map((await annotate(db, rows, true)).map((r) => [r.employee_id, r]));
  return c.json({ date, rows: people.map((p) => ({ employeeId: p.id, name: p.name, record: annotated.get(p.id) ?? null })) });
});
