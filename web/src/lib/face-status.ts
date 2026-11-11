import { useQuery } from '@tanstack/react-query';
import type { FaceMode, FaceTemplateStatus } from '@hris/shared';
import { api } from './api';

export interface FaceTemplateInfo { id: string; status: FaceTemplateStatus; sampleCount: number; createdAt: string; decidedAt: string | null; note: string | null }

export interface FaceStatus {
  /** karyawan hanya mendapat `mode`; admin juga mendapat ambang */
  settings: { mode: FaceMode; threshold?: number; liveThreshold?: number };
  consent: { version: string; text: string[] };
  modelVersion: string;
  /** punya template aktif (disetujui HC) */
  active: boolean;
  approved: FaceTemplateInfo | null;
  pending: FaceTemplateInfo | null;
  rejected: FaceTemplateInfo | null;
}

/** Status pendaftaran wajah sendiri dan mode verifikasi (mati/ditandai). */
export const useFaceStatus = () => useQuery({ queryKey: ['face-status'], queryFn: () => api<FaceStatus>('/face/status'), staleTime: 30_000 });
