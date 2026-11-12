import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LocateFixed, MapPin, Plus } from 'lucide-react';
import { FACE_LIVE_THRESHOLD_RANGE, FACE_THRESHOLD_RANGE, policyText, type AttendancePolicy, type FaceMode, type OfficeLocation } from '@hris/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getPosition } from '../lib/geo';
import { fmtLongDate } from '../lib/attendance-types';
import { useFaceStatus } from '../lib/face-status';
import { Button, Card, Chip, ErrorNote, Field, Input, Select, Sheet, Spinner } from '../ui';

interface Settings { today: string; locations: OfficeLocation[]; policies: (AttendancePolicy & { id?: string })[]; current: AttendancePolicy }
const MODE_LABEL = { flag: 'Hanya ditandai', block: 'Blokir di luar radius' } as const;

const addDays = (ymd: string, n: number) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Pengaturan presensi (super admin): aturan jam masuk/toleransi/mode lokasi dan lokasi kantor. Admin hanya melihat. */
export default function AdminAttendanceSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin';
  const q = useQuery({ queryKey: ['att-settings'], queryFn: () => api<Settings>('/attendance-settings') });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['att-settings'] }); void qc.invalidateQueries({ queryKey: ['att-today'] }); };

  if (q.isPending) return <Spinner />;
  if (!q.data) return <ErrorNote error={q.error} />;
  const s = q.data;
  return (
    <div className="flex flex-col gap-6">
      {!canEdit && <p className="rounded-xl bg-sub p-3 text-sm text-muted">Hanya super admin yang dapat mengubah pengaturan ini.</p>}
      <PolicySection s={s} canEdit={canEdit} onChanged={refresh} />
      <LocationSection s={s} canEdit={canEdit} onChanged={refresh} />
      <FaceSection canEdit={canEdit} />
    </div>
  );
}

// ------------------------------------------------------------------ aturan jam masuk

function PolicySection({ s, canEdit, onChanged }: { s: Settings; canEdit: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [workStart, setWorkStart] = useState(s.current.workStart);
  const [grace, setGrace] = useState(String(s.current.graceMinutes));
  const [mode, setMode] = useState<AttendancePolicy['locationMode']>(s.current.locationMode);
  const [from, setFrom] = useState(addDays(s.today, 1));
  const scheduled = s.policies.filter((p) => p.effectiveFrom > s.today);
  const graceNum = Number(grace);
  const graceOk = grace.trim() !== '' && Number.isInteger(graceNum) && graceNum >= 0 && graceNum <= 120;

  const save = useMutation({
    mutationFn: () => api('/attendance-settings/policy', { method: 'PUT', json: { effectiveFrom: from, workStart, graceMinutes: graceNum, locationMode: mode } }),
    onSuccess: () => { setOpen(false); onChanged(); },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/attendance-settings/policy/${id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
  });
  const onOpen = () => { setWorkStart(s.current.workStart); setGrace(String(s.current.graceMinutes)); setMode(s.current.locationMode); setFrom(addDays(s.today, 1)); save.reset(); setOpen(true); };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); if (graceOk && workStart) save.mutate(); };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="pol-h">
      <h2 id="pol-h" className="text-lg font-semibold">Aturan jam masuk</h2>
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-muted">Berlaku sekarang</p>
        <p className="font-semibold">{policyText(s.current).replace(/^./, (c) => c.toUpperCase())}</p>
        <div><Chip tone={s.current.locationMode === 'block' ? 'warn' : 'neutral'}>Lokasi: {MODE_LABEL[s.current.locationMode]}</Chip></div>
        <p className="text-sm text-muted">Perubahan tidak mengubah riwayat: terlambat dihitung dengan aturan yang berlaku pada tanggal presensinya.</p>
      </Card>

      {scheduled.map((p) => (
        <Card key={p.effectiveFrom} className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm text-muted">Dijadwalkan mulai {fmtLongDate(p.effectiveFrom)}</p>
            <p className="font-semibold">{policyText(p).replace(/^./, (c) => c.toUpperCase())}</p>
            <p className="text-sm text-muted">Lokasi: {MODE_LABEL[p.locationMode]}</p>
          </div>
          {canEdit && p.id && <Button variant="secondary" loading={cancel.isPending} onClick={() => cancel.mutate(p.id!)}>Batalkan</Button>}
        </Card>
      ))}
      <ErrorNote error={cancel.error} />
      {canEdit && <Button onClick={onOpen}>Ubah aturan</Button>}

      <Sheet open={open} onClose={() => setOpen(false)} title="Ubah aturan presensi">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Jam masuk paling lambat (WIB)">{(id) => <Input id={id} type="time" required value={workStart} onChange={(e) => setWorkStart(e.target.value)} />}</Field>
          <Field label="Toleransi keterlambatan (menit)" hint="Terlambat bila lewat jam masuk + toleransi; menit terlambat dihitung dari jam masuk." error={graceOk ? null : 'Isi bilangan bulat 0-120'}>
            {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value)} />}
          </Field>
          <Field label="Lokasi di luar radius" hint={mode === 'block' ? 'Presensi di luar radius ditolak (ditambah margin akurasi GPS maks. 100 m). Lokasi wajib; karyawan dengan Dinas Luar Kota yang disetujui dibebaskan.' : 'Presensi tetap diterima, hanya ditandai untuk HC.'}>
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={mode} onChange={(e) => setMode(e.target.value as AttendancePolicy['locationMode'])}>
                <option value="flag">{MODE_LABEL.flag}</option>
                <option value="block">{MODE_LABEL.block}</option>
              </Select>
            )}
          </Field>
          <Field label="Berlaku mulai" hint="Tidak boleh lampau. Bawaan: besok.">{(id, d) => <Input id={id} aria-describedby={d} type="date" required min={s.today} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <ErrorNote error={save.error} />
          <Button type="submit" loading={save.isPending} disabled={!graceOk || !workStart || !from}>Simpan</Button>
        </form>
      </Sheet>
    </section>
  );
}

// ------------------------------------------------------------------ lokasi kantor

interface LocForm { name: string; lat: string; lng: string; radius: string }
const EMPTY_LOC: LocForm = { name: '', lat: '', lng: '', radius: '100' };
const locForm = (o: OfficeLocation): LocForm => ({ name: o.name, lat: String(o.lat), lng: String(o.lng), radius: String(o.radiusM) });
const toNum = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));

function LocationSection({ s, canEdit, onChanged }: { s: Settings; canEdit: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState<OfficeLocation | 'new' | null>(null);
  const [f, setF] = useState<LocForm>(EMPTY_LOC);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const set = <K extends keyof LocForm>(k: K, v: string) => setF((cur) => ({ ...cur, [k]: v }));

  const lat = toNum(f.lat), lng = toNum(f.lng), radius = toNum(f.radius);
  const latOk = Number.isFinite(lat) && Math.abs(lat) <= 90;
  const lngOk = Number.isFinite(lng) && Math.abs(lng) <= 180;
  const radiusOk = Number.isInteger(radius) && radius >= 20 && radius <= 5000;
  const valid = Boolean(f.name.trim()) && latOk && lngOk && radiusOk;
  const isNew = editing === 'new';
  const row = editing && editing !== 'new' ? editing : null;

  const done = () => { setEditing(null); onChanged(); };
  const save = useMutation({
    mutationFn: () => {
      const json = { name: f.name, lat, lng, radiusM: radius };
      return isNew ? api('/attendance-settings/locations', { method: 'POST', json }) : api(`/attendance-settings/locations/${row!.id}`, { method: 'PATCH', json });
    },
    onSuccess: done,
  });
  const toggle = useMutation({
    mutationFn: (o: OfficeLocation) => api(`/attendance-settings/locations/${o.id}`, { method: 'PATCH', json: { active: !o.active } }),
    onSuccess: done,
  });
  const del = useMutation({
    mutationFn: (o: OfficeLocation) => api(`/attendance-settings/locations/${o.id}`, { method: 'DELETE' }),
    onSuccess: done,
  });
  function open(o: OfficeLocation | 'new') { setEditing(o); setF(o === 'new' ? EMPTY_LOC : locForm(o)); setGpsMsg(null); save.reset(); toggle.reset(); del.reset(); }
  async function useMyLocation() {
    setGpsBusy(true); setGpsMsg(null);
    try {
      const fix = await getPosition();
      setF((cur) => ({ ...cur, lat: fix.lat.toFixed(7), lng: fix.lng.toFixed(7) }));
      setGpsMsg(`Koordinat diisi dari lokasi perangkat (akurasi ±${Math.round(fix.accuracy)} m).`);
    } catch (e) { setGpsMsg(e instanceof Error ? e.message : 'Lokasi tidak tersedia.'); }
    finally { setGpsBusy(false); }
  }
  const onSubmit = (e: FormEvent) => { e.preventDefault(); if (valid) save.mutate(); };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="loc-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="loc-h" className="text-lg font-semibold">Lokasi kantor</h2>
        {canEdit && <Button variant="secondary" onClick={() => open('new')}><Plus className="size-5" aria-hidden="true" />Tambah</Button>}
      </div>
      <p className="text-sm text-muted">Presensi dinilai terhadap lokasi aktif terdekat. Di luar radius ditandai untuk HC, atau ditolak bila mode blokir aktif.</p>
      {s.locations.length === 0 && <p className="rounded-xl bg-sub p-3 text-sm">Belum ada lokasi kantor. Tanpa lokasi aktif, jarak tidak dinilai dan presensi tidak diblokir.</p>}
      <ul className="flex flex-col gap-2">
        {s.locations.map((o) => (
          <li key={o.id}>
            <button onClick={() => canEdit && open(o)} disabled={!canEdit} className={`flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left active:bg-sub ${o.active ? '' : 'opacity-60'}`}>
              <MapPin className="size-5 shrink-0 text-muted" aria-hidden="true" />
              <span className="flex-1">
                <span className="block font-semibold">{o.name}</span>
                <span className="block text-sm text-muted">{o.lat.toFixed(5)}, {o.lng.toFixed(5)} · radius {o.radiusM} m</span>
              </span>
              <Chip tone={o.active ? 'ok' : 'neutral'}>{o.active ? 'Aktif' : 'Nonaktif'}</Chip>
            </button>
          </li>
        ))}
      </ul>

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={isNew ? 'Tambah lokasi kantor' : row ? `Ubah ${row.name}` : ''}>
        {editing && (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Nama lokasi">{(id) => <Input id={id} required maxLength={60} value={f.name} onChange={(e) => set('name', e.target.value)} />}</Field>
            <Button variant="secondary" loading={gpsBusy} onClick={() => void useMyLocation()}><LocateFixed className="size-5" aria-hidden="true" />Pakai lokasi saya sekarang</Button>
            {gpsMsg && <p role="status" className="text-sm text-muted">{gpsMsg}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude" error={f.lat && !latOk ? 'Isi -90 sampai 90' : null}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={f.lat} onChange={(e) => set('lat', e.target.value)} />}</Field>
              <Field label="Longitude" error={f.lng && !lngOk ? 'Isi -180 sampai 180' : null}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={f.lng} onChange={(e) => set('lng', e.target.value)} />}</Field>
            </div>
            <Field label="Radius (meter)" hint="20 sampai 5000." error={f.radius && !radiusOk ? 'Isi bilangan bulat 20-5000' : null}>
              {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={f.radius} onChange={(e) => set('radius', e.target.value)} />}
            </Field>
            <ErrorNote error={save.error ?? toggle.error ?? del.error} />
            <Button type="submit" loading={save.isPending} disabled={!valid}>Simpan</Button>
            {row && (
              <>
                <Button variant="secondary" loading={toggle.isPending} onClick={() => toggle.mutate(row)}>{row.active ? 'Nonaktifkan' : 'Aktifkan kembali'}</Button>
                <Button variant="danger" loading={del.isPending} onClick={() => del.mutate(row)}>Hapus permanen</Button>
              </>
            )}
          </form>
        )}
      </Sheet>
    </section>
  );
}

// ------------------------------------------------------------------ verifikasi wajah

const FACE_MODE_LABEL: Record<FaceMode, string> = { off: 'Mati', flag: 'Hanya ditandai' };

/** Verifikasi wajah pada presensi (docs/FACE.md): mode dan ambang. Admin hanya melihat; hanya super admin yang mengubah. */
function FaceSection({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const status = useFaceStatus();
  const cur = status.data?.settings;
  const [mode, setMode] = useState<FaceMode | null>(null);
  const [thr, setThr] = useState<string | null>(null);
  const [live, setLive] = useState<string | null>(null);
  const m = mode ?? cur?.mode ?? 'off';
  const t = thr ?? String(cur?.threshold ?? 0.5);
  const l = live ?? String(cur?.liveThreshold ?? 0.4);
  const tn = Number(t), ln = Number(l);
  const valid = t.trim() !== '' && l.trim() !== '' && tn >= FACE_THRESHOLD_RANGE.min && tn <= FACE_THRESHOLD_RANGE.max && ln >= FACE_LIVE_THRESHOLD_RANGE.min && ln <= FACE_LIVE_THRESHOLD_RANGE.max;
  const dirty = Boolean(cur) && (m !== cur!.mode || tn !== cur!.threshold || ln !== cur!.liveThreshold);

  const save = useMutation({
    mutationFn: () => api('/face/settings', { method: 'PUT', json: { mode: m, threshold: tn, liveThreshold: ln } }),
    onSuccess: () => { setMode(null); setThr(null); setLive(null); void qc.invalidateQueries({ queryKey: ['face-status'] }); void qc.invalidateQueries({ queryKey: ['face-admin'] }); void qc.invalidateQueries({ queryKey: ['att-today'] }); },
  });
  if (!cur || cur.threshold === undefined) return null; // karyawan biasa tidak melihat ambang

  return (
    <section className="flex flex-col gap-3" aria-labelledby="face-h">
      <h2 id="face-h" className="text-lg font-semibold">Verifikasi wajah</h2>
      <p className="text-sm text-muted">Mencocokkan wajah saat presensi dengan wajah yang didaftarkan karyawan dan menilai apakah wajah di kamera asli (bukan foto/layar). Pada mode "Hanya ditandai" hasil muncul untuk HC dan presensi tidak pernah ditolak karena wajah. Berlaku langsung.</p>
      <Card className="flex flex-col gap-3">
        <Field label="Mode">{(id) => <Select id={id} disabled={!canEdit} value={m} onChange={(e) => setMode(e.target.value as FaceMode)}>{(Object.keys(FACE_MODE_LABEL) as FaceMode[]).map((k) => <option key={k} value={k}>{FACE_MODE_LABEL[k]}</option>)}</Select>}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ambang kemiripan" hint={`${FACE_THRESHOLD_RANGE.min}-${FACE_THRESHOLD_RANGE.max}. Awal 0,5.`}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" disabled={!canEdit} value={t} onChange={(e) => setThr(e.target.value)} />}</Field>
          <Field label="Ambang wajah asli" hint={`${FACE_LIVE_THRESHOLD_RANGE.min}-${FACE_LIVE_THRESHOLD_RANGE.max}. Awal 0,4.`}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" disabled={!canEdit} value={l} onChange={(e) => setLive(e.target.value)} />}</Field>
        </div>
        <p className="text-xs text-muted">Skor di bawah ambang kemiripan = "tidak cocok"; skor wajah asli di bawah ambangnya = "diduga foto/layar". Dari uji awal: orang lain ≤ 0,31, orang sama ≥ 0,78, wajah asli ≥ 0,57, serangan ≤ 0,17. Pantau hasilnya di Presensi harian sebelum mengubah ambang.</p>
        <ErrorNote error={save.error} />
        {canEdit && <Button loading={save.isPending} disabled={!dirty || !valid} onClick={() => save.mutate()}>Simpan</Button>}
      </Card>
    </section>
  );
}
