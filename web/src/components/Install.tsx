import { useState, type ReactNode } from 'react';
import { ChevronRight, Download, Share, SquarePlus } from 'lucide-react';
import { promptInstall, useInstallState, type InstallState } from '../lib/install';
import { Button, Sheet } from '../ui';

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-sub text-sm font-bold" aria-hidden="true">{n}</span>
      <span>{children}</span>
    </li>
  );
}

/** Langkah pasang sesuai platform. */
export function InstallGuide({ open, onClose, state }: { open: boolean; onClose: () => void; state: InstallState }) {
  const isIos = state === 'ios';
  return (
    <Sheet open={open} onClose={onClose} title={isIos ? 'Pasang di iPhone' : 'Pasang di Android'}>
      {isIos ? (
        <ol className="flex flex-col gap-3 text-base">
          <Step n={1}>Buka alamat ini di <b>Safari</b>, lalu ketuk tombol <b>Bagikan</b> <Share className="inline size-4 align-text-bottom" aria-hidden="true" /> (kotak dengan panah ke atas) di bagian bawah.</Step>
          <Step n={2}>Gulir lalu pilih <b>Tambahkan ke Layar Utama</b> <SquarePlus className="inline size-4 align-text-bottom" aria-hidden="true" />, kemudian ketuk <b>Tambah</b>.</Step>
          <Step n={3}><b>Buka aplikasi dari ikon</b> di Layar Utama (bukan dari Safari), masuk, lalu aktifkan notifikasi di menu Akun.</Step>
        </ol>
      ) : (
        <ol className="flex flex-col gap-3 text-base">
          <Step n={1}>Di Chrome, ketuk menu <b>⋮</b> di pojok kanan atas.</Step>
          <Step n={2}>Pilih <b>Pasang aplikasi</b> (atau <b>Tambahkan ke Layar Utama</b>), lalu ketuk <b>Pasang</b>.</Step>
          <Step n={3}>Buka aplikasi dari ikon di layar HP, masuk, lalu aktifkan notifikasi di menu Akun. Setelah dipasang, notifikasi muncul sebagai popup.</Step>
        </ol>
      )}
      <Button className="mt-5 w-full" onClick={onClose}>Mengerti</Button>
    </Sheet>
  );
}

/** Baris di tab Akun (tetap ada selama belum terpasang, walau kartu "Siapkan akun" di Beranda sudah ditutup). */
export function InstallRow() {
  const state = useInstallState();
  const [guide, setGuide] = useState(false);
  if (state === 'installed' || state === 'desktop') return null;
  return (
    <>
      <button onClick={() => (state === 'prompt' ? void promptInstall() : setGuide(true))} className="flex min-h-14 w-full items-center gap-3 px-4 text-left active:bg-sub">
        <Download className="size-5" aria-hidden="true" /><span className="flex-1 font-medium">Pasang aplikasi di HP</span><ChevronRight className="size-5 text-muted" aria-hidden="true" />
      </button>
      <InstallGuide open={guide} onClose={() => setGuide(false)} state={state} />
    </>
  );
}
