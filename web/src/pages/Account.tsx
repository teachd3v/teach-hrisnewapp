import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarCog, CalendarHeart, ChevronRight, ClipboardList, KeyRound, FilePen, FileSpreadsheet, ListTree, LogOut, MapPinned, ScanFace, ScrollText, UserRound, Users } from 'lucide-react';
import { isAdmin, type Role } from '@hris/shared';
import { useAuth } from '../lib/auth';
import { Button, Card, Chip, Sheet } from '../ui';
import { PushCard } from '../components/PushCard';
import { InstallRow } from '../components/Install';
import ProfilePhoto from '../components/ProfilePhoto';
import { useProfileCard } from '../lib/profile';
import { useFaceStatus } from '../lib/face-status';

const ROLE_LABEL: Record<Role, string> = { employee: 'Karyawan', admin: 'Admin (HC)', super_admin: 'Super Admin' };

function MenuRow({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 px-4 active:bg-sub">
      <span aria-hidden="true">{icon}</span><span className="flex-1 font-medium">{label}</span><ChevronRight className="size-5 text-muted" aria-hidden="true" />
    </Link>
  );
}

export default function Account() {
  const { user, logout } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const card = useProfileCard('me').data;
  const face = useFaceStatus().data;
  // Karyawan melihat menu wajah bila verifikasi dinyalakan atau mereka sudah punya pendaftaran; admin selalu (untuk menyiapkan).
  const showFace = Boolean(user && (isAdmin(user.role) || (face && (face.settings.mode !== 'off' || face.active || face.pending))));
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex items-center gap-4">
        <ProfilePhoto fileKey={card?.photoKey} name={user?.name ?? ''} className="size-16" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{user?.name}</p>
          <p className="truncate text-sm text-muted" data-selectable>{user?.email}</p>
          <div className="mt-2">{user && <Chip tone="neutral">{ROLE_LABEL[user.role]}</Chip>}</div>
        </div>
      </Card>

      <PushCard />

      <section aria-label="Akun" className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
        <InstallRow />
        <MenuRow to="/profil" icon={<UserRound className="size-5" />} label="Profil saya" />
        {showFace && <MenuRow to="/profil/wajah" icon={<ScanFace className="size-5" />} label="Wajah untuk presensi" />}
        <MenuRow to="/ganti-password" icon={<KeyRound className="size-5" />} label="Ganti password" />
      </section>

      {user && isAdmin(user.role) && (
        <section aria-labelledby="admin-h">
          <h2 id="admin-h" className="mb-2 px-1 text-sm font-semibold text-muted">Admin</h2>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            <MenuRow to="/admin/cuti" icon={<ClipboardList className="size-5" />} label="Izin & overtime (HC)" />
            <MenuRow to="/admin/rekap" icon={<FileSpreadsheet className="size-5" />} label="Rekap & ekspor Excel" />
            <MenuRow to="/admin/koreksi-presensi" icon={<FilePen className="size-5" />} label="Koreksi presensi (HC)" />
            <MenuRow to="/admin/presensi" icon={<ScanFace className="size-5" />} label="Presensi (HC)" />
            <MenuRow to="/admin/wajah" icon={<ScanFace className="size-5" />} label="Pendaftaran wajah (HC)" />
            <MenuRow to="/admin/karyawan" icon={<Users className="size-5" />} label="Karyawan" />
            {user.role === 'super_admin' && <MenuRow to="/admin/audit" icon={<ScrollText className="size-5" />} label="Log audit" />}
            {user.role === 'super_admin' && <MenuRow to="/admin/master" icon={<ListTree className="size-5" />} label="Data master" />}
            {user.role === 'super_admin' && <MenuRow to="/admin/pengaturan-presensi" icon={<MapPinned className="size-5" />} label="Pengaturan presensi" />}
            <MenuRow to="/admin/kuota" icon={<CalendarCog className="size-5" />} label="Kuota cuti" />
            <MenuRow to="/admin/libur" icon={<CalendarHeart className="size-5" />} label="Hari libur" />
          </div>
        </section>
      )}

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
