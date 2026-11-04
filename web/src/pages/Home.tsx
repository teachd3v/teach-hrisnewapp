import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function Home() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ ok: boolean }>('/health') });
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">Beranda</h1>
      <p className="mt-2 text-sm">API: {health.isPending ? 'memeriksa…' : health.isError ? 'tidak terjangkau' : 'OK'}</p>
    </main>
  );
}
