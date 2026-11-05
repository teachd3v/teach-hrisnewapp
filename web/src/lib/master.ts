import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type MasterKind = 'department' | 'level' | 'employment_status';

export interface MasterOption { id: string; kind: MasterKind; name: string; sort_order: number; active: boolean; usedBy: number }

export const MASTER_LABEL: Record<MasterKind, string> = { department: 'Departemen', level: 'Level', employment_status: 'Status' };
export const MASTER_LABEL_LONG: Record<MasterKind, string> = { department: 'Departemen', level: 'Level', employment_status: 'Status kepegawaian' };

/** Semua pilihan master (admin boleh membaca). Urutan dari server: jenis, lalu urutan. */
export const useMaster = () => useQuery({ queryKey: ['master'], queryFn: () => api<MasterOption[]>('/master') });

export const optionsOf = (all: MasterOption[] | undefined, kind: MasterKind) => (all ?? []).filter((o) => o.kind === kind);

export const nameOf = (all: MasterOption[] | undefined, id: string | null | undefined) => (id ? (all ?? []).find((o) => o.id === id)?.name ?? null : null);
