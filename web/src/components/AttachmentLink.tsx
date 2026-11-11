import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { Paperclip, X, ZoomIn, ZoomOut } from 'lucide-react';
import { api } from '../lib/api';

const IMAGE = /\.(jpe?g|png|webp)$/i;
const absolute = (url: string) => {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  return url.startsWith('/api') ? `${base}${url}` : url;
};

/** Penampil gambar layar penuh. Dibuka lewat entri riwayat sendiri, jadi gestur/tombol kembali menutup penampil (bukan keluar aplikasi). */
function ImageViewer({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(false);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, []);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between gap-2 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 text-white">
        <p className="truncate text-sm font-medium">{label}</p>
        <div className="flex gap-1">
          <button type="button" onClick={() => setZoom((z) => !z)} aria-label={zoom ? 'Perkecil' : 'Perbesar'} className="grid size-11 place-items-center rounded-full active:bg-white/20">
            {zoom ? <ZoomOut className="size-5" aria-hidden="true" /> : <ZoomIn className="size-5" aria-hidden="true" />}
          </button>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Tutup" className="grid size-11 place-items-center rounded-full active:bg-white/20"><X className="size-6" aria-hidden="true" /></button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]" onClick={() => setZoom((z) => !z)}>
        {failed
          ? <p role="alert" className="p-6 text-center text-white">Gambar tidak dapat dimuat. Tutup lalu buka lagi (tautan berlaku 5 menit).</p>
          : <img src={url} alt={label} onError={() => setFailed(true)} className={zoom ? 'max-w-none' : 'mx-auto h-full w-full object-contain'} style={zoom ? { width: '200%' } : undefined} />}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Minta tautan bertanda tangan (berumur 5 menit). Gambar dibuka di penampil dalam aplikasi (gestur kembali menutupnya);
 * berkas lain (mis. PDF) dibuka di jendela baru. Target sentuh 44 px.
 */
export default function AttachmentLink({ fileKey, label = 'Lihat lampiran' }: { fileKey: string; label?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const isImage = IMAGE.test(fileKey);
  // Penampil hanya tampil selama entri riwayat saat ini membawa penanda `viewer` untuk berkas ini.
  const viewing = isImage && imgUrl !== null && (location.state as { viewer?: string } | null)?.viewer === fileKey;
  useEffect(() => { if (!viewing) setImgUrl(null); }, [viewing]);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/files/link', { method: 'POST', json: { key: fileKey } });
      if (isImage) {
        setImgUrl(absolute(url));
        navigate(`${location.pathname}${location.search}`, { state: { ...(location.state as object | null), viewer: fileKey } });
      } else {
        window.open(absolute(url), '_blank', 'noopener');
      }
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
      {viewing && imgUrl && <ImageViewer url={imgUrl} label={label} onClose={() => navigate(-1)} />}
    </div>
  );
}
