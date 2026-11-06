import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface ProfileData {
  employee: { id: string; name: string; email: string; title: string | null; join_date: string | null; photoKey: string | null; department: string | null; level: string | null; status: string | null };
  personal: Record<string, string | null>;
  entries: Record<string, { id: string; data: Record<string, string | null> }[]>;
  /** hanya untuk profil sendiri; null = belum membaca keterangan penggunaan data */
  consentedAt?: string | null;
  completeness: { percent: number; missing: string[] };
  permissions: { hc: boolean; self: boolean };
}

export interface ProfileCard { id: string; name: string; title: string | null; department: string | null; photoKey: string | null }

/** Profil lengkap (`id` = 'me' untuk milik sendiri). Hanya pemilik, HC, dan super admin yang berhak. */
export const useProfile = (id: string) => useQuery({ queryKey: ['profile', id], queryFn: () => api<ProfileData>(`/profile/${id}`) });
export const useProfileCard = (id: string) => useQuery({ queryKey: ['profile-card', id], queryFn: () => api<ProfileCard>(`/profile/${id}/card`), staleTime: 60_000 });

/** Potong persegi di tengah lalu kecilkan (maks. 512 px) menjadi JPEG, di perangkat sebelum diunggah. */
export async function squarePhoto(file: File, size = 512): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const side = Math.min(bmp.width, bmp.height);
    const out = Math.min(size, side);
    const canvas = document.createElement('canvas');
    canvas.width = out; canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Gambar tidak dapat diproses');
    ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gambar tidak dapat diproses'))), 'image/jpeg', 0.85));
  } finally {
    bmp.close();
  }
}
