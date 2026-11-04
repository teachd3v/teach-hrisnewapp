import { useAuth } from '../lib/auth';

export default function Home() {
  const { user, logout } = useAuth();
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">Beranda</h1>
      <p className="mt-2 text-sm">Halo, {user?.name}</p>
      <button className="mt-4 rounded border px-3 py-1 text-sm" onClick={() => void logout()}>Keluar</button>
    </main>
  );
}
