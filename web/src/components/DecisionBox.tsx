import { useState } from 'react';

/** Catatan + tombol Setuju/Tolak. `requireText`: catatan wajib (mis. alasan ambil alih HC). */
export default function DecisionBox({
  onDecide, requireText = false, label = 'Catatan (opsional)', approveLabel = 'Setuju', rejectLabel = 'Tolak',
}: {
  onDecide: (approve: boolean, text: string) => Promise<unknown>;
  requireText?: boolean;
  label?: string;
  approveLabel?: string;
  rejectLabel?: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(approve: boolean) {
    if (requireText && !text.trim()) return setError('Alasan wajib diisi');
    setError(null);
    setBusy(true);
    try {
      await onDecide(approve, text.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <textarea className="rounded border p-2 text-sm" rows={2} maxLength={500} placeholder={label} value={text} onChange={(e) => setText(e.target.value)} />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => void go(true)} className="flex-1 rounded bg-black p-2 text-sm text-white disabled:opacity-50">{approveLabel}</button>
        <button disabled={busy} onClick={() => void go(false)} className="flex-1 rounded border p-2 text-sm disabled:opacity-50">{rejectLabel}</button>
      </div>
    </div>
  );
}
