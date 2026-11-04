import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Saat dev, /api diteruskan ke `npm run dev:api` (wrangler pages dev)
    proxy: { '/api': 'http://localhost:8788' },
  },
});
