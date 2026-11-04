import { LEAVE_TYPES, type LeaveCategory } from './leave';

export type LeaveStatus = 'pending_manager' | 'pending_hc' | 'approved' | 'rejected' | 'cancelled';

/** Status yang masih berlaku: memotong sisa kuota dan dicek bentrok tanggal. */
export const ACTIVE_STATUSES: LeaveStatus[] = ['pending_manager', 'pending_hc', 'approved'];
export const PENDING_STATUSES: LeaveStatus[] = ['pending_manager', 'pending_hc'];

/** Kuota bawaan bila admin belum menetapkan jatah khusus. null = tidak dibatasi. */
export const DEFAULT_QUOTAS: Partial<Record<LeaveCategory, number>> = {
  'Cuti Tahunan': 12,
  'Ganti Hari': 0,
};

export interface LeaveBalance {
  type: LeaveCategory;
  /** null = tidak dibatasi */
  quota: number | null;
  /** sudah disetujui */
  used: number;
  /** menunggu persetujuan (sudah memotong sisa) */
  pending: number;
  /** null = tidak dibatasi */
  remaining: number | null;
  /** true jika admin menetapkan jatah khusus */
  explicit: boolean;
}

export interface UsageRow { type: string; status: LeaveStatus; days: number }

/** Hitung saldo per jenis. `explicitQuotas`: jenis -> jatah khusus tahun itu. `usage`: jumlah hari per jenis+status. */
export function computeBalances(explicitQuotas: ReadonlyMap<string, number>, usage: readonly UsageRow[]): LeaveBalance[] {
  return LEAVE_TYPES.map(({ key }) => {
    const explicit = explicitQuotas.has(key);
    const quota = explicit ? explicitQuotas.get(key)! : (DEFAULT_QUOTAS[key] ?? null);
    const used = usage.filter((u) => u.type === key && u.status === 'approved').reduce((a, u) => a + u.days, 0);
    const pending = usage.filter((u) => u.type === key && PENDING_STATUSES.includes(u.status)).reduce((a, u) => a + u.days, 0);
    return { type: key, quota, used, pending, remaining: quota === null ? null : quota - used - pending, explicit };
  });
}
