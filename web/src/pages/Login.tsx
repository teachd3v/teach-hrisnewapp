import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Download } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { promptInstall, useInstallState } from '../lib/install';
import { InstallGuide } from '../components/Install';
import { Button, Field, Input, PasswordInput, Spinner } from '../ui';

/**
 * Halaman masuk. Di HP yang belum memasang aplikasi, pemasangan diwajibkan dulu: tombol "Install App" ada di atas dan formulir masuk
 * dikunci sampai aplikasi dibuka dari ikonnya (mode terpasang). Alasannya: aplikasi terpasang punya penyimpanan sendiri (yang masuk
 * lewat browser lalu memasang harus masuk lagi), dan di iPhone notifikasi mensyaratkan pemasangan. Android dengan dialog pasang bawaan
 * langsung memunculkannya; iPhone tidak punya dialog itu, jadi selalu diberi panduan langkah (begitu juga Android tanpa dialog).
 * Di komputer dan di aplikasi yang sudah terpasang, halaman ini tampil biasa tanpa tombol pasang.
 */
export default function Login() {
  const { user, loading, mustChangePassword, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const install = useInstallState();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  const [accepted, setAccepted] = useState(false); // dialog pasang Android baru saja disetujui di tab ini

  if (loading) return <Spinner />;
  if (user) return <Navigate to={mustChangePassword ? '/ganti-password' : from} replace />;

  // Tab browser tidak bisa tahu apakah aplikasinya sudah terpasang; yang bisa dipastikan hanya "sedang berjalan sebagai aplikasi".
  const mustInstall = install !== 'installed' && install !== 'desktop';

  async function onInstall() {
    if (install !== 'prompt') { setGuide(true); return; }
    const outcome = await promptInstall();
    if (outcome === 'accepted') setAccepted(true);
    else if (outcome === 'unavailable') setGuide(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mustInstall) return; // tombolnya nonaktif, tetapi Enter di kolom tetap mengirim formulir
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
        <p id="login-lead" className="mt-1 text-muted">{mustInstall ? 'Install aplikasinya dulu, lalu masuk dari ikonnya di layar utama.' : 'Masuk dengan akun karyawan Anda.'}</p>
      </div>
      {mustInstall && (
        <div className="flex flex-col gap-3">
          <Button onClick={() => void onInstall()}><Download className="size-5" aria-hidden="true" />Install App</Button>
          {accepted && <p role="status" className="rounded-xl bg-ok-bg p-3 text-sm font-medium text-ok">Aplikasi terpasang. Buka dari ikon HRIS TEACH di layar utama untuk masuk.</p>}
          <InstallGuide open={guide} onClose={() => setGuide(false)} state={install} />
        </div>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-describedby={mustInstall ? 'login-lead' : undefined}>
        <Field label="Email">
          {(id) => <Input id={id} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" required disabled={mustInstall} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" error={error}>
          {(id, d) => <PasswordInput id={id} aria-describedby={d} autoComplete="current-password" required disabled={mustInstall} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant={mustInstall ? 'secondary' : 'primary'} loading={busy} disabled={mustInstall} className="mt-2">Masuk</Button>
      </form>
      </div>
      <footer className="text-center text-xs text-muted">IT TEACH GREAT Edunesia . 2026 v2.0</footer>
    </main>
  );
}
