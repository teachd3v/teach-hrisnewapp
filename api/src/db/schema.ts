import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

// Semua waktu disimpan sebagai ISO UTC (text). Tanggal kalender: YYYY-MM-DD (WIB).

export const employees = sqliteTable('employees', {
  id: text('id').primaryKey(),
  employee_code: text('employee_code'),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  gender: text('gender'), // 'Laki-laki' | 'Perempuan'
  title: text('title'), // jabatan
  dept: text('dept'),
  level: text('level'),
  employment_status: text('employment_status'),
  join_date: text('join_date'),
  photo_key: text('photo_key'), // kunci objek R2
  role: text('role', { enum: ['employee', 'admin', 'super_admin'] }).notNull().default('employee'),
  // Atasan langsung. Null hanya untuk pucuk pimpinan (cuti langsung ke HC).
  manager_id: text('manager_id'),
  // Pucuk pimpinan: tanpa atasan, pengajuan cuti langsung ke HC. Karyawan lain tanpa atasan tidak boleh mengajukan.
  is_top_leader: integer('is_top_leader', { mode: 'boolean' }).notNull().default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (t) => ({
  emailUnique: uniqueIndex('employees_email_unique').on(t.email),
  managerIdx: index('employees_manager_idx').on(t.manager_id),
}));

export const credentials = sqliteTable('credentials', {
  employee_id: text('employee_id').primaryKey(),
  password_hash: text('password_hash').notNull(), // pbkdf2$iter$salt$hash
  must_change_password: integer('must_change_password', { mode: 'boolean' }).notNull().default(true),
  password_changed_at: text('password_changed_at'),
  failed_attempts: integer('failed_attempts').notNull().default(0),
  locked_until: text('locked_until'),
});

// Refresh token: hanya hash SHA-256 yang disimpan. Dirotasi tiap refresh; semua token satu "family"
// dicabut bila token lama dipakai ulang (indikasi pencurian).
export const refresh_tokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  employee_id: text('employee_id').notNull(),
  family_id: text('family_id').notNull(),
  token_hash: text('token_hash').notNull(),
  device_label: text('device_label'),
  created_at: text('created_at').notNull(),
  expires_at: text('expires_at').notNull(),
  used_at: text('used_at'), // terisi saat dirotasi
  revoked_at: text('revoked_at'),
}, (t) => ({
  hashUnique: uniqueIndex('refresh_tokens_hash_unique').on(t.token_hash),
  employeeIdx: index('refresh_tokens_employee_idx').on(t.employee_id),
  familyIdx: index('refresh_tokens_family_idx').on(t.family_id),
}));

// Log audit append-only (trigger penolak UPDATE/DELETE ada di migrasi manual 0001_audit_triggers.sql).
export const audit_log = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  at: text('at').notNull(),
  actor_id: text('actor_id'),
  actor_name: text('actor_name'),
  action: text('action').notNull(),
  target_type: text('target_type'),
  target_id: text('target_id'),
  target_label: text('target_label'),
  details: text('details'), // JSON
  ip: text('ip'),
}, (t) => ({
  atIdx: index('audit_log_at_idx').on(t.at),
  actionIdx: index('audit_log_action_idx').on(t.action, t.at),
  actorIdx: index('audit_log_actor_idx').on(t.actor_id, t.at),
}));

export const holidays = sqliteTable('holidays', {
  date: text('date').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['NATIONAL', 'JOINT'] }).notNull(),
});

export const leave_quotas = sqliteTable('leave_quotas', {
  employee_id: text('employee_id').notNull(),
  leave_type: text('leave_type').notNull(),
  year: integer('year').notNull(),
  quota: real('quota').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.employee_id, t.leave_type, t.year] }),
}));

export const leave_requests = sqliteTable('leave_requests', {
  id: text('id').primaryKey(),
  employee_id: text('employee_id').notNull(),
  leave_type: text('leave_type').notNull(),
  start_date: text('start_date').notNull(),
  end_date: text('end_date').notNull(),
  start_time: text('start_time'),
  end_time: text('end_time'),
  total_days: real('total_days').notNull(),
  reason: text('reason'),
  attachment_key: text('attachment_key'), // kunci R2
  // pending_manager -> pending_hc -> approved | rejected | cancelled
  status: text('status', {
    enum: ['pending_manager', 'pending_hc', 'approved', 'rejected', 'cancelled'],
  }).notNull(),
  manager_decided_by: text('manager_decided_by'),
  manager_decided_at: text('manager_decided_at'),
  manager_notes: text('manager_notes'),
  hc_decided_by: text('hc_decided_by'),
  hc_decided_at: text('hc_decided_at'),
  hc_notes: text('hc_notes'),
  // Ambil alih HC atas pengajuan yang tertahan di atasan: alasan wajib.
  hc_override: integer('hc_override', { mode: 'boolean' }).notNull().default(false),
  hc_override_reason: text('hc_override_reason'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (t) => ({
  employeeIdx: index('leave_requests_employee_idx').on(t.employee_id, t.start_date),
  statusIdx: index('leave_requests_status_idx').on(t.status),
}));

export const attendances = sqliteTable('attendances', {
  id: text('id').primaryKey(),
  employee_id: text('employee_id').notNull(),
  date: text('date').notNull(), // tanggal WIB
  clock_in: text('clock_in'),
  clock_in_lat: real('clock_in_lat'),
  clock_in_lng: real('clock_in_lng'),
  clock_in_photo_key: text('clock_in_photo_key'),
  clock_out: text('clock_out'),
  clock_out_lat: real('clock_out_lat'),
  clock_out_lng: real('clock_out_lng'),
  clock_out_photo_key: text('clock_out_photo_key'),
  status: text('status'),
  created_at: text('created_at').notNull(),
}, (t) => ({
  employeeDateUnique: uniqueIndex('attendances_employee_date_unique').on(t.employee_id, t.date),
}));

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  employee_id: text('employee_id').notNull(), // penerima
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'), // tanpa alasan cuti (sensitif)
  href: text('href'),
  entity_id: text('entity_id'),
  created_at: text('created_at').notNull(),
  read_at: text('read_at'),
}, (t) => ({
  recipientIdx: index('notifications_recipient_idx').on(t.employee_id, t.created_at),
  entityIdx: index('notifications_entity_idx').on(t.entity_id),
}));

// Token push perangkat: FCM (aplikasi Tauri) atau Web Push (web; web_keys berisi p256dh/auth).
export const push_devices = sqliteTable('push_devices', {
  id: text('id').primaryKey(),
  employee_id: text('employee_id').notNull(),
  kind: text('kind', { enum: ['fcm', 'webpush'] }).notNull(),
  token: text('token').notNull(), // token FCM atau endpoint Web Push
  web_keys: text('web_keys'), // JSON {p256dh, auth}
  created_at: text('created_at').notNull(),
}, (t) => ({
  tokenUnique: uniqueIndex('push_devices_token_unique').on(t.token),
  employeeIdx: index('push_devices_employee_idx').on(t.employee_id),
}));
