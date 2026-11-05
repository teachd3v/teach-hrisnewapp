# Spike Tauri (Android dulu)

> **DITUNDA (2026-11-05):** fokus ke PWA, lihat `docs/DECISIONS.md`. Dokumen dan `web/src-tauri` dipertahankan sebagai arsip. Halaman uji `/spike` sudah dicabut dari aplikasi (ada di riwayat git: `web/src/pages/Spike.tsx`).

Tujuan: membuktikan di HP asli sebelum membangun penuh. Halaman ujinya: `web/src/pages/Spike.tsx`, rute `/spike`.

## Status
| Butir | Status |
|---|---|
| Kerangka `web/src-tauri` (Tauri 2.12), plugin geolocation (mobile saja) | Ada; `cargo check` desktop lolos |
| Halaman spike memuat, WASM MediaPipe + model disajikan dari origin sendiri (bukan CDN) | Terverifikasi di browser |
| Kamera `getUserMedia` + deteksi wajah di WebView Android | **Belum diuji** (butuh HP) |
| GPS lewat plugin Tauri | **Belum diuji** (butuh HP) |
| Login token dari origin Tauri ke API (CORS) | **Belum diuji** (butuh API publik + HP) |
| Push FCM | Belum dimulai |
| Build iOS | Belum (butuh Mac) |

Mesin ini belum punya JDK, Android SDK/NDK, maupun adb, jadi build Android belum bisa dijalankan di sini.

## Prasyarat Android (Windows)
1. Android Studio (SDK Platform, Platform-Tools, NDK, Build-Tools) dan JDK 17+ (bawaan Android Studio cukup).
2. Variabel lingkungan: `JAVA_HOME`, `ANDROID_HOME`, `NDK_HOME`.
3. Target Rust: `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`.
4. HP: aktifkan Opsi Pengembang → Debugging USB.

## Menjalankan
```bash
cd web
npx tauri android init        # membuat src-tauri/gen/android (sekali)
```
Setelah init, edit `src-tauri/gen/android/app/src/main/AndroidManifest.xml`, tambahkan di dalam `<manifest>`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.camera.front" android:required="false" />
```
Izin lokasi ditambahkan sendiri oleh plugin geolocation. Lalu:
```bash
npx tauri android dev         # HP terhubung USB; /spike dibuka dengan menavigasi ke rute itu
```
Agar HP bisa menjangkau API, jalankan API di jaringan yang sama atau gunakan deploy `*.pages.dev`, lalu isi URL-nya di bagian 3 halaman spike. Origin aplikasi Android adalah `http://tauri.localhost` (sudah diizinkan CORS di `api/src/app.ts`).

## Yang dicatat dari tiap pengujian
1. Kamera: apakah izin diminta, apakah video tampil, resolusi, FPS deteksi, delegate GPU atau CPU, waktu muat model. Bila gagal: pesan error persis, lalu coba bagian 4 (input `capture`).
2. GPS: izin diminta, akurasi (meter), waktu perolehan.
3. Login: status HTTP; jika "Failed to fetch", periksa CORS dan HTTPS.
4. Catat tipe/versi HP dan Android.

## Catatan
- `identifier` aplikasi sementara `site.hrteach.app`; ganti sebelum rilis (tidak bisa diubah setelah terbit di toko).
- Ikon masih bawaan Tauri.
- Penyimpanan aman refresh token (Keychain/Keystore) dikerjakan setelah spike ini lolos.
