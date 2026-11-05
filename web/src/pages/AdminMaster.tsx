import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ListX, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { MASTER_LABEL, MASTER_LABEL_LONG, optionsOf, useMaster, type MasterKind, type MasterOption } from '../lib/master';
import { Button, Card, Chip, Empty, ErrorNote, Field, Input, Segmented, Sheet, Spinner } from '../ui';

/** Kelola departemen, level, dan status kepegawaian (hanya super admin). */
export default function AdminMaster() {
  const qc = useQueryClient();
  const master = useMaster();
  const [kind, setKind] = useState<MasterKind>('department');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<MasterOption | null>(null);
  const [editName, setEditName] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['master'] });
  const items = optionsOf(master.data, kind);

  const add = useMutation({
    mutationFn: () => api('/master', { method: 'POST', json: { kind, name } }),
    onSuccess: () => { setName(''); setAdding(false); void refresh(); },
  });
  const update = useMutation({
    mutationFn: (v: { id: string; name?: string; active?: boolean }) => api(`/master/${v.id}`, { method: 'PATCH', json: { name: v.name, active: v.active } }),
    onSuccess: () => { setEditing(null); void refresh(); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/master/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setEditing(null); void refresh(); },
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api(`/master/${kind}/order`, { method: 'PUT', json: { ids } }),
    onSettled: () => void refresh(),
  });

  function move(i: number, dir: -1 | 1) {
    const ids = items.map((o) => o.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  }
  function open(o: MasterOption) { setEditing(o); setEditName(o.name); update.reset(); del.reset(); }
  function onAdd(e: FormEvent) { e.preventDefault(); add.mutate(); }

  return (
    <div className="flex flex-col gap-4">
      <Segmented value={kind} onChange={setKind} options={(Object.keys(MASTER_LABEL) as MasterKind[]).map((k) => ({ value: k, label: MASTER_LABEL[k] }))} />
      <p className="text-sm text-muted">{MASTER_LABEL_LONG[kind]} muncul sebagai pilihan dropdown di form karyawan. Item yang sudah dipakai tidak bisa dihapus, hanya dinonaktifkan.</p>
      {master.isPending && <Spinner />}
      <ErrorNote error={master.error} />
      <ErrorNote error={reorder.error} />
      {master.data && items.length === 0 && <Empty icon={<ListX className="size-10" />}>Belum ada {MASTER_LABEL_LONG[kind].toLowerCase()}.</Empty>}
      <ul className="flex flex-col gap-2 pb-20">
        {items.map((o, i) => (
          <li key={o.id}>
            <Card className="flex items-center gap-1 !p-2">
              <button onClick={() => open(o)} className={`flex min-h-12 flex-1 flex-col items-start justify-center rounded-xl px-2 text-left active:bg-sub ${o.active ? '' : 'opacity-60'}`}>
                <span className="flex items-center gap-2 font-semibold">{o.name}{!o.active && <Chip>Nonaktif</Chip>}</span>
                <span className="text-sm text-muted">{o.usedBy > 0 ? `${o.usedBy} karyawan` : 'Belum dipakai'}</span>
              </button>
              <button aria-label={`Naikkan ${o.name}`} disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} className="grid size-12 place-items-center rounded-full active:bg-sub disabled:opacity-30"><ArrowUp className="size-5" aria-hidden="true" /></button>
              <button aria-label={`Turunkan ${o.name}`} disabled={i === items.length - 1 || reorder.isPending} onClick={() => move(i, 1)} className="grid size-12 place-items-center rounded-full active:bg-sub disabled:opacity-30"><ArrowDown className="size-5" aria-hidden="true" /></button>
            </Card>
          </li>
        ))}
      </ul>
      <button aria-label={`Tambah ${MASTER_LABEL_LONG[kind].toLowerCase()}`} onClick={() => { setAdding(true); add.reset(); }}
        className="pb-safe fixed right-4 bottom-6 z-10 grid size-14 place-items-center rounded-full bg-primary text-primary-fg shadow-lg active:bg-black"><Plus className="size-7" aria-hidden="true" /></button>

      <Sheet open={adding} onClose={() => setAdding(false)} title={`Tambah ${MASTER_LABEL_LONG[kind].toLowerCase()}`}>
        <form onSubmit={onAdd} className="flex flex-col gap-4">
          <Field label="Nama">{(id) => <Input id={id} required maxLength={60} autoFocus value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <ErrorNote error={add.error} />
          <Button type="submit" loading={add.isPending}>Simpan</Button>
        </form>
      </Sheet>

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={editing ? `Ubah ${editing.name}` : ''}>
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Nama" hint={editing.usedBy > 0 ? `Perubahan nama berlaku untuk ${editing.usedBy} karyawan.` : undefined}>
              {(id, d) => <Input id={id} aria-describedby={d} maxLength={60} value={editName} onChange={(e) => setEditName(e.target.value)} />}
            </Field>
            <ErrorNote error={update.error ?? del.error} />
            <Button loading={update.isPending} disabled={!editName.trim() || editName.trim() === editing.name} onClick={() => update.mutate({ id: editing.id, name: editName })}>Simpan nama</Button>
            <Button variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ id: editing.id, active: !editing.active })}>{editing.active ? 'Nonaktifkan' : 'Aktifkan kembali'}</Button>
            {editing.usedBy === 0 && <Button variant="danger" loading={del.isPending} onClick={() => del.mutate(editing.id)}>Hapus permanen</Button>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
