import { useQuery } from '@tanstack/react-query';
import type { TeamToday } from '@hris/shared';
import { api } from './api';

/** Tab Tim karyawan: status hari ini rekan satu departemen. Hanya status; tanpa jam, foto, atau lokasi. */
export const useTeamToday = () => useQuery({ queryKey: ['team-today'], queryFn: () => api<TeamToday>('/attendance/team'), staleTime: 60_000 });
