import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Home from './pages/Home';
import Spike from './pages/Spike';
import Leave from './pages/Leave';
import Approvals from './pages/Approvals';
import AdminLeave from './pages/AdminLeave';
import Notifications from './pages/Notifications';
import AdminEmployees from './pages/AdminEmployees';
import AdminQuotas from './pages/AdminQuotas';
import AdminHolidays from './pages/AdminHolidays';

const queryClient = new QueryClient();

/** Halaman yang butuh login; sesi tersimpan dipulihkan dulu sebelum memutuskan. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, mustChangePassword } = useAuth();
  const location = useLocation();
  if (loading) return <p className="p-6 text-sm text-gray-500">Memuat…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (mustChangePassword) return <Navigate to="/ganti-password" replace />;
  return children;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/spike" element={<Spike />} />
            <Route path="/ganti-password" element={<ChangePassword />} />
            <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="/cuti" element={<RequireAuth><Leave /></RequireAuth>} />
            <Route path="/persetujuan" element={<RequireAuth><Approvals /></RequireAuth>} />
            <Route path="/admin/cuti" element={<RequireAuth><AdminLeave /></RequireAuth>} />
            <Route path="/admin/karyawan" element={<RequireAuth><AdminEmployees /></RequireAuth>} />
            <Route path="/admin/kuota" element={<RequireAuth><AdminQuotas /></RequireAuth>} />
            <Route path="/admin/libur" element={<RequireAuth><AdminHolidays /></RequireAuth>} />
            <Route path="/notifikasi" element={<RequireAuth><Notifications /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
