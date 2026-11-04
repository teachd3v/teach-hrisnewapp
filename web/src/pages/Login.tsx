import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { user, loading, mustChangePassword, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="p-6 text-sm text-gray-500">Memuat…</p>;
  if (user) return <Navigate to={mustChangePassword ? '/ganti-password' : from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof TypeError ? 'Tidak dapat terhubung ke server' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">HRIS TEACH</h1>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <input
          className="rounded border p-2" type="email" placeholder="Email" autoComplete="username"
          required value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="rounded border p-2" type="password" placeholder="Password" autoComplete="current-password"
          required value={password} onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="rounded bg-black p-2 text-white disabled:opacity-50" type="submit" disabled={busy}>
          {busy ? 'Memproses…' : 'Masuk'}
        </button>
      </form>
    </main>
  );
}
