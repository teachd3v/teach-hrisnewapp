// Pengingat terjadwal. `planReminders` menentukan siapa yang berhak menerima (murni baca); `runReminders` mengklaim lalu mengirim.
// Prinsip: hanya hari kerja; sekali per orang per jenis per hari (reminder_log); hanya yang punya perangkat push dan pengingatnya aktif.
import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import {
  LEAVE_KEYS, NUDGE_AFTER_HOURS, NUDGE_FROM_SECONDS, NUDGE_UNTIL_SECONDS,
  REMIND_OUT_AFTER_HOURS, REMIND_OUT_UNTIL_SECONDS, isWeekendDate, policyFor, remindInWindow, wibDate, wibSecondsOfDay, type ReminderKind,
} from '@hris/shared';
import type { Bindings } from '../env';
import { attendance_corrections, attendances, employees, holidays, leave_requests, push_devices, reminder_log } from '../db/schema';
import { loadPolicies } from './attendance-policy';
import type { Db } from './leave-db';
import { loadLeaveTypes, timeBasedKeys } from './leave-types';
import { sendPushToEmployees, vapidConfig, type PushMessage } from './push';

/** Penerima per panggilan: menjaga jumlah permintaan keluar (push) di bawah batas Workers; sisanya dikirim pada panggilan berikutnya. */
const BATCH = 20;

export interface Recipient { employeeId: string; message: PushMessage }
export interface Plan { kind: ReminderKind; recipients: Recipient[] }

export async function planReminders(db: Db, now: Date): Promise<Plan[]> {
  const today = wibDate(now);
  const sod = wibSecondsOfDay(now.toISOString());
  if (isWeekendDate(today)) return [];
  if ((await db.select({ d: holidays.date }).from(holidays).where(eq(holidays.date, today)).limit(1)).length) return [];

  const [emps, devs, leaves] = await Promise.all([
    db.select({ id: employees.id, role: employees.role, manager_id: employees.manager_id, join_date: employees.join_date })
      .from(employees).where(and(eq(employees.active, true), eq(employees.reminders_enabled, true))),
    db.selectDistinct({ id: push_devices.employee_id }).from(push_devices).where(eq(push_devices.kind, 'webpush')),
    db.select({ employee_id: leave_requests.employee_id, leave_type: leave_requests.leave_type }).from(leave_requests)
      .where(and(eq(leave_requests.status, 'approved'), lte(leave_requests.start_date, today), gte(leave_requests.end_date, today))),
  ]);
  const TIME_BASED = timeBasedKeys(await loadLeaveTypes(db));
  const hasDevice = new Set(devs.map((d) => d.id));
  const eligible = emps.filter((e) => hasDevice.has(e.id));
  const leaveOf = (type: (t: string) => boolean) => new Set(leaves.filter((l) => type(l.leave_type)).map((l) => l.employee_id));
  const plans: Plan[] = [];

  // 1. Belum presensi masuk, menjelang batas jam masuk (mengikuti aturan presensi yang berlaku hari ini).
  const policy = policyFor(await loadPolicies(db), today);
  const inWindow = remindInWindow(policy);
  if (sod >= inWindow.from && sod < inWindow.until) {
    const present = new Set((await db.select({ id: attendances.employee_id }).from(attendances).where(eq(attendances.date, today))).map((r) => r.id));
    const offDay = leaveOf((t) => !TIME_BASED.has(t)); // cuti/sakit/dinas sehari penuh yang disetujui
    const excused = leaveOf((t) => t === LEAVE_KEYS.lateIn);
    plans.push({
      kind: 'att_in',
      recipients: eligible.filter((e) => (!e.join_date || e.join_date <= today) && !present.has(e.id) && !offDay.has(e.id) && !excused.has(e.id))
        .map((e) => ({ employeeId: e.id, message: { title: 'Belum presensi masuk', body: `Batas presensi masuk pukul ${policy.workStart}. Ketuk untuk presensi sekarang.`, href: '/presensi', tag: 'reminder:att_in' } })),
    });
  }

  // 2. Sudah sekian jam sejak masuk, belum presensi pulang.
  if (sod < REMIND_OUT_UNTIL_SECONDS) {
    const open = await db.select({ id: attendances.employee_id, clock_in: attendances.clock_in }).from(attendances)
      .where(and(eq(attendances.date, today), isNotNull(attendances.clock_in), isNull(attendances.clock_out)));
    const early = leaveOf((t) => t === LEAVE_KEYS.earlyOut);
    const ok = new Set(eligible.map((e) => e.id));
    plans.push({
      kind: 'att_out',
      recipients: open.filter((r) => ok.has(r.id) && !early.has(r.id) && now.getTime() >= new Date(r.clock_in!).getTime() + REMIND_OUT_AFTER_HOURS * 3_600_000)
        .map((r) => ({ employeeId: r.id, message: { title: `Sudah ${REMIND_OUT_AFTER_HOURS} jam sejak presensi masuk`, body: 'Jangan lupa presensi pulang sebelum meninggalkan kantor.', href: '/presensi', tag: 'reminder:att_out' } })),
    });
  }

  // 3. Pengajuan yang menunggu lebih dari 24 jam: satu ringkasan per penerima.
  if (sod >= NUDGE_FROM_SECONDS && sod < NUDGE_UNTIL_SECONDS) {
    const cutoff = new Date(now.getTime() - NUDGE_AFTER_HOURS * 3_600_000).toISOString();
    const [pm, ph, pc] = await Promise.all([
      db.select({ owner: leave_requests.employee_id }).from(leave_requests).where(and(eq(leave_requests.status, 'pending_manager'), lte(leave_requests.created_at, cutoff))),
      db.select({ owner: leave_requests.employee_id }).from(leave_requests).where(and(eq(leave_requests.status, 'pending_hc'), lte(sql`coalesce(${leave_requests.manager_decided_at}, ${leave_requests.created_at})`, cutoff))),
      db.select({ owner: attendance_corrections.employee_id }).from(attendance_corrections).where(and(eq(attendance_corrections.status, 'pending'), lte(attendance_corrections.created_at, cutoff))),
    ]);
    const managerOf = new Map(emps.map((e) => [e.id, e.manager_id]));
    // Pemilik pengajuan yang tidak ada di `emps` (nonaktif/pengingat dimatikan) tetap harus dihitung ke atasannya: ambil atasan dari semua karyawan.
    const allManagers = new Map((await db.select({ id: employees.id, manager_id: employees.manager_id }).from(employees)).map((e) => [e.id, e.manager_id]));
    const asManager = new Map<string, number>();
    for (const r of pm) { const m = allManagers.get(r.owner) ?? managerOf.get(r.owner); if (m) asManager.set(m, (asManager.get(m) ?? 0) + 1); }

    const recipients: Recipient[] = [];
    for (const e of eligible) {
      const n1 = asManager.get(e.id) ?? 0;
      const isAdmin = e.role === 'admin' || e.role === 'super_admin';
      const n2 = isAdmin ? ph.filter((r) => r.owner !== e.id).length : 0;
      const n3 = isAdmin ? pc.filter((r) => r.owner !== e.id).length : 0;
      if (n1 + n2 + n3 === 0) continue;
      const parts = [n1 && `${n1} cuti bawahan`, n2 && `${n2} cuti menunggu HC`, n3 && `${n3} koreksi presensi`].filter(Boolean);
      recipients.push({
        employeeId: e.id,
        message: { title: 'Pengajuan menunggu persetujuan Anda', body: `${parts.join(', ')} sudah menunggu lebih dari ${NUDGE_AFTER_HOURS} jam.`, href: n1 ? '/persetujuan' : n2 ? '/admin/cuti' : '/admin/koreksi-presensi', tag: 'reminder:approvals' },
      });
    }
    plans.push({ kind: 'approvals', recipients });
  }
  return plans;
}

export interface RunResult { date: string; more: boolean; kinds: Record<string, { eligible: number; pending: number; claimed: number; sent: number; recipients?: string[]; preview?: Record<string, { title: string; body?: string | null; href?: string | null }> }> }

/** `dry`: hanya laporkan penerima (tidak mengklaim, tidak mengirim). Tanpa kunci VAPID tidak ada yang dikirim dan tidak ada yang diklaim. */
export async function runReminders(db: Db, env: Bindings, now: Date, opts: { dry?: boolean } = {}): Promise<RunResult> {
  const today = wibDate(now);
  const plans = await planReminders(db, now);
  const vapid = vapidConfig(env);
  const res: RunResult = { date: today, more: false, kinds: {} };
  let budget = BATCH;

  for (const plan of plans) {
    const done = new Set((await db.select({ id: reminder_log.employee_id }).from(reminder_log).where(and(eq(reminder_log.kind, plan.kind), eq(reminder_log.date, today)))).map((r) => r.id));
    const todo = plan.recipients.filter((r) => !done.has(r.employeeId));
    const entry = { eligible: plan.recipients.length, pending: todo.length, claimed: 0, sent: 0 } as RunResult['kinds'][string];
    res.kinds[plan.kind] = entry;
    if (opts.dry) { entry.recipients = todo.map((r) => r.employeeId); entry.preview = Object.fromEntries(todo.map((r) => [r.employeeId, { title: r.message.title, body: r.message.body, href: r.message.href }])); continue; }
    if (!vapid || budget <= 0) { if (todo.length) res.more = res.more || Boolean(vapid); continue; }

    const batch = todo.slice(0, budget);
    budget -= batch.length;
    if (todo.length > batch.length) res.more = true;

    // Klaim dulu (unik per jenis+tanggal+orang), kirim hanya untuk yang berhasil diklaim.
    const claimed: Recipient[] = [];
    for (let i = 0; i < batch.length; i += 10) {
      const chunk = batch.slice(i, i + 10);
      const got = await db.insert(reminder_log).values(chunk.map((r) => ({ id: crypto.randomUUID(), kind: plan.kind, date: today, employee_id: r.employeeId, created_at: now.toISOString() })))
        .onConflictDoNothing().returning({ id: reminder_log.employee_id });
      const ok = new Set(got.map((g) => g.id));
      claimed.push(...chunk.filter((r) => ok.has(r.employeeId)));
    }
    entry.claimed = claimed.length;
    if (!claimed.length) continue;
    const msg = new Map(claimed.map((r) => [r.employeeId, r.message]));
    entry.sent = await sendPushToEmployees(env, claimed.map((r) => r.employeeId), (id) => (msg.get(id) ? [msg.get(id)!] : []), vapid);
  }
  return res;
}

/** Denyut cron: satu baris per hari yang diperbarui tiap panggilan sah. Cek: `select created_at from reminder_log where kind='heartbeat' order by date desc limit 1`. */
export async function heartbeat(db: Db, at: Date) {
  await db.insert(reminder_log).values({ id: crypto.randomUUID(), kind: 'heartbeat', date: wibDate(at), employee_id: 'cron', created_at: at.toISOString() })
    .onConflictDoUpdate({ target: [reminder_log.kind, reminder_log.date, reminder_log.employee_id], set: { created_at: at.toISOString() } });
}

/** Bersihkan log pengingat lama (> 30 hari) agar tabel tidak terus membesar. */
export async function pruneReminderLog(db: Db, now: Date) {
  const cutoff = wibDate(new Date(now.getTime() - 30 * 86_400_000));
  await db.delete(reminder_log).where(and(sql`${reminder_log.date} < ${cutoff}`, inArray(reminder_log.kind, ['att_in', 'att_out', 'approvals', 'heartbeat'])));
}
