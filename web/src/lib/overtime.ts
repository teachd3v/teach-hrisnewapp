import type { LeaveStatus, OvertimeKind } from '@hris/shared';

export interface OvertimeItem {
  id: string;
  employee_id: string;
  kind: OvertimeKind;
  date: string;
  start_time: string;
  end_time: string;
  minutes: number;
  reason: string | null;
  status: LeaveStatus;
  manager_notes: string | null;
  hc_notes: string | null;
  hc_override: boolean;
  hc_override_reason: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
  employeeName?: string | null;
  managerName?: string | null;
  /** ada presensi masuk pada tanggal overtime (informasi bagi penyetuju) */
  hasAttendance?: boolean;
}

export interface OvertimeMeta {
  today: string;
  from: string;
  to: string;
  rules: { minMinutes: number; fullDayMinutes: number; lemburBlockMinutes: number };
  canSubmit: boolean;
  holidays: { date: string; name: string }[];
}
