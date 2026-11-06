import { LEAVE_KEYS, type LeaveCategory, type LeaveTypeMeta } from './leave';

export type LeaveStatus = 'pending_manager' | 'pending_hc' | 'approved' | 'rejected' | 'cancelled';

/** Status yang masih berlaku: memotong sisa kuota dan dicek bentrok tanggal. */
export const ACTIVE_STATUSES: LeaveStatus[] = ['pending_manager', 'pending_hc', 'approved'];
export const PENDING_STATUSES: LeaveStatus[] = ['pending_manager', 'pending_hc'];

export interface LeaveBalance {
  /** pengenal tetap jenis cuti */
  type: LeaveCategory;
  /** nama yang ditampilkan */
  label: string;
  /** null = tidak dibatasi */
  quota: number | null;
  /** sudah disetujui */
  used: number;
  /** menunggu persetujuan (sudah memotong sisa) */
  pending: number;
  /** dipotong cuti bersama (hanya Cuti Tahunan, hanya bila pengaturannya menyala); 0 untuk lainnya */
  jointDeducted: number;
  /** bagian kuota yang berasal dari kredit overtime (hanya Ganti Hari); 0 untuk lainnya */
  overtimeCredit: number;
  /** kredit overtime yang sudah hangus per tanggal acuan (hanya Ganti Hari) */
  expired: number;
  /** hari pemakaian yang tidak tertutup kuota (hanya Ganti Hari; > 0 = kelebihan, mis. kredit dicabut) */
  shortfall: number;
  /** null = tidak dibatasi */
  remaining: number | null;
  /** true jika admin menetapkan jatah khusus */
  explicit: boolean;
}

export interface UsageRow { type: string; status: LeaveStatus; days: number }

/** Jenis cuti yang dipotong cuti bersama. */
export const JOINT_LEAVE_DEDUCTS_TYPE: LeaveCategory = LEAVE_KEYS.annual;

const isoWeekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
/** Cuti bersama yang jatuh Senin-Jumat; yang jatuh di akhir pekan tidak mengurangi apa pun. */
export const isJointWorkday = (h: { date: string; type: string }) => h.type === 'JOINT' && isoWeekday(h.date) % 6 !== 0;

/**
 * Jumlah hari cuti bersama yang memotong Cuti Tahunan satu karyawan pada `year`.
 * Hanya tanggal di tahun itu, hari kerja, dan pada atau setelah tanggal masuk (`joinDate` kosong = dihitung semua).
 */
export function jointLeaveDeduction(
  holidays: readonly { date: string; type: string }[],
  joinDate: string | null,
  year: number,
): number {
  return holidays.filter((h) => h.date.startsWith(`${year}-`) && isJointWorkday(h) && (!joinDate || h.date >= joinDate)).length;
}

/**
 * Hitung saldo per jenis. `types`: jenis cuti (kuota bawaan dari `defaultQuota`). `explicitQuotas`: jenis -> jatah khusus tahun itu.
 * `usage`: jumlah hari per jenis+status. `jointDeducted`: potongan cuti bersama untuk Cuti Tahunan (0 bila pengaturan mati atau karyawan dikecualikan).
 */
export function computeBalances(
  types: readonly Pick<LeaveTypeMeta, 'key' | 'label' | 'defaultQuota'>[],
  explicitQuotas: ReadonlyMap<string, number>,
  usage: readonly UsageRow[],
  jointDeducted = 0,
): LeaveBalance[] {
  return types.map(({ key, label, defaultQuota }) => {
    const explicit = explicitQuotas.has(key);
    const quota = explicit ? explicitQuotas.get(key)! : defaultQuota;
    const used = usage.filter((u) => u.type === key && u.status === 'approved').reduce((a, u) => a + u.days, 0);
    const pending = usage.filter((u) => u.type === key && PENDING_STATUSES.includes(u.status)).reduce((a, u) => a + u.days, 0);
    const joint = key === JOINT_LEAVE_DEDUCTS_TYPE ? jointDeducted : 0;
    return { type: key, label, quota, used, pending, jointDeducted: joint, overtimeCredit: 0, expired: 0, shortfall: 0, remaining: quota === null ? null : quota - used - pending - joint, explicit };
  });
}
