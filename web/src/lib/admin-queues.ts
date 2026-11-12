import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Jumlah pekerjaan yang menunggu HC (hanya untuk admin). */
export interface AdminQueues { leave: number; overtime: number; corrections: number; face: number }

/** Dimuat ulang setiap Akun dibuka dan tiap menit, supaya lencana menu admin tidak basi. */
export const useAdminQueues = () =>
  useQuery({ queryKey: ['admin-queues'], queryFn: () => api<AdminQueues>('/admin/queues'), staleTime: 0, refetchInterval: 60_000 });
