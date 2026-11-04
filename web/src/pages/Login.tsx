import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { Button, Field, Input, Spinner } from '../ui';

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
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-8">
      <div>
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-fg" aria-hidden="true">HT</div>
        <h1 className="text-3xl font-bold">HRIS TEACH</h1>
        <p className="mt-1 text-muted">Masuk dengan akun karyawan Anda.</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email">
          {(id) => <Input id={id} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" error={error}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" loading={busy} className="mt-2">Masuk</Button>
      </form>
    </main>
  );
}
