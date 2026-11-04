// Perencanaan penerima notifikasi cuti. Fungsi murni (tanpa akses database); isi tanpa alasan cuti (sensitif).
export type NotificationType =
  | 'leave.submitted' // atasan: perlu aksi; admin: pemberitahuan
  | 'leave.manager_approved' // admin: perlu aksi HC; karyawan: pemberitahuan
  | 'leave.manager_rejected'
  | 'leave.hc_approved'
  | 'leave.hc_rejected'
  | 'leave.hc_override';

export interface NotifyInput {
  employeeId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  entityId?: string | null;
}

/** Notifikasi "perlu aksi": dianggap selesai begitu pengajuan diputuskan atau dibatalkan. */
export const ACTIONABLE_TYPES: NotificationType[] = ['leave.submitted', 'leave.manager_approved'];

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
