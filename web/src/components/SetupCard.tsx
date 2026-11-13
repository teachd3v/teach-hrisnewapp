import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Bell, CircleCheck, Download, ImagePlus, ScanFace, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { promptInstall, useInstallState } from '../lib/install';
import { enablePush } from '../lib/push';
import { useFaceStatus } from '../lib/face-status';
import { useWallpaper } from '../lib/wallpaper';
import { usePushState } from './PushCard';
import { InstallGuide } from './Install';
import { Card, ErrorNote, cx } from '../ui';

const hiddenKey = (userId: string) => `hris.setup.hidden.${userId}`;
const readHidden = (userId: string | undefined) => { try { return Boolean(userId) && localStorage.getItem(hiddenKey(userId!)) === '1'; } catch { return false; } };

interface Item {
  key: string;
  icon: ReactNode;
  label: string;
  sub: string;
  done: boolean;
  /** Tidak ikut menentukan apakah kartu masih perlu tampil. */
  optional?: boolean;
  action: ReactNode;
}

const ACTION = 'inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-primary shadow-sm active:bg-sub disabled:opacity-40';

/**
 * Kartu "Siapkan akun" di Beranda: satu tempat untuk hal yang belum lengkap (pasang aplikasi, notifikasi, wajah untuk presensi,
 * wallpaper). Menggantikan kartu ajakan pasang dan ajakan notifikasi yang dulu terpisah. Isinya dibaca dari keadaan nyata, bukan dari
 * catatan "sudah pernah", jadi berlaku juga untuk karyawan lama dan perangkat baru. Hilang sendiri bila yang penting sudah lengkap
 * (wallpaper opsional), atau bila ditutup (diingat per akun di perangkat ini; semuanya tetap bisa diatur dari tab Akun).
 */
export default function SetupCard() {
  const { user } = useAuth();
  const install = useInstallState();
  const [push, refreshPush] = usePushState();
  const face = useFaceStatus();
  const { choice } = useWallpaper();
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hidden, setHidden] = useState(() => readHidden(user?.id));

  if (!user || hidden || push === null || face.isPending) return null;
  const f = face.data;
  const canInstall = install !== 'installed' && install !== 'desktop';

  const items: Item[] = [];
  if (canInstall) {
    items.push({
      key: 'install', icon: <Download className="size-5" />, label: 'Pasang aplikasi di HP', done: false,
      sub: install === 'ios' ? 'Syarat agar notifikasi bisa aktif di iPhone' : 'Buka lebih cepat dari layar utama',
      action: <button type="button" className={ACTION} onClick={() => (install === 'prompt' ? void promptInstall() : setGuide(true))}>{install === 'prompt' ? 'Pasang' : 'Caranya'}</button>,
    });
  }
  if (push === 'on' || push === 'off') {
    items.push({
      key: 'push', icon: <Bell className="size-5" />, label: 'Notifikasi', done: push === 'on',
      sub: push === 'on' ? 'Aktif di perangkat ini' : 'Pengingat presensi dan kabar persetujuan',
      action: <button type="button" className={ACTION} disabled={busy} onClick={() => { setBusy(true); setError(null); enablePush().catch(setError).finally(() => { setBusy(false); refreshPush(); }); }}>Aktifkan</button>,
    });
  }
  if (f && (f.settings.mode !== 'off' || f.active || f.pending)) {
    const done = f.active || Boolean(f.pending);
    items.push({
      key: 'face', icon: <ScanFace className="size-5" />, label: 'Wajah untuk presensi', done,
      sub: f.active ? 'Terdaftar' : f.pending ? 'Terkirim, menunggu HC' : f.rejected ? 'Ditolak HC, perlu daftar ulang' : 'Tatap kamera sekitar 5 detik',
      action: <Link to="/profil/wajah" className={ACTION}>{f.rejected ? 'Daftar ulang' : 'Daftarkan'}</Link>,
    });
  }
  items.push({
    key: 'wallpaper', icon: <ImagePlus className="size-5" />, label: 'Wallpaper', done: choice.kind !== 'none', optional: true,
    sub: choice.kind !== 'none' ? 'Terpasang' : 'Opsional',
    action: <Link to="/akun/wallpaper" className={ACTION}>Pilih</Link>,
  });

  if (!items.some((it) => !it.done && !it.optional)) return null;
  const doneCount = items.filter((it) => it.done).length;

  return (
    <Card className="flex flex-col gap-1 !pb-2">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-base font-extrabold">Siapkan akun</h2>
        <span className="text-sm font-medium text-muted">{doneCount} dari {items.length}</span>
        <button type="button" aria-label="Sembunyikan kartu Siapkan akun" onClick={() => { try { localStorage.setItem(hiddenKey(user.id), '1'); } catch { /* tidak diingat */ } setHidden(true); }}
          className="-mr-2 grid size-11 place-items-center rounded-full text-muted active:bg-sub"><X className="size-5" aria-hidden="true" /></button>
      </div>
      <ErrorNote error={error} />
      <ul className="divide-y divide-line">
        {items.map((it) => (
          <li key={it.key} className="flex min-h-16 items-center gap-3 py-2">
            <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', it.done ? 'bg-ok-bg text-ok' : 'bg-sub')} aria-hidden="true">{it.done ? <CircleCheck className="size-5" /> : it.icon}</span>
            <span className="min-w-0 flex-1">
              <span className={cx('block font-medium', it.done && 'text-muted')}>{it.label}</span>
              <span className="block text-sm text-muted">{it.sub}</span>
            </span>
            {it.done ? <span className="sr-only">Selesai</span> : it.action}
          </li>
        ))}
      </ul>
      {canInstall && <InstallGuide open={guide} onClose={() => setGuide(false)} state={install} />}
    </Card>
  );
}
