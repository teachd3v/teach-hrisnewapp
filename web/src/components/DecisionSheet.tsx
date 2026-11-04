import { useEffect, useState } from 'react';
import { Button, Field, Sheet, Textarea } from '../ui';

/** Lembar konfirmasi keputusan: catatan (opsional atau wajib) lalu konfirmasi. Galat tetap di dalam lembar. */
export default function DecisionSheet({
  open, onClose, title, summary, approve, requireText = false, textLabel = 'Catatan', onConfirm,
}: {
  open: boolean; onClose: () => void; title: string; summary?: string; approve: boolean; requireText?: boolean; textLabel?: string;
  onConfirm: (text: string) => Promise<unknown>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setText(''); setError(null); } }, [open]);

  async function confirm() {
    if (requireText && !text.trim()) return setError(`${textLabel} wajib diisi`);
    setBusy(true); setError(null);
    try { await onConfirm(text.trim()); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {summary && <p className="mb-3 text-sm text-muted">{summary}</p>}
      <Field label={requireText ? textLabel : `${textLabel} (opsional)`} error={error}>
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />}
      </Field>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Batal</Button>
        <Button variant={approve ? 'primary' : 'danger'} onClick={() => void confirm()} loading={busy}>{approve ? 'Setujui' : 'Tolak'}</Button>
      </div>
    </Sheet>
  );
}
