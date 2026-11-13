import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { CircleCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button, Field, PasswordInput } from '../ui';

/**
 * Ganti password. Dua keadaan:
 * - Pertama kali (password awal dari HC): sambutan singkat, lalu langsung lanjut ke penyiapan akun tanpa masuk lagi. Password awal
 *   yang baru saja dipakai masuk masih diingat di memori, jadi tidak diminta ulang (kecuali aplikasi sempat dimuat ulang).
 * - Sukarela dari menu Akun: perangkat ini tetap masuk, perangkat lain keluar.
 */
export default function ChangePassword() {
  const { user, mustChangePassword, hasInitialPassword, changePassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Dicatat saat layar dibuka: nilainya berubah begitu password tersimpan, padahal tampilan dan tujuan berikutnya bergantung pada keadaan awal.
  const [first] = useState(mustChangePassword);
  const [askCurrent] = useState(!(mustChangePassword && hasInitialPassword));
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  const leave = () => (location.key === 'default' ? navigate('/akun', { replace: true }) : navigate(-1));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setError('Konfirmasi password tidak sama');
    setError(null);
    setBusy(true);
    try {
      await changePassword(askCurrent ? current : null, next);
      if (first) navigate('/siapkan-akun', { replace: true });
      else setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-8">
        <div role="status" className="flex flex-col items-center gap-3 text-center">
          <CircleCheck className="size-12 text-ok" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Password diganti</h1>
          <p className="text-muted">Perangkat ini tetap masuk. Perangkat lain yang memakai akun Anda akan diminta masuk lagi.</p>
        </div>
        <Button onClick={leave}>Kembali</Button>
      </main>
    );
  }

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">{first ? `Selamat datang, ${user.name.split(' ')[0]}` : 'Ganti password'}</h1>
        <p className="mt-1 text-muted">{first ? 'Buat password baru untuk mulai memakai aplikasi.' : 'Perangkat ini tetap masuk; perangkat lain akan diminta masuk lagi.'}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {askCurrent && (
          <Field label={first ? 'Password awal' : 'Password saat ini'}>{(id) => <PasswordInput id={id} autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
        )}
        <Field label="Password baru" hint="Minimal 8 karakter, berisi huruf dan angka.">{(id, d) => <PasswordInput id={id} aria-describedby={d} autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />}</Field>
        <Field label="Ulangi password baru" error={error}>{(id, d) => <PasswordInput id={id} aria-describedby={d} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
        <Button type="submit" loading={busy} className="mt-2">{first ? 'Simpan dan lanjut' : 'Simpan'}</Button>
        {!first && <Button variant="ghost" onClick={leave}>Batal</Button>}
      </form>
    </main>
  );
}
