import { useState } from 'react';
import { api } from '../lib/api';

/** Minta tautan bertanda tangan (berumur 5 menit) lalu membukanya di tab baru. */
export default function AttachmentLink({ fileKey }: { fileKey: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/files/link', { method: 'POST', json: { key: fileKey } });
      const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
      window.open(url.startsWith('/api') ? `${base}${url}` : url, '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button type="button" disabled={busy} onClick={() => void open()} className="text-xs underline disabled:opacity-50">{busy ? 'Membuka…' : 'Lihat lampiran'}</button>
      {error && <span role="alert" className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}
