export interface CorrectionItem {
  id: string; employee_id: string; date: string; kind: 'both' | 'out_only';
  clock_in_time: string | null; clock_out_time: string; reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decision_notes: string | null; created_at: string; employeeName?: string;
}

export const CORR_STATUS: Record<CorrectionItem['status'], { label: string; tone: 'warn' | 'ok' | 'bad' | 'neutral' }> = {
  pending: { label: 'Menunggu HC', tone: 'warn' },
  approved: { label: 'Disetujui', tone: 'ok' },
  rejected: { label: 'Ditolak', tone: 'bad' },
  cancelled: { label: 'Dibatalkan', tone: 'neutral' },
};

export const corrTimes = (c: Pick<CorrectionItem, 'clock_in_time' | 'clock_out_time'>) =>
  c.clock_in_time ? `Masuk ${c.clock_in_time} · Pulang ${c.clock_out_time}` : `Pulang ${c.clock_out_time}`;
