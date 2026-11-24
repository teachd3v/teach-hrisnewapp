import { DurableObject } from 'cloudflare:workers';

interface Env {
  FACE_CONTAINER: DurableObjectNamespace<FaceContainer>;
}

const CONTAINER_PORT = 8080;
/** Tidur otomatis setelah 2 menit tanpa permintaan (scale-to-zero untuk menghemat jatah GiB-jam). */
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000;
const READY_POLL_MS = 250;
const READY_MAX_ATTEMPTS = 120; // maks. 30 detik untuk cold start pemuatan AuraFace v1 (261 MB)

/**
 * Pembungkus Durable Object untuk Cloudflare Container `teach-hris-face`.
 * Menyalakan container saat ada permintaan pertama, menjaga tetap hidup 2 menit, lalu meneruskan request ke port 8080.
 */
export class FaceContainer extends DurableObject<Env> {
  private starting?: Promise<void>;
  private ready = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const container = ctx.container;
    if (container?.running) {
      void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS));
    }
  }

  async fetch(request: Request): Promise<Response> {
    const container = this.ctx.container;
    if (!container) return Response.json({ ok: false, reason: 'service_unavailable', message: 'Container tidak terkonfigurasi.' }, { status: 503 });

    const url = new URL(request.url);
    url.protocol = 'http:';
    url.host = 'container';

    // Baca body sekali agar aman bila perlu retry setelah container baru bangun.
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
    const contentType = request.headers.get('content-type');
    const buildReq = () => {
      const headers = new Headers();
      if (contentType) headers.set('content-type', contentType);
      return new Request(url.toString(), { method: request.method, headers, body });
    };

    try {
      await this.ensureReady(container);
      return await container.getTcpPort(CONTAINER_PORT).fetch(buildReq());
    } catch {
      // Container bisa saja baru berhenti tepat sebelum request; coba nyalakan ulang sekali.
      this.ready = false;
      await this.ensureReady(container);
      return await container.getTcpPort(CONTAINER_PORT).fetch(buildReq());
    }
  }

  private async ensureReady(container: Container): Promise<void> {
    if (container.running && this.ready) {
      await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
      return;
    }
    this.starting ??= this.startAndWaitForPort(container).finally(() => {
      this.starting = undefined;
    });
    await this.starting;
  }

  private async startAndWaitForPort(container: Container): Promise<void> {
    if (!container.running) {
      container.start({ enableInternet: false });
    }
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    const port = container.getTcpPort(CONTAINER_PORT);
    for (let i = 0; i < READY_MAX_ATTEMPTS; i++) {
      try {
        const res = await port.fetch('http://container/health');
        if (res.ok) {
          this.ready = true;
          return;
        }
      } catch {
        // Port/model masih memuat
      }
      await new Promise((r) => setTimeout(r, READY_POLL_MS));
    }
    throw new Error('Container wajah tidak siap pada port 8080');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path !== '/analyze' && path !== '/health') {
      return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    // Satu instance bersama (`default`) memaksimalkan warm hit saat karyawan presensi berdekatan.
    const stub = env.FACE_CONTAINER.getByName('default');
    return stub.fetch(request);
  },
};
