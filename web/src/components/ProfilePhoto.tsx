import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { cx } from '../ui';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';

/** Foto profil dari tautan bertanda tangan (terlihat oleh semua pengguna login); bila belum ada, inisial nama. */
export default function ProfilePhoto({ fileKey, name, className = 'size-16' }: { fileKey: string | null | undefined; name: string; className?: string }) {
  const link = useQuery({
    queryKey: ['profile-photo', fileKey],
    enabled: Boolean(fileKey),
    queryFn: () => api<{ url: string }>('/files/link', { method: 'POST', json: { key: fileKey } }),
    staleTime: 4 * 60_000, // tautan berumur 5 menit
  });
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  const url = link.data?.url;
  return url ? (
    <img src={url.startsWith('/api') ? `${base}${url}` : url} alt={`Foto ${name}`} className={cx('shrink-0 rounded-full object-cover', className)} />
  ) : (
    <span aria-hidden="true" className={cx('grid shrink-0 place-items-center rounded-full bg-sub text-lg font-bold text-muted', className)}>{initials(name)}</span>
  );
}
