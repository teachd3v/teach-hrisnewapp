import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Outlet, Route, RouterProvider, createBrowserRouter, createRoutesFromElements, useLocation } from 'react-router';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { StackLayout, TabLayout } from './layouts';
import { Spinner } from './ui';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Home from './pages/Home';
import Leave from './pages/Leave';
import LeaveForm from './pages/LeaveForm';
import Approvals from './pages/Approvals';
import Notifications from './pages/Notifications';
import Account from './pages/Account';
import AdminLeave from './pages/AdminLeave';
import AdminEmployees from './pages/AdminEmployees';
import AdminEmployeeForm from './pages/AdminEmployeeForm';
import AdminQuotas from './pages/AdminQuotas';
import AdminHolidays from './pages/AdminHolidays';
import AdminMaster from './pages/AdminMaster';
import AdminAttendanceSettings from './pages/AdminAttendanceSettings';
import Profile from './pages/Profile';
import OvertimeForm from './pages/OvertimeForm';
import Attendance from './pages/Attendance';
import AttendanceCapture from './pages/AttendanceCapture';
import AdminAttendance from './pages/AdminAttendance';
import AttendanceCorrection from './pages/AttendanceCorrection';
import AdminCorrections from './pages/AdminCorrections';
import AdminReport from './pages/AdminReport';
import AdminAudit from './pages/AdminAudit';
import FaceEnroll from './pages/FaceEnroll';
import AdminFace from './pages/AdminFace';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

/** Semua layar di dalam butuh login; sesi tersimpan dipulihkan dulu sebelum memutuskan. */
function RequireAuth() {
  const { user, loading, mustChangePassword } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (mustChangePassword) return <Navigate to="/ganti-password" replace />;
  return <Outlet />;
}

// `handle.title` dipakai header layout; `handle.back` = tujuan tombol kembali bila layar dibuka langsung.
// Memakai data router (useMatches membutuhkannya).
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route>
      <Route path="/login" element={<Login />} />
      <Route path="/ganti-password" element={<ChangePassword />} />

      <Route element={<RequireAuth />}>
        <Route element={<TabLayout />}>
          <Route path="/" element={<Home />} handle={{ title: 'Beranda' }} />
          <Route path="/presensi" element={<Attendance />} handle={{ title: 'Presensi' }} />
          <Route path="/cuti" element={<Leave />} handle={{ title: 'Izin' }} />
          <Route path="/notifikasi" element={<Notifications />} handle={{ title: 'Notifikasi' }} />
          <Route path="/akun" element={<Account />} handle={{ title: 'Akun' }} />
        </Route>
        <Route element={<StackLayout />}>
          <Route path="/presensi/koreksi" element={<AttendanceCorrection />} handle={{ title: 'Koreksi presensi', back: '/presensi' }} />
          <Route path="/admin/koreksi-presensi" element={<AdminCorrections />} handle={{ title: 'Koreksi presensi', back: '/akun' }} />
          <Route path="/presensi/ambil/:type" element={<AttendanceCapture />} handle={{ title: 'Presensi', back: '/presensi' }} />
          <Route path="/persetujuan" element={<Approvals />} handle={{ title: 'Persetujuan izin & overtime', back: '/cuti' }} />
          <Route path="/admin/audit" element={<AdminAudit />} handle={{ title: 'Log audit', back: '/akun' }} />
          <Route path="/admin/rekap" element={<AdminReport />} handle={{ title: 'Rekap presensi & cuti', back: '/akun' }} />
          <Route path="/admin/presensi" element={<AdminAttendance />} handle={{ title: 'Presensi harian', back: '/akun' }} />
          <Route path="/cuti/ajukan" element={<LeaveForm />} handle={{ title: 'Ajukan cuti', back: '/cuti' }} />
          <Route path="/cuti/overtime" element={<OvertimeForm />} handle={{ title: 'Ajukan overtime', back: '/cuti' }} />
          <Route path="/admin/cuti" element={<AdminLeave />} handle={{ title: 'Izin & overtime', back: '/akun' }} />
          <Route path="/admin/karyawan" element={<AdminEmployees />} handle={{ title: 'Karyawan', back: '/akun' }} />
          <Route path="/profil" element={<Profile />} handle={{ title: 'Profil saya', back: '/akun' }} />
          <Route path="/profil/wajah" element={<FaceEnroll />} handle={{ title: 'Wajah untuk presensi', back: '/akun' }} />
          <Route path="/admin/wajah" element={<AdminFace />} handle={{ title: 'Pendaftaran wajah', back: '/akun' }} />
          <Route path="/admin/karyawan/:id/profil" element={<Profile />} handle={{ title: 'Profil karyawan', back: '/admin/karyawan' }} />
          <Route path="/admin/karyawan/:id" element={<AdminEmployeeForm />} handle={{ title: 'Data karyawan', back: '/admin/karyawan' }} />
          <Route path="/admin/master" element={<AdminMaster />} handle={{ title: 'Data master', back: '/akun' }} />
          <Route path="/admin/pengaturan-presensi" element={<AdminAttendanceSettings />} handle={{ title: 'Pengaturan presensi', back: '/akun' }} />
          <Route path="/admin/kuota" element={<AdminQuotas />} handle={{ title: 'Kuota cuti', back: '/akun' }} />
          <Route path="/admin/libur" element={<AdminHolidays />} handle={{ title: 'Hari libur', back: '/akun' }} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>,
  ),
);

// Klik notifikasi saat aplikasi sudah terbuka: service worker mengirim pesan, SPA berpindah layar.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data as { type?: string; href?: string } | undefined;
    if (d?.type === 'navigate' && typeof d.href === 'string' && d.href.startsWith('/')) void router.navigate(d.href);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
