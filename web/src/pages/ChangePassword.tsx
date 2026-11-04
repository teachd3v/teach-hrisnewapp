import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';

export default function ChangePassword() {
  const { user, mustChangePassword, changePassword } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setError('Konfirmasi password tidak sama');
    setError(null);
    setBusy(true);
    try {
      await changePassword(current, next);
      navigate('/login', { replace: true, state: {} });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Ganti password</h1>
      {mustChangePassword && <p className="text-sm text-gray-600">Demi keamanan, ganti password awal Anda sebelum melanjutkan.</p>}
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <input className="rounded border p-2" type="password" placeholder="Password saat ini" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input className="rounded border p-2" type="password" placeholder="Password baru (min. 8, huruf & angka)" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        <input className="rounded border p-2" type="password" placeholder="Ulangi password baru" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="rounded bg-black p-2 text-white disabled:opacity-50" type="submit" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan'}
        </button>
      </form>
      <p className="text-xs text-gray-500">Setelah disimpan, Anda perlu masuk lagi dengan password baru.</p>
    </main>
  );
}
