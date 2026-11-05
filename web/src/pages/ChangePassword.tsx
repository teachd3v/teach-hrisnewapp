import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { Button, Field, PasswordInput } from '../ui';

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
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">Ganti password</h1>
        <p className="mt-1 text-muted">{mustChangePassword ? 'Demi keamanan, ganti password awal Anda sebelum melanjutkan.' : 'Setelah disimpan, Anda perlu masuk lagi dengan password baru.'}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Password saat ini">{(id) => <PasswordInput id={id} autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
        <Field label="Password baru" hint="Minimal 8 karakter, berisi huruf dan angka.">{(id, d) => <PasswordInput id={id} aria-describedby={d} autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />}</Field>
        <Field label="Ulangi password baru" error={error}>{(id, d) => <PasswordInput id={id} aria-describedby={d} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
        <Button type="submit" loading={busy} className="mt-2">Simpan</Button>
        {!mustChangePassword && <Button variant="ghost" onClick={() => navigate(-1)}>Batal</Button>}
      </form>
    </main>
  );
}
