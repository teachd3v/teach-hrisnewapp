# Serah terima: HRIS TEACH versi baru (SPA + Tauri)

Dokumen ini merangkum diskusi di project lama agar bisa dilanjutkan di project baru.
Bahasa percakapan: Indonesia.

## Latar belakang

- **Project lama** (tetap berjalan, dibekukan: hanya perbaikan bug)
  - Repo `teachd3v/hris-app`, folder lokal `C:\Users\Asus VivoBook\Documents\LOCALHOST\hris-teachapp`.
  - Next.js 16 + OpenNext di Cloudflare Workers, PWA, domain `hrteach.site`.
  - D1 `hris-teachapp-db`, R2 `hris-teachapp-storage`, login NextAuth (Credentials + JWT cookie).
- **Project baru** (folder ini): dibangun dari nol sebagai **SPA**.
  - Repo GitHub baru dan Cloudflare **Pages**.
  - Database dan file tetap di ekosistem Cloudflare (D1 + R2 **baru**, kosong).
  - Aplikasi HP dibuat dengan **Tauri 2** (Android → Google Play, iOS → App Store), tidak lagi memakai PWA.

## Arsitektur yang disepakati / diusulkan

```
web/ (SPA)    Vite + React + React Router (atau TanStack Router) + TanStack Query + Tailwind v4
  src-tauri/  Tauri 2 untuk Android dan iOS (memuat SPA yang sama dari dalam aplikasi)
functions/    API dengan Hono sebagai Cloudflare Pages Functions + Drizzle + binding D1 dan R2
shared/       aturan cuti, tipe, validasi (dipakai SPA dan API)
```

Prinsip yang wajib, karena Tauri memuat SPA dari dalam aplikasi (origin berbeda dari API):

- **Login berbasis token, bukan cookie.**
  - Access token pendek dan refresh token yang disimpan di D1, sehingga bisa dicabut, termasuk saat reset password atau logout.
  - Di aplikasi, token disimpan di penyimpanan aman perangkat.
  - Kunci akun setelah 5 kali salah password (15 menit), seperti project lama.
- **CORS** hanya untuk origin web sendiri dan origin Tauri (`tauri://localhost`, `http(s)://tauri.localhost`).
- **File R2 dibuka lewat tautan bertanda tangan berumur pendek**, karena `<img>` tidak bisa mengirim token.
  - Aturan akses: foto profil terlihat oleh semua pengguna login.
  - Dokumen, presensi, dan lampiran cuti hanya untuk pemilik, admin, dan atasan langsung (khusus lampiran cuti).
  - Akses oleh orang lain dicatat di log audit.
- **Push**: di aplikasi Tauri memakai **FCM** (Android, dan iOS lewat APNs yang dihubungkan ke Firebase), dikirim dari API dengan akun layanan Google. Web Push hanya untuk versi web.
- **Catatan Pages:** Pages Functions tidak mendukung cron. Pengingat terjadwal nanti butuh satu Worker kecil terpisah.

## Hal yang wajib dibuktikan dulu di HP asli (spike, sebelum membangun penuh)

1. Kamera langsung (`getUserMedia`) dan deteksi wajah MediaPipe di WebView Tauri.
   - Android: izin kamera dan izin WebView.
   - iOS: `NSCameraUsageDescription`.
   - File WASM MediaPipe **dibundel di aplikasi**, bukan dari CDN.
   - Cadangan bila gagal: `<input type="file" accept="image/*" capture="user">`.
2. GPS lewat plugin geolocation resmi Tauri.
3. Push native. Belum ada plugin push resmi Tauri. Kandidat pihak ketiga: `tauri-plugin-notifications` (fitur `push-notifications`) dan `tauri-plugin-mobile-push`. Alternatifnya plugin kecil sendiri (Kotlin/Swift).
4. Login token dari aplikasi ke API (CORS).
5. Build iOS butuh Mac + Xcode, atau CI macOS.

## Cakupan MVP (usulan, belum final)

- Login.
- Presensi: kamera potret 3:4 terpusat dan dicerminkan, kotak deteksi wajah kuning, auto-capture setelah 3 detik, layar konfirmasi (Ulangi / Setujui), GPS, riwayat presensi.
- Cuti dua tahap: atasan langsung lalu HC.
  - Pucuk pimpinan langsung ke HC.
  - HC bisa mengambil alih pengajuan yang tertahan di atasan, kapan saja, dengan alasan wajib dan tercatat di audit; hasilnya langsung final.
  - Kuota per jenis per tahun.
  - Hitungan **hari kerja** (Senin–Jumat di luar hari libur) untuk semua jenis.
  - Peringatan langsung di form, dan tombol Kirim nonaktif bila melebihi kuota.
- Halaman **Persetujuan Cuti** untuk atasan (tab Menunggu dan Riwayat).
- Notifikasi:
  - Daftar di aplikasi (lonceng dan badge), plus push.
  - Penerima pengajuan baru: atasan langsung dan **semua admin termasuk super admin**.
  - Isi notifikasi tanpa alasan cuti (data sensitif).
- Profil dasar.
- Menu Admin HP: persetujuan HC, data karyawan (super admin bisa mengubah data kepegawaian), kuota cuti, hari libur.
- **Menyusul setelah MVP:** CV lengkap, dokumen, asesmen, ekspor Excel/PDF, admin desktop penuh.

## Modul project lama yang layak dibawa (sudah teruji)

Semua path relatif ke `C:\Users\Asus VivoBook\Documents\LOCALHOST\hris-teachapp`. Baca dulu, lalu sesuaikan (jangan salin mentah).

| Modul | File lama | Catatan |
|---|---|---|
| Aturan cuti, durasi hari kerja, validasi tanggal, tanggal selesai paling lambat | `lib/leave.ts` | Logika murni |
| Saldo/kuota cuti per jenis per tahun | `lib/leave-balance.ts` | Bawaan: Cuti Tahunan 12, jenis lain tak dibatasi kecuali diatur |
| Server action cuti (ajukan, setuju atasan/HC, ambil alih, batal, riwayat) | `app/employee/cuti/actions.ts` | Pindahkan ke endpoint API; pertahankan semua pengecekan hak akses |
| Perencanaan penerima notifikasi | `lib/notifications.ts` | Fungsi `plan*` murni dan teruji |
| Web Push (enkripsi RFC 8291 + VAPID RFC 8292, WebCrypto) | `lib/web-push.ts`, `lib/push.ts` | Lolos vektor uji RFC; untuk versi web |
| Hash password PBKDF2 (WebCrypto, 100.000 iterasi) | `lib/password.ts` | Batas iterasi Workers 100.000 |
| Log audit (atomik dengan aksi via `db.batch`) | `lib/audit.ts`, `lib/audit-labels.ts` | |
| Admin / super admin | `lib/admins.ts` | Super admin `hudagraph@gmail.com`; label "Super Admin" |
| Struktur organisasi (atasan wajib kecuali pucuk pimpinan, bawahan berjenjang, cegah melingkar) | `lib/org.ts`, `lib/org-tree.ts`, `setEmployeeManager` di `app/admin/employees/actions.ts` | |
| Hari libur, rentang tanggal | `lib/holidays.ts`, `expandDateRange` di `lib/leave.ts` | Cuti bersama = libur nasional, belum memotong cuti tahunan (kebijakan belum ditetapkan) |
| Status presensi harian | `lib/attendance-status.ts`, `lib/time.ts` (WIB) | |
| Deteksi wajah | `lib/face-detector.ts`, `public/models/blaze_face_short_range.tflite` | |
| Validasi upload (cek tipe dari isi berkas) | `lib/upload.ts` | |
| Pilihan departemen/level/status | `lib/employment-options.ts` | |
| Kutipan acak clock-out | `lib/clock-out-quotes.ts` | |
| Skema tabel (rujukan, tulis ulang rapi) | `lib/db/schema.ts` | |

## Data

- Database baru mulai **kosong** untuk transaksi (presensi, cuti, notifikasi).
- **Usulan:** impor sekali data master dari D1 lama (karyawan, email, atasan, departemen, jabatan, jatah cuti, hari libur) dengan skrip, supaya tidak mengetik ulang 31 karyawan. Belum diputuskan.

## Kebijakan yang belum ditetapkan (dari project lama)

- Cuti bersama memotong cuti tahunan atau tidak.
- Geofence presensi di server (mati selama demo; kantor -6.4733643, 106.7274949, radius 1 km).
- Jam masuk dan keterlambatan (belum didefinisikan; standar kerja 8 jam hanya tampilan).

## Toko aplikasi

- Akun Google Play Console (sekali bayar) dan Apple Developer Program (tahunan).
- Aplikasi khusus karyawan satu organisasi biasanya diarahkan Apple ke **Unlisted App** atau **Custom App (Apple Business Manager)**. Di Android: rilis privat atau testing tertutup. Cek panduan terbaru saat pengajuan.
- Siapkan kebijakan privasi, alasan izin kamera dan lokasi, formulir keamanan data, dan akun demo untuk peninjau.

## Cara kerja yang disepakati (dibawa dari project lama)

- Setelah mengubah kode dan typecheck + lint lolos: langsung commit, push ke branch kerja, dan buat PR tanpa menunggu diminta. **Merge dilakukan pemilik repo.**
- Migrasi D1 dijalankan manual, **sebelum** merge PR yang membutuhkannya.
- Deskripsi PR jujur soal pengujian; tampilan yang belum dicek di perangkat ditandai "perlu dicek manual".
- Perubahan berisiko atau ambigu dibedah dan ditanyakan dulu sebelum dikerjakan.
- Tampilan mobile: tema terang (latar putih, teks hitam), ringkas.
- Secret (VAPID, akun layanan Firebase, dan sebagainya) dimasukkan lewat `wrangler secret put` atau dashboard, **tidak pernah lewat chat atau repo**.

## Keputusan yang masih terbuka

1. Nama repo GitHub baru (buat repo kosong lebih dulu).
2. API: Pages Functions dalam project Pages yang sama (diusulkan), atau Worker terpisah.
3. Data master: impor sekali (diusulkan), atau mulai kosong total.
4. Domain, misalnya `app.hrteach.site` (sistem lama tetap di `hrteach.site` sampai peralihan).
5. Cakupan MVP di atas: final atau ada perubahan.
6. Distribusi: publik di toko, atau privat/internal.
7. Kesiapan akun Google Play, Apple Developer, dan Mac untuk build iOS.

## Langkah pertama yang diusulkan

1. Kerangka project: SPA Vite + React + Tailwind, API Hono di Pages Functions, skema D1 baru, rancangan login token.
2. Spike Tauri Android di HP asli: kamera + wajah, GPS, push FCM, login token.
