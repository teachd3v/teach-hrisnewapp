import { useState } from 'react';
import { Navigate } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ScrollText, SlidersHorizontal, X } from 'lucide-react';
import { AUDIT_ACTIONS, AUDIT_GROUPS, REPORT_MIN_DATE, auditLabel, auditGroupOf, type AuditGroup } from '@hris/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useEmployees } from './AdminEmployees';
import DateField from '../components/DateField';
import { Button, Card, Chip, Empty, ErrorNote, Field, Input, Select, Sheet, Spinner } from '../ui';

interface AuditItem {
  id: string; at: string; actor_id: string | null; actor_name: string | null; action: string;
  target_type: string | null; target_id: string | null; target_label: string | null; details: unknown; ip: string | null;
}
interface Filters { group: string; actor: string; q: string; from: string; to: string }
const EMPTY: Filters = { group: '', actor: '', q: '', from: '', to: '' };

const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const fmtWhen = (iso: string, long = false) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: long ? 'long' : 'short', year: long ? 'numeric' : undefined, hour: '2-digit', minute: '2-digit', second: long ? '2-digit' : undefined, hour12: false }).replace(/\./g, ':');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const sd = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short' }) : String(s ?? ''));
const range = (s: unknown, e: unknown) => (s === e ? sd(s) : `${sd(s)} – ${sd(e)}`);
const LOGIN_REASON: Record<string, string> = { unknown_or_inactive: 'email tidak dikenal atau akun nonaktif', bad_password: 'password salah' };

/** Ringkasan satu baris dari `details`, tanpa membuka rincian. */
function summarize(it: AuditItem): string {
  const d = obj(it.details);
  switch (it.action) {
    case 'leave.submitted': return `${d.type} · ${range(d.start, d.end)} (${d.days} hari)`;
    case 'leave.manager_decision': case 'leave.hc_decision': case 'leave.hc_override':
      return `${d.decision} · ${d.type} · ${range(d.start, d.end)}${d.reason ? ` · alasan ambil alih: ${d.reason}` : d.notes ? ` · ${d.notes}` : ''}`;
    case 'leave.quota_set': return `${d.leaveType} ${d.year}: ${d.quota === null ? 'kembali ke bawaan' : `${d.quota} hari`}`;
    case 'attendance.clock_in': case 'attendance.clock_out': return `jarak ${d.distance == null ? 'tanpa lokasi' : `${d.distance} m`}${d.face === false ? ' · wajah tidak terdeteksi' : ''}`;
    case 'attendance.correction_requested': return `${sd(d.date)} · ${d.kind === 'both' ? 'masuk dan pulang' : 'jam pulang'}`;
    case 'attendance.correction_decision': return `${d.decision} · ${sd(d.date)} · ${d.in ? `masuk ${d.in}, ` : ''}pulang ${d.out}${d.notes ? ` · ${d.notes}` : ''}`;
    case 'employee.updated': return `diubah: ${Object.keys(obj(d.after)).join(', ') || '-'}`;
    case 'employee.created': return `${d.email} · peran ${d.role}`;
    case 'auth.login_failed': return LOGIN_REASON[String(d.reason)] ?? String(d.reason ?? '');
    case 'file.access': return it.target_type === 'attendance_photo' ? 'foto presensi' : 'lampiran cuti';
    case 'report.range': return `${d.employees} karyawan`;
    case 'master.updated': return `${JSON.stringify(obj(d.before))} → ${JSON.stringify(obj(d.after))}`;
    default: {
      const entries = Object.entries(d).slice(0, 2).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
      return entries.join(' · ');
    }
  }
}

const who = (it: AuditItem) => it.actor_name ?? (it.action.startsWith('auth.') ? 'Belum masuk' : 'Sistem');

function DetailRow({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return <div className="py-2"><dt className="text-xs text-muted">{k}</dt><dd className="break-words text-sm" data-selectable>{v}</dd></div>;
}

export default function AdminAudit() {
  const { user } = useAuth();
  const emps = useEmployees();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AuditItem | null>(null);
  const today = todayWib();

  const list = useInfiniteQuery({
    queryKey: ['audit', filters], initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
      if (pageParam) p.set('cursor', pageParam);
      return api<{ items: AuditItem[]; nextCursor: string | null }>(`/audit?${p}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (user && user.role !== 'super_admin') return <Navigate to="/akun" replace />;

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const chips: { label: string; clear: () => void }[] = [
    filters.group && { label: AUDIT_GROUPS.find((g) => g.key === filters.group)?.label ?? filters.group, clear: () => setFilters({ ...filters, group: '' }) },
    filters.actor && { label: emps.data?.find((e) => e.id === filters.actor)?.name ?? 'Pelaku', clear: () => setFilters({ ...filters, actor: '' }) },
    filters.q && { label: `“${filters.q}”`, clear: () => setFilters({ ...filters, q: '' }) },
    filters.from && { label: `dari ${sd(filters.from)}`, clear: () => setFilters({ ...filters, from: '' }) },
    filters.to && { label: `sampai ${sd(filters.to)}`, clear: () => setFilters({ ...filters, to: '' }) },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  const d = detail ? obj(detail.details) : {};

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => { setDraft(filters); setOpen(true); }}><SlidersHorizontal className="size-5" aria-hidden="true" />Filter{chips.length ? ` (${chips.length})` : ''}</Button>
        {chips.length > 0 && <Button variant="ghost" onClick={() => setFilters(EMPTY)}>Reset</Button>}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Filter aktif">
          {chips.map((c) => (
            <button key={c.label} onClick={c.clear} aria-label={`Hapus filter ${c.label}`} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-sub px-3 text-sm active:bg-line">{c.label}<X className="size-4" aria-hidden="true" /></button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">Log bersifat tambah-saja: tidak dapat diubah atau dihapus. Waktu dalam WIB.</p>

      {list.isPending && <Spinner />}
      <ErrorNote error={list.error} />
      {list.data && items.length === 0 && <Empty icon={<ScrollText className="size-10" />}>Tidak ada catatan pada filter ini.</Empty>}

      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id}>
            <button onClick={() => setDetail(it)} className="w-full rounded-2xl border border-line bg-surface p-3 text-left active:bg-sub">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{auditLabel(it.action)}</p>
                <time dateTime={it.at} className="shrink-0 text-xs text-muted">{fmtWhen(it.at)}</time>
              </div>
              <p className="text-sm">{who(it)}{it.target_label ? <span className="text-muted"> → {it.target_label}</span> : null}</p>
              {summarize(it) && <p className="mt-1 line-clamp-2 text-sm text-muted">{summarize(it)}</p>}
              <div className="mt-1 flex flex-wrap gap-1">
                {AUDIT_ACTIONS[it.action]?.attention && <Chip tone="warn">Perlu perhatian</Chip>}
                {auditGroupOf(it.action) && <Chip>{AUDIT_GROUPS.find((g) => g.key === auditGroupOf(it.action))?.label}</Chip>}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {list.hasNextPage && <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Muat lebih banyak</Button>}
      {list.data && !list.hasNextPage && items.length > 0 && <p className="py-2 text-center text-xs text-muted">Sudah sampai catatan paling awal.</p>}

      <Sheet open={open} onClose={() => setOpen(false)} title="Filter log">
        <div className="flex flex-col gap-4">
          <Field label="Kategori">{(id) => <Select id={id} value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })}><option value="">Semua kategori</option>{AUDIT_GROUPS.map((g: { key: AuditGroup; label: string }) => <option key={g.key} value={g.key}>{g.label}</option>)}</Select>}</Field>
          <Field label="Pelaku">{(id) => <Select id={id} value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })}><option value="">Semua pelaku</option>{emps.data?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>}</Field>
          <Field label="Cari" hint="Nama pelaku, nama target, jenis aksi, atau alamat IP.">{(id, dd) => <Input id={id} aria-describedby={dd} value={draft.q} maxLength={80} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <DateField label="Dari tanggal" value={draft.from} min={REPORT_MIN_DATE} max={draft.to && draft.to < today ? draft.to : today} today={today} onChange={(v) => setDraft({ ...draft, from: v, to: draft.to && v > draft.to ? v : draft.to })} />
              {draft.from && <button className="mt-1 min-h-9 text-sm underline" onClick={() => setDraft({ ...draft, from: '' })}>Hapus</button>}
            </div>
            <div>
              <DateField label="Sampai tanggal" value={draft.to} min={draft.from || REPORT_MIN_DATE} max={today} today={today} onChange={(v) => setDraft({ ...draft, to: v })} />
              {draft.to && <button className="mt-1 min-h-9 text-sm underline" onClick={() => setDraft({ ...draft, to: '' })}>Hapus</button>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setDraft(EMPTY)}>Kosongkan</Button>
            <Button onClick={() => { setFilters(draft); setOpen(false); }}>Terapkan</Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? auditLabel(detail.action) : ''}>
        {detail && (
          <dl className="divide-y divide-line">
            <DetailRow k="Waktu (WIB)" v={fmtWhen(detail.at, true)} />
            <DetailRow k="Pelaku" v={detail.actor_name ? `${detail.actor_name}${detail.actor_id ? ` (${detail.actor_id})` : ''}` : who(detail)} />
            <DetailRow k="Aksi" v={`${auditLabel(detail.action)} — ${detail.action}`} />
            <DetailRow k="Target" v={[detail.target_type, detail.target_label].filter(Boolean).join(' · ')} />
            <DetailRow k="ID target" v={detail.target_id} />
            <DetailRow k="Alamat IP" v={detail.ip} />
            {Object.entries(d).map(([k, v]) => <DetailRow key={k} k={k} v={typeof v === 'object' && v !== null ? JSON.stringify(v, null, 1) : String(v)} />)}
            {typeof detail.details === 'string' && <DetailRow k="Rincian" v={detail.details} />}
          </dl>
        )}
      </Sheet>
    </div>
  );
}
