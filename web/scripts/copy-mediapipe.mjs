// Salin file WASM MediaPipe ke public/mediapipe agar dibundel di aplikasi (tanpa CDN). Dijalankan sebelum dev/build.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Workspace npm menaruh paket di node_modules akar repo (atau web/node_modules).
const src = ['node_modules', '../node_modules']
  .map((d) => join(d, '@mediapipe/tasks-vision/wasm'))
  .find(existsSync);
if (!src) throw new Error('@mediapipe/tasks-vision belum terpasang (jalankan npm install)');
mkdirSync('public/mediapipe', { recursive: true });
cpSync(src, 'public/mediapipe', { recursive: true });
console.log('MediaPipe WASM disalin ke public/mediapipe');
