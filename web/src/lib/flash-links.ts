import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface FlashLink { id: string; title: string; url: string }
export interface FlashLinks { global: FlashLink[]; mine: FlashLink[] }

/** Tautan cepat: daftar dari super admin (untuk semua) dan tautan pribadi. */
export const useFlashLinks = () => useQuery({ queryKey: ['flash-links'], queryFn: () => api<FlashLinks>('/flash-links'), staleTime: 60_000 });
