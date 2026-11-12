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
  department_id: text('department_id'),
  level_id: text('level_id'),
  employment_status_id: text('employment_status_id'),
  join_date: text('join_date'),
  photo_key: text('photo_key'), // kunci objek R2 (foto profil; terlihat oleh semua pengguna login)
  // Data personal (Profil saya). Hanya pemilik, HC, dan super admin yang melihat; definisi dan validasi di shared/src/profile.ts.
  nik: text('nik'),
  birth_place: text('birth_place'),
  birth_date: text('birth_date'),
  nationality: text('nationality'),
  marital_status: text('marital_status'),
  religion: text('religion'),
  blood_type: text('blood_type'),
  address: text('address'),
  city: text('city'),
  province: text('province'),
  postal_code: text('postal_code'),
  ktp_address: text('ktp_address'),
  bank_name: text('bank_name'),
  bank_account_no: text('bank_account_no'),
  bank_account_name: text('bank_account_name'),
  profile_consented_at: text('profile_consented_at'), // keterangan penggunaan data sudah dibaca
  role: text('role', { enum: ['employee', 'admin', 'super_admin'] }).notNull().default('employee'),
  // Atasan langsung. Null hanya untuk pucuk pimpinan (cuti langsung ke HC).
  manager_id: text('manager_id'),
  // Pucuk pimpinan: tanpa atasan, pengajuan cuti langsung ke HC. Karyawan lain tanpa atasan tidak boleh mengajukan.
  is_top_leader: integer('is_top_leader', { mode: 'boolean' }).notNull().default(false),
  // Pengingat harian (belum presensi, pengajuan menunggu). Notifikasi keputusan/pengajuan tidak terpengaruh.
  reminders_enabled: integer('reminders_enabled', { mode: 'boolean' }).notNull().default(true),
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
  attachment_key: text('attachment_key'), // kunci R2; satu berkas hanya untuk satu pengajuan
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
  attachmentUnique: uniqueIndex('leave_requests_attachment_unique').on(t.attachment_key),
}));

// Pengajuan overtime (Lembur / Kerja di Hari Libur). Alur sama dengan cuti: atasan langsung -> HC. Yang disetujui HC mengisi kuota Ganti Hari
// otomatis (kredit dihitung saat saldo dibaca; lihat shared/src/overtime.ts). `cancelled` + `revoked_*` = dicabut HC setelah disetujui.
export const overtime_requests = sqliteTable('overtime_requests', {
  id: text('id').primaryKey(),
  employee_id: text('employee_id').notNull(),
  kind: text('kind', { enum: ['lembur', 'hari_libur'] }).notNull(),
  date: text('date').notNull(), // tanggal WIB
  start_time: text('start_time').notNull(), // HH:MM
  end_time: text('end_time').notNull(),
  minutes: integer('minutes').notNull(),
  reason: text('reason'),
  status: text('status', { enum: ['pending_manager', 'pending_hc', 'approved', 'rejected', 'cancelled'] }).notNull(),
  manager_decided_by: text('manager_decided_by'),
  manager_decided_at: text('manager_decided_at'),
  manager_notes: text('manager_notes'),
  hc_decided_by: text('hc_decided_by'),
  hc_decided_at: text('hc_decided_at'),
  hc_notes: text('hc_notes'),
  hc_override: integer('hc_override', { mode: 'boolean' }).notNull().default(false),
  hc_override_reason: text('hc_override_reason'),
  revoked_by: text('revoked_by'),
  revoked_at: text('revoked_at'),
  revoke_reason: text('revoke_reason'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (t) => ({
  employeeDateIdx: index('overtime_requests_employee_date_idx').on(t.employee_id, t.date),
  statusIdx: index('overtime_requests_status_idx').on(t.status),
}));

export const attendances = sqliteTable('attendances', {
  id: text('id').primaryKey(),
  employee_id: text('employee_id').notNull(),
  date: text('date').notNull(), // tanggal WIB
  clock_in: text('clock_in'),
  clock_in_lat: real('clock_in_lat'),
  clock_in_lng: real('clock_in_lng'),
  clock_in_accuracy: real('clock_in_accuracy'), // meter (perkiraan perangkat)
  clock_in_distance: integer('clock_in_distance'), // meter ke lokasi kantor aktif terdekat, dihitung server
  clock_in_outside: integer('clock_in_outside', { mode: 'boolean' }), // snapshot: di luar radius saat presensi; null = tanpa lokasi/koreksi
  clock_in_face: integer('clock_in_face', { mode: 'boolean' }), // wajah terdeteksi di perangkat (bukan verifikasi identitas)
  // Verifikasi wajah (docs/FACE.md): snapshot saat presensi; null/'none' = tidak dinilai (mode mati, belum terdaftar, atau perangkat tidak mengirim embedding).
  clock_in_face_score: real('clock_in_face_score'), // kemiripan kosinus ke template
  clock_in_face_result: text('clock_in_face_result', { enum: ['match', 'mismatch', 'spoof', 'none'] }),
  clock_in_live: real('clock_in_live'), // skor wajah asli (liveness pasif) dari perangkat
  clock_in_face_vec: text('clock_in_face_vec'), // embedding (base64 float32) agar bisa diverifikasi ulang secara sampling
  clock_in_corrected: integer('clock_in_corrected', { mode: 'boolean' }).notNull().default(false), // diisi lewat koreksi HC (tanpa foto/lokasi)
  clock_in_photo_key: text('clock_in_photo_key'),
  clock_out: text('clock_out'),
  clock_out_lat: real('clock_out_lat'),
  clock_out_lng: real('clock_out_lng'),
  clock_out_accuracy: real('clock_out_accuracy'),
  clock_out_distance: integer('clock_out_distance'),
  clock_out_outside: integer('clock_out_outside', { mode: 'boolean' }),
  clock_out_face: integer('clock_out_face', { mode: 'boolean' }),
  clock_out_face_score: real('clock_out_face_score'),
  clock_out_face_result: text('clock_out_face_result', { enum: ['match', 'mismatch', 'spoof', 'none'] }),
  clock_out_live: real('clock_out_live'),
  clock_out_face_vec: text('clock_out_face_vec'),
  clock_out_corrected: integer('clock_out_corrected', { mode: 'boolean' }).notNull().default(false),
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

// Data master pilihan dropdown (departemen, level, status kepegawaian). Dikelola super admin.
// Karyawan menyimpan id-nya, jadi mengganti nama berlaku ke semua karyawan. Item yang dipakai tidak dihapus, hanya dinonaktifkan.
export const MASTER_KINDS = ['department', 'level', 'employment_status'] as const;
export const master_options = sqliteTable('master_options', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: MASTER_KINDS }).notNull(),
  name: text('name').notNull(),
  sort_order: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at').notNull(),
}, (t) => ({
  kindIdx: index('master_options_kind_idx').on(t.kind, t.sort_order),
}));

// Pengajuan koreksi presensi (lupa masuk/pulang). Karyawan mengajukan, HC memutuskan; hasilnya menulis ke attendances.
// 'both': tidak ada presensi di tanggal itu (masuk dan pulang diisi). 'out_only': ada masuk, pulang kosong. Jenis ditentukan server dari keadaan data.
export const attendance_corrections = sqliteTable('attendance_corrections', {
  id: text('id').primaryKey(),
  employee_id: text('employee_id').notNull(),
  date: text('date').notNull(), // tanggal WIB yang dikoreksi
  kind: text('kind', { enum: ['both', 'out_only'] }).notNull(),
  clock_in_time: text('clock_in_time'), // HH:MM WIB (hanya untuk 'both')
  clock_out_time: text('clock_out_time').notNull(), // HH:MM WIB
  reason: text('reason').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'cancelled'] }).notNull(),
  decided_by: text('decided_by'),
  decided_at: text('decided_at'),
  decision_notes: text('decision_notes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (t) => ({
  employeeIdx: index('attendance_corrections_employee_idx').on(t.employee_id, t.date),
  statusIdx: index('attendance_corrections_status_idx').on(t.status),
}));

// Jenis cuti yang dapat diajukan karyawan, dikelola super admin (Data master > Cuti). `key` = pengenal tetap yang disimpan di
// leave_requests.leave_type dan leave_quotas.leave_type (jenis bawaan memakai nama lama, jenis baru memakai UUID); `label` dapat diubah.
export const leave_types = sqliteTable('leave_types', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  description: text('description').notNull().default(''),
  default_quota: real('default_quota'), // hari per tahun; null = tanpa batas
  requires_attachment: integer('requires_attachment', { mode: 'boolean' }).notNull().default(false),
  time_based: integer('time_based', { mode: 'boolean' }).notNull().default(false), // izin per jam; tidak dapat diubah setelah dibuat
  gender: text('gender', { enum: ['Laki-laki', 'Perempuan'] }), // null = semua
  allowed_status_ids: text('allowed_status_ids'), // JSON array id master status kepegawaian yang boleh mengajukan; null = semua status
  sort_order: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  system: integer('system', { mode: 'boolean' }).notNull().default(false), // bawaan sistem: tidak dapat dihapus
  created_at: text('created_at').notNull(),
});

// Daftar berulang di Profil saya (keluarga, kontak darurat, pendidikan, skill, pengalaman, prestasi, dst.). `section` = kunci bagian di
// shared/src/profile.ts; `data` = JSON yang divalidasi server menurut definisi bagian itu.
export const profile_entries = sqliteTable('profile_entries', {
  id: text('id').primaryKey(),
  employee_id: text('employee_id').notNull(),
  section: text('section').notNull(),
  data: text('data').notNull(),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (t) => ({
  employeeSectionIdx: index('profile_entries_employee_section_idx').on(t.employee_id, t.section),
}));

// Dokumen karyawan (KTP, KK, ijazah, kontrak, ...). Berkas di R2 `employee_documents/{employee_id}/...`, hanya dibuka lewat tautan bertanda tangan
// oleh pemilik dan admin (akses admin ke dokumen orang lain tercatat di audit). Kategori hcOnly (kontrak, SK) hanya dapat diunggah HC.
export const employee_documents = sqliteTable('employee_documents', {
  id: text('id').primaryKey(),
  employee_id: text('employee_id').notNull(),
  category: text('category').notNull(), // kunci di shared/src/profile.ts (DOCUMENT_CATEGORIES)
  title: text('title').notNull(),
  file_key: text('file_key').notNull(),
  content_type: text('content_type').notNull(),
  size_bytes: integer('size_bytes').notNull(),
  uploaded_by: text('uploaded_by').notNull(),
  created_at: text('created_at').notNull(),
}, (t) => ({
  employeeIdx: index('employee_documents_employee_idx').on(t.employee_id, t.created_at),
  keyUnique: uniqueIndex('employee_documents_key_unique').on(t.file_key),
}));

// Template wajah untuk verifikasi presensi (docs/FACE.md). `vectors` = sampel embedding (base64 float32, shared/src/face.ts), tidak pernah dikirim ke klien.
// Satu template 'approved' aktif per karyawan; pendaftaran ulang berstatus 'pending' sampai HC menyetujui (lalu menggantikan yang lama).
// Foto referensi di R2 `face_reference/{employee_id}/...` untuk dicocokkan HC dengan KTP; dihapus bersama template.
export const face_templates = sqliteTable('face_templates', {
  id: text('id').primaryKey(),
  employee_id: text('employee_id').notNull(),
  vectors: text('vectors').notNull(),
  sample_count: integer('sample_count').notNull(),
  model_version: text('model_version').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull(),
  consent_at: text('consent_at').notNull(),
  consent_version: text('consent_version').notNull(),
  reference_photo_key: text('reference_photo_key').notNull(),
  stats: text('stats'), // JSON {lum, sharp, eyeRatio} keadaan saat pendaftaran (untuk analisis)
  created_at: text('created_at').notNull(),
  decided_by: text('decided_by'),
  decided_at: text('decided_at'),
  decision_note: text('decision_note'),
}, (t) => ({
  employeeIdx: index('face_templates_employee_idx').on(t.employee_id, t.status),
}));

// Percobaan verifikasi wajah sebelum presensi dikirim (POST /api/face/verify). Dipakai membatasi percobaan berulang dan agar HC melihat
// berapa kali karyawan gagal sebelum berhasil. Hanya hasil (tanpa skor, tanpa embedding).
export const face_attempts = sqliteTable('face_attempts', {
  id: text('id').primaryKey(),
  employee_id: text('employee_id').notNull(),
  date: text('date').notNull(), // tanggal WIB
  type: text('type', { enum: ['in', 'out'] }).notNull(),
  result: text('result', { enum: ['match', 'mismatch', 'spoof'] }).notNull(),
  created_at: text('created_at').notNull(),
}, (t) => ({
  recentIdx: index('face_attempts_recent_idx').on(t.employee_id, t.created_at),
  dayIdx: index('face_attempts_day_idx').on(t.date, t.employee_id),
}));

// Lokasi kantor untuk geofence presensi (Pengaturan presensi, super admin). Presensi dinilai terhadap lokasi aktif terdekat.
export const office_locations = sqliteTable('office_locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  radius_m: integer('radius_m').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at').notNull(),
});

// Aturan presensi yang berlaku mulai tanggal tertentu (WIB). Aturan untuk sebuah tanggal = yang `effective_from`-nya terbaru dan <= tanggal itu,
// jadi perubahan tidak menulis ulang riwayat. Mode lokasi: 'flag' = hanya ditandai, 'block' = presensi di luar radius ditolak.
export const attendance_policies = sqliteTable('attendance_policies', {
  id: text('id').primaryKey(),
  effective_from: text('effective_from').notNull(), // YYYY-MM-DD
  work_start: text('work_start').notNull().default('09:00'), // HH:MM WIB
  grace_minutes: integer('grace_minutes').notNull().default(0),
  location_mode: text('location_mode', { enum: ['flag', 'block'] }).notNull().default('flag'),
  created_by: text('created_by'),
  created_at: text('created_at').notNull(),
}, (t) => ({
  effectiveUnique: uniqueIndex('attendance_policies_effective_unique').on(t.effective_from),
}));

// Pengaturan aplikasi (kunci-nilai) yang diubah super admin, mis. kebijakan cuti bersama. Nilai berupa teks; tafsirannya ada di shared/src/settings.ts.
export const app_settings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_by: text('updated_by'),
  updated_at: text('updated_at').notNull(),
});

// Dedup pengingat terjadwal: satu pengingat per jenis per orang per hari (tanggal WIB). Baris dimasukkan SEBELUM kirim (klaim),
// jadi dua proses bersamaan atau cron yang berjalan berkali-kali tidak mengirim ganda.
export const reminder_log = sqliteTable('reminder_log', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  date: text('date').notNull(),
  employee_id: text('employee_id').notNull(),
  created_at: text('created_at').notNull(),
}, (t) => ({
  uniq: uniqueIndex('reminder_log_unique').on(t.kind, t.date, t.employee_id),
}));
