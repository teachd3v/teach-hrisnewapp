import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from '../lib/push';
import { Button, Card, ErrorNote } from '../ui';

const DISMISS_KEY = 'hris.push.dismissed';

function usePushState() {
  const [state, setState] = useState<PushState | null>(null);
  const refresh = useCallback(() => { void getPushState().then(setState); }, []);
  useEffect(refresh, [refresh]);
  return [state, refresh] as const;
}

/** Kartu pengaturan di tab Akun: aktifkan/matikan notifikasi di perangkat ini dan kirim notifikasi uji. */
export function PushCard() {
  const [state, refresh] = usePushState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null); setTestResult(null);
    try { await fn(); } catch (e) { setError(e); } finally { setBusy(false); refresh(); }
  }

  if (!state) return null;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-sub" aria-hidden="true">{state === 'on' ? <BellRing className="size-5" /> : state === 'off' ? <Bell className="size-5" /> : <BellOff className="size-5" />}</span>
        <div className="flex-1">
          <p className="font-semibold">Notifikasi di perangkat ini</p>
          <p className="text-sm text-muted">
            {state === 'on' && 'Aktif. Pengajuan, persetujuan, dan koreksi muncul di layar HP meski aplikasi tidak dibuka.'}
            {state === 'off' && 'Mati. Aktifkan agar tidak ketinggalan pengajuan dan persetujuan.'}
            {state === 'denied' && 'Diblokir di pengaturan browser. Buka pengaturan situs di browser, izinkan notifikasi, lalu muat ulang halaman ini.'}
            {state === 'ios-needs-install' && 'Di iPhone, notifikasi hanya bisa untuk aplikasi di Layar Utama: buka lewat Safari → Bagikan → Tambahkan ke Layar Utama, lalu buka dari ikon itu.'}
            {state === 'unsupported' && 'Browser ini belum mendukung notifikasi push.'}
            {state === 'tauri' && 'Notifikasi untuk aplikasi HP akan tersedia setelah integrasi Firebase (FCM).'}
          </p>
        </div>
      </div>
      <ErrorNote error={error} />
      {testResult && <p role="status" className="rounded-xl bg-sub p-3 text-sm">{testResult}</p>}
      {state === 'off' && <Button loading={busy} onClick={() => void run(enablePush)}>Aktifkan notifikasi</Button>}
      {state === 'on' && (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" loading={busy} onClick={() => void run(async () => { const r = await sendTestPush(); setTestResult(r.sent > 0 ? 'Notifikasi uji dikirim. Seharusnya muncul di layar sebentar lagi.' : 'Tidak ada perangkat yang menerima. Matikan lalu aktifkan lagi.'); })}>Kirim uji</Button>
          <Button variant="secondary" loading={busy} onClick={() => void run(disablePush)}>Matikan</Button>
        </div>
      )}
    </Card>
  );
}

/** Ajakan singkat di Beranda selama notifikasi belum aktif dan belum ditolak/ditutup. */
export function PushPrompt() {
  const [state, refresh] = usePushState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } });

  if (state !== 'off' || dismissed) return null;
  return (
    <Card className="flex flex-col gap-2">
      <p className="font-semibold">Aktifkan notifikasi</p>
      <p className="text-sm text-muted">Dapatkan pemberitahuan pengajuan dan persetujuan langsung di layar HP, meski aplikasi tidak dibuka.</p>
      <ErrorNote error={error} />
      <div className="grid grid-cols-2 gap-3">
        <Button variant="ghost" onClick={() => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* abaikan */ } setDismissed(true); }}>Nanti</Button>
        <Button loading={busy} onClick={() => { setBusy(true); setError(null); enablePush().catch(setError).finally(() => { setBusy(false); refresh(); }); }}>Aktifkan</Button>
      </div>
    </Card>
  );
}
