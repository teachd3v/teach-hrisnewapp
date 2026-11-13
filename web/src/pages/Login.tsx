import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { Download } from 'lucide-react';
import { promptInstall, useInstallState } from '../lib/install';
import { InstallGuide } from '../components/Install';
import { Button, Field, Input, PasswordInput, Spinner } from '../ui';

/**
 * Ajakan memasang aplikasi sebelum masuk (hanya di HP yang belum memasangnya). Memasang lebih dulu lebih nyaman: di iPhone, aplikasi
 * di Layar Utama punya penyimpanan sendiri, jadi yang masuk lewat Safari lalu memasang harus masuk sekali lagi. Android dengan dialog
 * pasang bawaan langsung memunculkannya; selain itu ditampilkan panduan langkah.
 */
function InstallOffer() {
  const state = useInstallState();
  const [guide, setGuide] = useState(false);
  if (state === 'installed' || state === 'desktop') return null;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-6">
      <Button variant="secondary" onClick={() => (state === 'prompt' ? void promptInstall() : setGuide(true))}><Download className="size-5" aria-hidden="true" />Pasang aplikasi di HP</Button>
      <p className="text-center text-sm text-muted">{state === 'ios' ? 'Pasang dulu sebelum masuk: di iPhone ini juga syarat agar notifikasi bisa aktif.' : 'Pasang dulu sebelum masuk agar bisa dibuka dari layar utama.'}</p>
      <InstallGuide open={guide} onClose={() => setGuide(false)} state={state} />
    </div>
  );
}

export default function Login() {
  const { user, loading, mustChangePassword, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner />;
  if (user) return <Navigate to={mustChangePassword ? '/ganti-password' : from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof TypeError ? 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-6 py-8">
      <div className="my-auto flex flex-col gap-8">
      <div>
        <img src="/icons/logo-mark-256.png" alt="" height={64} className="mb-4 h-16 w-auto" />
        <h1 className="text-3xl font-bold">HRIS TEACH</h1>
        <p className="mt-1 text-muted">Masuk dengan akun karyawan Anda.</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email">
          {(id) => <Input id={id} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" error={error}>
          {(id, d) => <PasswordInput id={id} aria-describedby={d} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" loading={busy} className="mt-2">Masuk</Button>
      </form>
      <InstallOffer />
      </div>
      <footer className="text-center text-xs text-muted">IT TEACH GREAT Edunesia . 2026 v2.0</footer>
    </main>
  );
}
