import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, Chip, ErrorNote, Sheet, Spinner } from '../ui';

interface Setting {
  enabled: boolean;
  exemptStatusIds: string[];
  statuses: { id: string; name: string; active: boolean }[];
  year: number;
  jointDays: number;
}

/** Kebijakan cuti bersama memotong Cuti Tahunan. Admin hanya melihat; super admin mengubah. */
export default function JointLeaveSetting() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin';
  const q = useQuery({ queryKey: ['joint-leave-setting'], queryFn: () => api<Setting>('/admin/settings/joint-leave') });
  const [confirm, setConfirm] = useState(false);
  const [exempt, setExempt] = useState<string[]>([]);
  useEffect(() => { if (q.data) setExempt(q.data.exemptStatusIds); }, [q.data]);

  const save = useMutation({
    mutationFn: (json: { enabled?: boolean; exemptStatusIds?: string[] }) => api('/admin/settings/joint-leave', { method: 'PUT', json }),
    onSuccess: () => {
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ['joint-leave-setting'] });
      void qc.invalidateQueries({ queryKey: ['admin-quota'] });
    },
  });

  if (q.isPending) return <Spinner />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const s = q.data;
  const dirty = JSON.stringify([...exempt].sort()) !== JSON.stringify([...s.exemptStatusIds].sort());
  const toggle = (id: string) => setExempt((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Cuti bersama memotong Cuti Tahunan</p>
          <p className="text-sm text-muted">Cuti bersama {s.year} (hari kerja): {s.jointDays} hari.</p>
        </div>
        <Chip tone={s.enabled ? 'ok' : 'neutral'}>{s.enabled ? 'Aktif' : 'Mati'}</Chip>
      </div>
      <p className="text-sm text-muted">
        Bila aktif, setiap cuti bersama mengurangi 1 hari saldo Cuti Tahunan semua karyawan aktif, kecuali status yang dikecualikan dan hari sebelum tanggal masuk.
        Perubahan berlaku langsung ke saldo dan karyawan yang terdampak diberi notifikasi.
      </p>

      <fieldset className="flex flex-col gap-1" disabled={!canEdit || save.isPending}>
        <legend className="mb-1 text-sm font-medium">Status yang tidak dipotong</legend>
        {s.statuses.filter((x) => x.active || exempt.includes(x.id)).map((x) => (
          <label key={x.id} className="flex min-h-12 items-center gap-3">
            <input type="checkbox" className="size-5" checked={exempt.includes(x.id)} onChange={() => toggle(x.id)} />
            <span>{x.name}{x.active ? '' : ' (nonaktif)'}</span>
          </label>
        ))}
      </fieldset>

      <ErrorNote error={save.error} />
      {canEdit ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" disabled={!dirty} loading={save.isPending && !confirm} onClick={() => save.mutate({ exemptStatusIds: exempt })}>Simpan pengecualian</Button>
          <Button variant={s.enabled ? 'secondary' : 'primary'} onClick={() => setConfirm(true)}>{s.enabled ? 'Matikan' : 'Aktifkan'}</Button>
        </div>
      ) : (
        <p className="text-sm text-muted">Hanya super admin yang dapat mengubah pengaturan ini.</p>
      )}

      <Sheet open={confirm} onClose={() => setConfirm(false)} title={s.enabled ? 'Matikan potongan cuti bersama?' : 'Aktifkan potongan cuti bersama?'}>
        <p className="mb-4 text-muted">
          {s.enabled
            ? 'Saldo Cuti Tahunan semua karyawan dikembalikan sebanyak potongan cuti bersama. Karyawan yang terdampak akan menerima notifikasi.'
            : `Saldo Cuti Tahunan semua karyawan aktif (di luar pengecualian) berkurang ${s.jointDays} hari untuk ${s.year}. Karyawan yang terdampak akan menerima notifikasi.`}
        </p>
        <ErrorNote error={save.error} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirm(false)}>Batal</Button>
          <Button loading={save.isPending} onClick={() => save.mutate({ enabled: !s.enabled })}>{s.enabled ? 'Matikan' : 'Aktifkan'}</Button>
        </div>
      </Sheet>
    </Card>
  );
}
