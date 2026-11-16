import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, Trash2, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFlashLinks, type FlashLink } from '../lib/flash-links';
import { Button, ErrorNote, Field, Input, Select, Sheet } from '../ui';

/** Tombol petir di pojok kanan atas beranda; membuka daftar tautan cepat. */
export function FlashLinksButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Tautan cepat" onClick={() => setOpen(true)}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-amber-500 shadow-card active:bg-sub">
        <Zap className="size-5" aria-hidden="true" />
      </button>
      <FlashLinksSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function LinkList({ heading, links, onRemove, empty }: { heading: string; links: FlashLink[]; onRemove?: (id: string) => void; empty?: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-muted">{heading}</h3>
      {links.length === 0 && empty && <p className="text-sm text-muted">{empty}</p>}
      <ul className="flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.id} className="flex items-center gap-1 rounded-2xl bg-surface shadow-card">
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 font-medium active:bg-sub">
              <span className="min-w-0 flex-1 truncate">{l.title}</span>
              <ExternalLink className="size-5 shrink-0 text-muted" aria-hidden="true" />
            </a>
            {onRemove && (
              <button type="button" aria-label={`Hapus ${l.title}`} onClick={() => onRemove(l.id)}
                className="mr-1 grid size-11 shrink-0 place-items-center rounded-full text-muted active:bg-sub">
                <Trash2 className="size-5" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FlashLinksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useFlashLinks();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [scope, setScope] = useState<'mine' | 'global'>('mine');
  const [adding, setAdding] = useState(false); // form tersembunyi sampai tombol Tambah ditekan
  const superAdmin = user?.role === 'super_admin';
  const refresh = () => void qc.invalidateQueries({ queryKey: ['flash-links'] });

  const add = useMutation({
    mutationFn: () => api('/flash-links', { method: 'POST', json: { title, url, scope } }),
    onSuccess: () => { setTitle(''); setUrl(''); setScope('mine'); setAdding(false); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/flash-links/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const onSubmit = (e: FormEvent) => { e.preventDefault(); add.mutate(); };

  return (
    <Sheet open={open} onClose={onClose} title="Tautan cepat">
      <div className="flex flex-col gap-5">
        <ErrorNote error={q.error} />
        {q.data && (
          <>
            {q.data.global.length > 0 && (
              <LinkList heading="Dari kantor" links={q.data.global} onRemove={superAdmin ? (id) => remove.mutate(id) : undefined} />
            )}
            <LinkList heading="Tautan saya" links={q.data.mine} onRemove={(id) => remove.mutate(id)} empty="Belum ada tautan pribadi. Tambahkan di bawah." />
          </>
        )}
        <ErrorNote error={remove.error} />

        {!adding ? (
          <Button variant="secondary" onClick={() => setAdding(true)}><Plus className="size-5" aria-hidden="true" />Tambah tautan</Button>
        ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl bg-sub p-4">
          <p className="font-semibold">Tautan baru</p>
          <Field label="Nama tautan">{(id) => <Input id={id} value={title} maxLength={60} placeholder="mis. Peminjaman Kendaraan" onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Field label="Alamat" hint="Harus diawali https://">{(id, d) => <Input id={id} type="url" inputMode="url" aria-describedby={d} value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} />}</Field>
          {superAdmin && (
            <Field label="Ditampilkan untuk">{(id) => (
              <Select id={id} value={scope} onChange={(e) => setScope(e.target.value as 'mine' | 'global')}>
                <option value="mine">Hanya saya</option>
                <option value="global">Semua karyawan</option>
              </Select>
            )}</Field>
          )}
          <ErrorNote error={add.error} />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => { setAdding(false); setTitle(''); setUrl(''); add.reset(); }}>Batal</Button>
            <Button type="submit" loading={add.isPending} disabled={!title.trim() || !url.trim()}>Simpan</Button>
          </div>
        </form>
        )}
      </div>
    </Sheet>
  );
}
