import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Satu penanda per build: ditanam di JS (__BUILD_ID__) dan ditulis ke /version.json agar aplikasi yang terbuka bisa mendeteksi deploy baru.
const buildId = Date.now().toString(36);
const versionFile = (): Plugin => ({
  name: 'version-json',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: buildId }) });
  },
});

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? buildId : 'dev') },
  server: {
    port: 5173,
    // Saat dev, /api diteruskan ke `npm run dev:api` (wrangler pages dev)
    proxy: { '/api': 'http://localhost:8788' },
  },
}));
