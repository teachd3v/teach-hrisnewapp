import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { api } from '../lib/api';

/** Minta tautan bertanda tangan (berumur 5 menit) lalu membukanya. Target sentuh 44 px. */
export default function AttachmentLink({ fileKey, label = 'Lihat lampiran' }: { fileKey: string; label?: string }) {
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
    <div>
      <button type="button" disabled={busy} onClick={() => void open()} className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium underline active:bg-sub disabled:opacity-50">
        <Paperclip className="size-4" aria-hidden="true" />{busy ? 'Membuka…' : label}
      </button>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  );
}
