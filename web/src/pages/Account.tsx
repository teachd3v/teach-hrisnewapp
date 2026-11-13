import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  CalendarCheck, CalendarCog, CalendarHeart, ChevronDown, ChevronRight, ClipboardList, Compass, ImagePlus, KeyRound, FilePen, FileSpreadsheet, ListTree, LogOut, MapPinned, ScanFace, ScrollText, UserRound, Users,
} from 'lucide-react';
import { isAdmin, type Role } from '@hris/shared';
import { useAuth } from '../lib/auth';
import { Button, Card, Chip, Sheet, cx } from '../ui';
import { PushCard } from '../components/PushCard';
import { InstallRow } from '../components/Install';
import ProfilePhoto from '../components/ProfilePhoto';
import { useProfileCard } from '../lib/profile';
import { useFaceStatus } from '../lib/face-status';
import { useAdminQueues } from '../lib/admin-queues';
import { requestTour } from '../lib/guide';
import FirstHint from '../components/FirstHint';

const ROLE_LABEL: Record<Role, string> = { employee: 'Karyawan', admin: 'Admin (HC)', super_admin: 'Super Admin' };

/** Lencana jumlah pekerjaan menunggu. Teks alternatif menyebut artinya (bukan hanya angka). */
function CountBadge({ n }: { n?: number }) {
  if (!n) return null;
  return <span role="img" aria-label={`${n} menunggu`} className="grid min-w-6 place-items-center rounded-full bg-bad px-1.5 text-xs font-bold leading-6 text-white">{n > 99 ? '99+' : n}</span>;
}

function MenuRow({ to, icon, label, badge }: { to: string; icon: ReactNode; label: string; badge?: number }) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 px-4 active:bg-sub">
      <span aria-hidden="true">{icon}</span><span className="flex-1 font-medium">{label}</span><CountBadge n={badge} /><ChevronRight className="size-5 text-muted" aria-hidden="true" />
    </Link>
  );
}

interface MenuItem { to: string; icon: ReactNode; label: string; badge?: number; superOnly?: boolean }
interface MenuGroup { key: string; title: string; defaultOpen: boolean; items: MenuItem[] }

const STORE_KEY = 'hris.adminMenu.v1';
function loadOpen(): Record<string, boolean> {
  try { const v: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}'); return v && typeof v === 'object' ? (v as Record<string, boolean>) : {}; } catch { return {}; }
}
function saveOpen(v: Record<string, boolean>) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* penyimpanan tidak tersedia: pilihan tidak diingat */ }
}

/**
 * Menu admin berkelompok. "Persetujuan" (pekerjaan harian) terbuka secara bawaan; kelompok lain tertutup. Pilihan buka/tutup diingat di perangkat.
 * Kelompok yang tertutup menampilkan jumlah total pekerjaan menunggu di dalamnya, jadi tidak ada yang terlewat.
 */
function AdminMenu({ superAdmin }: { superAdmin: boolean }) {
  const q = useAdminQueues().data;
  const [open, setOpen] = useState<Record<string, boolean>>(loadOpen);
  const groups: MenuGroup[] = [
    {
      key: 'approvals', title: 'Persetujuan', defaultOpen: true, items: [
        { to: '/admin/cuti', icon: <ClipboardList className="size-5" />, label: 'Izin & overtime', badge: q ? q.leave + q.overtime : undefined },
        { to: '/admin/koreksi-presensi', icon: <FilePen className="size-5" />, label: 'Koreksi presensi', badge: q?.corrections },
        { to: '/admin/wajah', icon: <ScanFace className="size-5" />, label: 'Pendaftaran wajah', badge: q?.face },
      ],
    },
    {
      key: 'attendance', title: 'Presensi & laporan', defaultOpen: false, items: [
        { to: '/admin/presensi', icon: <CalendarCheck className="size-5" />, label: 'Presensi harian' },
        { to: '/admin/rekap', icon: <FileSpreadsheet className="size-5" />, label: 'Rekap & ekspor Excel' },
      ],
    },
    {
      key: 'data', title: 'Kelola data', defaultOpen: false, items: [
        { to: '/admin/karyawan', icon: <Users className="size-5" />, label: 'Karyawan' },
        { to: '/admin/kuota', icon: <CalendarCog className="size-5" />, label: 'Kuota cuti' },
        { to: '/admin/libur', icon: <CalendarHeart className="size-5" />, label: 'Hari libur' },
        { to: '/admin/master', icon: <ListTree className="size-5" />, label: 'Data master', superOnly: true },
      ],
    },
    {
      key: 'system', title: 'Sistem', defaultOpen: false, items: [
        { to: '/admin/pengaturan-presensi', icon: <MapPinned className="size-5" />, label: 'Pengaturan presensi', superOnly: true },
        { to: '/admin/audit', icon: <ScrollText className="size-5" />, label: 'Log audit', superOnly: true },
      ],
    },
  ];
  const visible = groups.map((g) => ({ ...g, items: g.items.filter((i) => !i.superOnly || superAdmin) })).filter((g) => g.items.length > 0);
  const toggle = (g: MenuGroup) => setOpen((prev) => { const next = { ...prev, [g.key]: !(prev[g.key] ?? g.defaultOpen) }; saveOpen(next); return next; });

  return (
    <section aria-labelledby="admin-h" className="flex flex-col gap-2">
      <h2 id="admin-h" className="px-1 text-sm font-semibold text-muted">Admin</h2>
      {visible.map((g) => {
        const isOpen = open[g.key] ?? g.defaultOpen;
        const total = g.items.reduce((t, i) => t + (i.badge ?? 0), 0);
        const panel = `admin-menu-${g.key}`;
        return (
          <div key={g.key} className="overflow-hidden rounded-2xl bg-surface shadow-card">
            <button type="button" aria-expanded={isOpen} aria-controls={panel} onClick={() => toggle(g)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left font-semibold active:bg-sub">
              <span className="flex-1">{g.title}</span>
              {!isOpen && <CountBadge n={total} />}
              <ChevronDown className={cx('size-5 text-muted transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
            </button>
            {isOpen && (
              <div id={panel} className="divide-y divide-line border-t border-line">
                {g.items.map((i) => <MenuRow key={i.to} to={i.to} icon={i.icon} label={i.label} badge={i.badge} />)}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export default function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const card = useProfileCard('me').data;
  const face = useFaceStatus().data;
  // Karyawan melihat menu wajah bila verifikasi dinyalakan atau mereka sudah punya pendaftaran; admin selalu (untuk menyiapkan).
  const showFace = Boolean(user && (isAdmin(user.role) || (face && (face.settings.mode !== 'off' || face.active || face.pending))));
  return (
    <div className="flex flex-col gap-5">
      <FirstHint id="akun">Atur notifikasi, wajah untuk presensi, wallpaper, dan password di sini. Tur singkat bisa diulang lewat "Lihat panduan lagi".</FirstHint>
      <Card className="flex items-center gap-4">
        <ProfilePhoto fileKey={card?.photoKey} name={user?.name ?? ''} className="size-16" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{user?.name}</p>
          <p className="truncate text-sm text-muted" data-selectable>{user?.email}</p>
          <div className="mt-2">{user && <Chip tone="neutral">{ROLE_LABEL[user.role]}</Chip>}</div>
        </div>
      </Card>

      <PushCard />

      <section aria-label="Akun" className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-card">
        <InstallRow />
        <MenuRow to="/profil" icon={<UserRound className="size-5" />} label="Profil saya" />
        {showFace && <MenuRow to="/profil/wajah" icon={<ScanFace className="size-5" />} label="Wajah untuk presensi" />}
        <MenuRow to="/akun/wallpaper" icon={<ImagePlus className="size-5" />} label="Wallpaper" />
        <MenuRow to="/ganti-password" icon={<KeyRound className="size-5" />} label="Ganti password" />
        <button type="button" onClick={() => { if (user) requestTour(user.id); navigate('/'); }} className="flex min-h-14 w-full items-center gap-3 px-4 text-left active:bg-sub">
          <Compass className="size-5" aria-hidden="true" /><span className="flex-1 font-medium">Lihat panduan lagi</span><ChevronRight className="size-5 text-muted" aria-hidden="true" />
        </button>
      </section>

      {user && isAdmin(user.role) && <AdminMenu superAdmin={user.role === 'super_admin'} />}

      <Button variant="secondary" onClick={() => setConfirm(true)}><LogOut className="size-5" aria-hidden="true" />Keluar</Button>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Keluar dari akun?">
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirm(false)}>Batal</Button>
          <Button variant="danger" loading={busy} onClick={() => { setBusy(true); void logout(); }}>Keluar</Button>
        </div>
      </Sheet>
    </div>
  );
}
