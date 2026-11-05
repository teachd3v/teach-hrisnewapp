// Label dan kelompok aksi log audit. Aksi yang tidak dikenal tetap ditampilkan dengan kode aslinya.

export type AuditGroup = 'auth' | 'leave' | 'attendance' | 'employee' | 'master' | 'holiday' | 'file' | 'report';

export const AUDIT_GROUPS: { key: AuditGroup; label: string }[] = [
  { key: 'auth', label: 'Login & keamanan' },
  { key: 'leave', label: 'Cuti' },
  { key: 'attendance', label: 'Presensi & koreksi' },
  { key: 'employee', label: 'Karyawan' },
  { key: 'master', label: 'Data master' },
  { key: 'holiday', label: 'Hari libur' },
  { key: 'file', label: 'Akses berkas' },
  { key: 'report', label: 'Rekap & ekspor' },
];

/** `attention`: aksi yang layak diperhatikan saat meninjau (kegagalan, pengambilalihan, akses data pihak lain). */
export const AUDIT_ACTIONS: Record<string, { label: string; attention?: boolean }> = {
  'auth.login': { label: 'Masuk' },
  'auth.login_failed': { label: 'Gagal masuk', attention: true },
  'auth.login_locked': { label: 'Akun terkunci (percobaan masuk)', attention: true },
  'auth.refresh_reuse_detected': { label: 'Token sesi dipakai ulang (sesi dicabut)', attention: true },
  'auth.password_changed': { label: 'Ganti password' },
  'leave.submitted': { label: 'Ajukan cuti' },
  'leave.cancelled': { label: 'Batalkan cuti' },
  'leave.manager_decision': { label: 'Keputusan atasan (cuti)' },
  'leave.hc_decision': { label: 'Keputusan HC (cuti)' },
  'leave.hc_override': { label: 'Ambil alih HC (cuti)', attention: true },
  'leave.quota_set': { label: 'Ubah kuota cuti' },
  'attendance.clock_in': { label: 'Presensi masuk' },
  'attendance.clock_out': { label: 'Presensi pulang' },
  'attendance.correction_requested': { label: 'Ajukan koreksi presensi' },
  'attendance.correction_cancelled': { label: 'Batalkan koreksi presensi' },
  'attendance.correction_decision': { label: 'Keputusan koreksi presensi' },
  'employee.created': { label: 'Tambah karyawan' },
  'employee.updated': { label: 'Ubah data karyawan' },
  'employee.password_reset': { label: 'Reset password karyawan', attention: true },
  'master.created': { label: 'Tambah data master' },
  'master.updated': { label: 'Ubah data master' },
  'master.reordered': { label: 'Ubah urutan data master' },
  'master.deleted': { label: 'Hapus data master' },
  'holiday.set': { label: 'Simpan hari libur' },
  'holiday.deleted': { label: 'Hapus hari libur' },
  'file.access': { label: 'Buka berkas milik orang lain', attention: true },
  'report.range': { label: 'Ambil rekap presensi & cuti', attention: true },
};

export const auditLabel = (action: string) => AUDIT_ACTIONS[action]?.label ?? action;
export const auditGroupOf = (action: string): AuditGroup | null => (AUDIT_GROUPS.find((g) => action.startsWith(`${g.key}.`))?.key ?? null);
