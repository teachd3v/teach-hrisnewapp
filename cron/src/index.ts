// Penjadwal pengingat. Tidak punya D1/VAPID sendiri: hanya memanggil API aplikasi, yang berisi seluruh logika dan kuncinya.
interface Env {
  API_URL: string;
  CRON_SECRET: string;
}

const MAX_ROUNDS = 6; // satu putaran memproses maksimal 20 penerima; ulangi bila API melaporkan masih ada sisa

async function tick(env: Env) {
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const res = await fetch(`${env.API_URL}/api/internal/cron`, { method: 'POST', headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
    if (!res.ok) {
      console.error(`cron: API menjawab ${res.status} (putaran ${round})`);
      return;
    }
    const body = (await res.json()) as { more?: boolean; kinds?: Record<string, { claimed: number; sent: number }> };
    const worked = Object.entries(body.kinds ?? {}).filter(([, v]) => v.claimed > 0);
    if (worked.length) console.log(`cron putaran ${round}: ${worked.map(([k, v]) => `${k} diklaim ${v.claimed}, terkirim ${v.sent}`).join('; ')}`);
    if (!body.more) return;
  }
  console.warn('cron: masih ada sisa setelah putaran maksimal; dilanjutkan pada pemicu berikutnya');
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(tick(env));
  },
} satisfies ExportedHandler<Env>;
