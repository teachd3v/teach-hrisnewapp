import type { LeaveBalance, LeaveStatus } from '@hris/shared';

export interface LeaveItem {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  total_days: number;
  reason: string | null;
  attachment_key: string | null;
  status: LeaveStatus;
  manager_notes: string | null;
  hc_notes: string | null;
  hc_override: boolean;
  hc_override_reason: string | null;
  created_at: string;
  employeeName?: string | null;
  dept?: string | null;
  managerName?: string | null;
}

export interface LeaveMeta {
  gender: string | null;
  managerName: string | null;
  canSubmit: boolean;
  balances: LeaveBalance[];
  holidays: { date: string; name: string; type: string }[];
}

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending_manager: 'Menunggu atasan',
  pending_hc: 'Menunggu HC',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  cancelled: 'Dibatalkan',
};

export const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const fmtRange = (r: Pick<LeaveItem, 'start_date' | 'end_date'>) =>
  r.start_date === r.end_date ? fmtDate(r.start_date) : `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}`;
