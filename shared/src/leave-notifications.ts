// Perencanaan penerima notifikasi cuti. Fungsi murni (tanpa akses database); isi tanpa alasan cuti (sensitif).
export type NotificationType =
  | 'leave.submitted' // atasan: perlu aksi; admin: pemberitahuan
  | 'leave.manager_approved' // admin: perlu aksi HC; karyawan: pemberitahuan
  | 'leave.manager_rejected'
  | 'leave.hc_approved'
  | 'leave.hc_rejected'
  | 'leave.hc_override'
  | 'overtime.submitted' // atasan: perlu aksi; admin: pemberitahuan
  | 'overtime.manager_approved' // admin: perlu aksi HC; karyawan: pemberitahuan
  | 'overtime.manager_rejected'
  | 'overtime.hc_approved'
  | 'overtime.hc_rejected'
  | 'overtime.hc_override'
  | 'overtime.revoked'
  | 'leave.joint_changed' // karyawan: pemberitahuan perubahan potongan cuti bersama
  | 'attendance.correction_requested' // admin: perlu aksi
  | 'attendance.correction_decided'; // pengaju: pemberitahuan

export interface NotifyInput {
  employeeId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  entityId?: string | null;
}

/** Notifikasi "perlu aksi": dianggap selesai begitu pengajuan diputuskan atau dibatalkan. */
export const ACTIONABLE_TYPES: NotificationType[] = ['leave.submitted', 'leave.manager_approved', 'overtime.submitted', 'overtime.manager_approved', 'attendance.correction_requested'];

const HREF = { approver: '/persetujuan', admin: '/admin/cuti', mine: '/cuti' } as const;

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "Cuti Tahunan · 3 hari (12 Nov – 14 Nov)". */
export function leaveBrief(type: string, start: string, end: string, days: number): string {
  const range = start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`;
  return `${type} · ${days} hari (${range})`;
}

export interface LeaveRef {
  requestId: string;
  requesterId: string;
  requesterName: string;
  brief: string;
}

/** Pengajuan baru: atasan langsung (perlu aksi) dan semua admin (pemberitahuan; pucuk pimpinan langsung perlu aksi HC). */
export function planSubmitted(ref: LeaveRef & { managerId: string | null; managerName: string | null; adminIds: string[] }): NotifyInput[] {
  const title = `Pengajuan cuti baru dari ${ref.requesterName}`;
  const out: NotifyInput[] = [];
  const hasManager = Boolean(ref.managerId) && ref.managerId !== ref.requesterId;
  if (hasManager) {
    out.push({ employeeId: ref.managerId!, type: 'leave.submitted', title, body: `${ref.brief}. Menunggu persetujuan Anda.`, href: HREF.approver, entityId: ref.requestId });
  }
  for (const id of ref.adminIds) {
    if (id === ref.requesterId || (hasManager && id === ref.managerId)) continue;
    out.push({
      employeeId: id, type: 'leave.submitted', title,
      body: hasManager
        ? `${ref.brief}. Menunggu atasan${ref.managerName ? ` (${ref.managerName})` : ''}.`
        : `${ref.brief}. Menunggu persetujuan HC.`,
      href: HREF.admin, entityId: ref.requestId,
    });
  }
  return out;
}

/** Keputusan atasan: karyawan diberi tahu; bila disetujui, admin (kecuali pelaku dan pengaju) diminta memproses. */
export function planManagerDecision(ref: LeaveRef & { actorId: string; approved: boolean; adminIds: string[] }): NotifyInput[] {
  const out: NotifyInput[] = [{
    employeeId: ref.requesterId,
    type: ref.approved ? 'leave.manager_approved' : 'leave.manager_rejected',
    title: ref.approved ? 'Pengajuan cuti disetujui atasan' : 'Pengajuan cuti ditolak atasan',
    body: ref.approved ? `${ref.brief}. Menunggu persetujuan HC.` : ref.brief,
    href: HREF.mine, entityId: ref.requestId,
  }];
  if (ref.approved) {
    for (const id of ref.adminIds) {
      if (id === ref.requesterId || id === ref.actorId) continue;
      out.push({ employeeId: id, type: 'leave.manager_approved', title: 'Pengajuan cuti menunggu persetujuan HC', body: `${ref.requesterName}: ${ref.brief}. Sudah disetujui atasan.`, href: HREF.admin, entityId: ref.requestId });
    }
  }
  return out;
}

/** Keputusan akhir HC: karyawan diberi tahu. */
export function planHcDecision(ref: LeaveRef & { approved: boolean }): NotifyInput[] {
  return [{
    employeeId: ref.requesterId,
    type: ref.approved ? 'leave.hc_approved' : 'leave.hc_rejected',
    title: ref.approved ? 'Pengajuan cuti disetujui' : 'Pengajuan cuti ditolak',
    body: ref.brief, href: HREF.mine, entityId: ref.requestId,
  }];
}

/** HC mengambil alih pengajuan yang tertahan di atasan: karyawan dan atasan yang menahan diberi tahu. */
export function planOverride(ref: LeaveRef & { actorId: string; approved: boolean; managerId: string | null }): NotifyInput[] {
  const out: NotifyInput[] = [{
    employeeId: ref.requesterId, type: 'leave.hc_override',
    title: ref.approved ? 'Pengajuan cuti disetujui HC' : 'Pengajuan cuti ditolak HC',
    body: `${ref.brief}. Diputuskan langsung oleh HC.`, href: HREF.mine, entityId: ref.requestId,
  }];
  if (ref.managerId && ref.managerId !== ref.actorId && ref.managerId !== ref.requesterId) {
    out.push({ employeeId: ref.managerId, type: 'leave.hc_override', title: 'Pengajuan bawahan diputuskan HC', body: `${ref.requesterName}: ${ref.brief}.`, href: HREF.approver, entityId: ref.requestId });
  }
  return out;
}

/** Cuti bersama ditambahkan/dibatalkan saat pengaturan potong cuti aktif: tiap karyawan terdampak diberi tahu. */
export function planJointHolidayChange(ref: { recipientIds: string[]; name: string; date: string; added: boolean }): NotifyInput[] {
  const title = ref.added ? 'Cuti bersama ditambahkan' : 'Cuti bersama dibatalkan';
  const body = ref.added
    ? `${ref.name} (${shortDate(ref.date)}) memotong 1 hari Cuti Tahunan Anda.`
    : `${ref.name} (${shortDate(ref.date)}) tidak lagi memotong Cuti Tahunan. 1 hari dikembalikan ke saldo Anda.`;
  return ref.recipientIds.map((employeeId) => ({ employeeId, type: 'leave.joint_changed' as const, title, body, href: HREF.mine, entityId: ref.date }));
}

/**
 * Pengaturan potong cuti bersama berubah (nyala/mati atau daftar status dikecualikan): karyawan yang potongannya berubah diberi tahu.
 * `before`/`after` = hari cuti bersama yang memotong Cuti Tahunan pada `year`, sebelum dan sesudah perubahan. Yang tidak berubah dilewati.
 */
export function planJointSettingChange(ref: { changes: { id: string; before: number; after: number }[]; year: number }): NotifyInput[] {
  const out: NotifyInput[] = [];
  for (const { id, before, after } of ref.changes) {
    if (before === after) continue;
    const more = after > before;
    out.push({
      employeeId: id, type: 'leave.joint_changed',
      title: more ? 'Cuti bersama kini memotong Cuti Tahunan' : 'Potongan cuti bersama berkurang',
      body: more
        ? `Tahun ${ref.year}: ${after} hari cuti bersama dipotong dari saldo Cuti Tahunan Anda.`
        : after === 0
          ? `Cuti bersama tahun ${ref.year} tidak lagi memotong Cuti Tahunan Anda. ${before} hari dikembalikan ke saldo.`
          : `Tahun ${ref.year}: potongan cuti bersama menjadi ${after} hari (sebelumnya ${before}).`,
      href: HREF.mine, entityId: null,
    });
  }
  return out;
}

// ------------------------------------------------------------------ overtime (alur sama dengan cuti; isi tanpa alasan)

const OT_HREF = { approver: '/persetujuan?jenis=overtime', admin: '/admin/cuti?jenis=overtime', mine: '/cuti?riwayat=overtime' } as const;

/** "Lembur · 17 Okt (17:00–21:00)". */
export const overtimeBrief = (label: string, date: string, start: string, end: string) => `${label} · ${shortDate(date)} (${start}\u2013${end})`;

export function planOvertimeSubmitted(ref: LeaveRef & { managerId: string | null; managerName: string | null; adminIds: string[] }): NotifyInput[] {
  const title = `Pengajuan overtime baru dari ${ref.requesterName}`;
  const out: NotifyInput[] = [];
  const hasManager = Boolean(ref.managerId) && ref.managerId !== ref.requesterId;
  if (hasManager) out.push({ employeeId: ref.managerId!, type: 'overtime.submitted', title, body: `${ref.brief}. Menunggu persetujuan Anda.`, href: OT_HREF.approver, entityId: ref.requestId });
  for (const id of ref.adminIds) {
    if (id === ref.requesterId || (hasManager && id === ref.managerId)) continue;
    out.push({
      employeeId: id, type: 'overtime.submitted', title,
      body: hasManager ? `${ref.brief}. Menunggu atasan${ref.managerName ? ` (${ref.managerName})` : ''}.` : `${ref.brief}. Menunggu persetujuan HC.`,
      href: OT_HREF.admin, entityId: ref.requestId,
    });
  }
  return out;
}

export function planOvertimeManagerDecision(ref: LeaveRef & { actorId: string; approved: boolean; adminIds: string[] }): NotifyInput[] {
  const out: NotifyInput[] = [{
    employeeId: ref.requesterId, type: ref.approved ? 'overtime.manager_approved' : 'overtime.manager_rejected',
    title: ref.approved ? 'Overtime disetujui atasan' : 'Overtime ditolak atasan',
    body: ref.approved ? `${ref.brief}. Menunggu persetujuan HC.` : ref.brief, href: OT_HREF.mine, entityId: ref.requestId,
  }];
  if (ref.approved) {
    for (const id of ref.adminIds) {
      if (id === ref.requesterId || id === ref.actorId) continue;
      out.push({ employeeId: id, type: 'overtime.manager_approved', title: 'Overtime menunggu persetujuan HC', body: `${ref.requesterName}: ${ref.brief}. Sudah disetujui atasan.`, href: OT_HREF.admin, entityId: ref.requestId });
    }
  }
  return out;
}

/** Keputusan akhir HC. Bila disetujui, karyawan diberi tahu bahwa kredit Ganti Hari bertambah. */
export function planOvertimeHcDecision(ref: LeaveRef & { approved: boolean }): NotifyInput[] {
  return [{
    employeeId: ref.requesterId, type: ref.approved ? 'overtime.hc_approved' : 'overtime.hc_rejected',
    title: ref.approved ? 'Overtime disetujui' : 'Overtime ditolak',
    body: ref.approved ? `${ref.brief}. Kredit Ganti Hari Anda bertambah sesuai aturan overtime.` : ref.brief, href: OT_HREF.mine, entityId: ref.requestId,
  }];
}

export function planOvertimeOverride(ref: LeaveRef & { actorId: string; approved: boolean; managerId: string | null }): NotifyInput[] {
  const out: NotifyInput[] = [{
    employeeId: ref.requesterId, type: 'overtime.hc_override',
    title: ref.approved ? 'Overtime disetujui HC' : 'Overtime ditolak HC',
    body: `${ref.brief}. Diputuskan langsung oleh HC.`, href: OT_HREF.mine, entityId: ref.requestId,
  }];
  if (ref.managerId && ref.managerId !== ref.actorId && ref.managerId !== ref.requesterId) {
    out.push({ employeeId: ref.managerId, type: 'overtime.hc_override', title: 'Overtime bawahan diputuskan HC', body: `${ref.requesterName}: ${ref.brief}.`, href: OT_HREF.approver, entityId: ref.requestId });
  }
  return out;
}

/** HC mencabut overtime yang sudah disetujui: kredit Ganti Hari dikurangi. */
export function planOvertimeRevoked(ref: LeaveRef): NotifyInput[] {
  return [{
    employeeId: ref.requesterId, type: 'overtime.revoked', title: 'Overtime dibatalkan HC',
    body: `${ref.brief}. Kredit Ganti Hari dari overtime ini dicabut.`, href: OT_HREF.mine, entityId: ref.requestId,
  }];
}

