import { useQuery } from '@tanstack/react-query';
import type { LeaveBalance, LeaveStatus, LeaveTypeMeta } from '@hris/shared';
import { api } from './api';

/** Daftar jenis cuti untuk menampilkan nama (semua pengguna). Admin menerima rincian lengkap + `usedBy`; karyawan hanya key/label/active. */
export type LeaveTypeRow = Partial<LeaveTypeMeta> & { key: string; label: string; active: boolean; usedBy?: number };
export const useLeaveTypes = () => useQuery({ queryKey: ['leave-types'], queryFn: () => api<LeaveTypeRow[]>('/leave-types'), staleTime: 60_000 });
/** Nama tampilan sebuah jenis cuti dari pengenalnya; bila belum termuat/tidak ada, tampilkan pengenalnya. */
export const leaveLabel = (types: LeaveTypeRow[] | undefined, key: string) => types?.find((t) => t.key === key)?.label ?? key;

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
  /** jenis cuti aktif yang boleh diajukan, berurutan */
  types: LeaveTypeMeta[];
  managerName: string | null;
  canSubmit: boolean;
  isManager: boolean;
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

export const STATUS_TONE: Record<LeaveStatus, 'ok' | 'warn' | 'bad' | 'info' | 'neutral'> = {
  pending_manager: 'warn',
  pending_hc: 'info',
  approved: 'ok',
  rejected: 'bad',
  cancelled: 'neutral',
};
