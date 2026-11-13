import { useEffect, useState, type ReactNode } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { hintSeen, markHintSeen, type HintId } from '../lib/guide';

/**
 * Petunjuk satu kalimat yang tampil hanya pada kunjungan pertama ke sebuah layar (per akun, di perangkat ini). Ditandai "sudah dilihat"
 * begitu tampil, jadi kunjungan berikutnya tidak memunculkannya lagi; bisa juga ditutup langsung. Muncul lagi sekali setelah
 * Akun > Lihat panduan lagi.
 */
export default function FirstHint({ id, children }: { id: HintId; children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [show, setShow] = useState(() => Boolean(userId) && !hintSeen(userId!, id));
  useEffect(() => { if (userId) markHintSeen(userId, id); }, [userId, id]);
  if (!show) return null;
  return (
    <div role="note" className="flex items-start gap-2 rounded-2xl bg-info-bg py-1 pl-3 pr-1 text-sm text-info">
      <Lightbulb className="mt-2.5 size-5 shrink-0" aria-hidden="true" />
      <p className="flex-1 py-2.5">{children}</p>
      <button type="button" aria-label="Tutup petunjuk" onClick={() => setShow(false)} className="grid size-11 shrink-0 place-items-center rounded-full active:bg-white/50"><X className="size-5" aria-hidden="true" /></button>
    </div>
  );
}
