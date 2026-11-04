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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
