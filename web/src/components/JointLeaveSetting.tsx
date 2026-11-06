import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorNote, Sheet, Spinner, cx } from '../ui';

interface Setting {
  enabled: boolean;
  exemptStatusIds: string[];
  statuses: { id: string; name: string; active: boolean }[];
  year: number;
  jointDays: number;
}

/** Saklar geser. Target sentuh 48 px; status juga dibaca pembaca layar lewat role="switch". */
function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}
      className="grid min-h-12 min-w-14 shrink-0 place-items-center disabled:opacity-40"
    >
      <span className={cx('relative h-8 w-14 rounded-full border transition-colors', checked ? 'border-primary bg-primary' : 'border-field bg-sub')}>
        <span className={cx('absolute top-0.5 size-6 rounded-full transition-all', checked ? 'left-[1.625rem] bg-primary-fg' : 'left-0.5 bg-muted')} />
      </span>
    </button>
  );
}

/** Kebijakan cuti bersama memotong Cuti Tahunan. Admin hanya melihat; super admin mengubah. */
export default function JointLeaveSetting() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin';
  const panelId = useId();
  const q = useQuery({ queryKey: ['joint-leave-setting'], queryFn: () => api<Setting>('/admin/settings/joint-leave') });
  const [open, setOpen] = useState(false);
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
    <Card className="flex flex-col !p-0">
      <div className="flex items-center gap-2 pl-4 pr-2">
        <button
          type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}
          className="flex min-h-16 flex-1 items-center gap-2 py-3 text-left"
        >
          <span className="flex-1">
            <span className="block font-semibold">Cuti bersama memotong Cuti Tahunan</span>
            <span className="block text-sm text-muted">{s.enabled ? 'Aktif' : 'Mati'} · {s.jointDays} hari cuti bersama {s.year}</span>
          </span>
          <ChevronDown className={cx('size-5 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
        <Switch checked={s.enabled} disabled={!canEdit || save.isPending} onChange={() => setConfirm(true)} label="Cuti bersama memotong Cuti Tahunan" />
      </div>

      {open && (
        <div id={panelId} className="flex flex-col gap-3 border-t border-line p-4">
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

          <ErrorNote error={confirm ? null : save.error} />
          {canEdit ? (
            <Button disabled={!dirty} loading={save.isPending && !confirm} onClick={() => save.mutate({ exemptStatusIds: exempt })}>Simpan pengecualian</Button>
          ) : (
            <p className="text-sm text-muted">Hanya super admin yang dapat mengubah pengaturan ini.</p>
          )}
        </div>
      )}

      <Sheet open={confirm} onClose={() => setConfirm(false)} title={s.enabled ? 'Matikan potongan cuti bersama?' : 'Aktifkan potongan cuti bersama?'}>
        <p className="mb-4 text-muted">
          {s.enabled
            ? 'Saldo Cuti Tahunan semua karyawan dikembalikan sebanyak potongan cuti bersama. Karyawan yang terdampak akan menerima notifikasi.'
            : `Saldo Cuti Tahunan semua karyawan aktif (di luar pengecualian) berkurang ${s.jointDays} hari untuk ${s.year}. Karyawan yang terdampak akan menerima notifikasi.`}
        </p>
        <ErrorNote error={confirm ? save.error : null} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirm(false)}>Batal</Button>
          <Button loading={save.isPending} onClick={() => save.mutate({ enabled: !s.enabled })}>{s.enabled ? 'Matikan' : 'Aktifkan'}</Button>
        </div>
      </Sheet>
    </Card>
  );
}
