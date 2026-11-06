# Keputusan project

Diputuskan 2026-11-04 (menindaklanjuti "Keputusan yang masih terbuka" di HANDOFF-hris-spa.md).

| # | Topik | Keputusan |
|---|---|---|
| 1 | Repo GitHub | `teachd3v/teach-hrisnewapp` |
| 2 | API | Pages Functions (Hono) dalam project Pages yang sama. Cron nanti lewat Worker kecil terpisah. |
| 3 | Data master | Departemen, level, dan status kepegawaian **diimpor dari project lama** (migrasi 0004: departemen IDEAS, SGLT, BI, Budaya, REMO, LSP; level Direktur-Pelaksana; status Kontrak, Tetap, Probation, Magang), lalu dikelola super admin. Data **karyawan** mulai kosong (tambah satu per satu), tanpa impor massal. |
| 4 | Domain | Ditunda; sementara `*.pages.dev`. `WEB_ORIGIN` di `wrangler.jsonc` placeholder sampai domain ditetapkan. |
| 5 | Cakupan MVP | Sesuai handoff (login, presensi, cuti dua tahap, persetujuan, notifikasi, profil, menu admin HP). **Catatan:** "profil" belum terpenuhi untuk sisi karyawan; lihat "Masih terbuka" nomor 1. |
| 6 | Distribusi | **Final: PWA murni, privat/internal.** Tidak dilanjutkan ke Play Store maupun App Store (rencana awal Play internal/closed testing dan Apple Unlisted/Custom App dibatalkan). |
| 7 | Akun toko & Mac | Tidak berlaku (Google Play Console, Apple Developer, dan Mac untuk build iOS tidak diperlukan). |

## Masih terbuka
Status kode per 2026-11-06, hasil pembacaan ulang repo.

1. **Profil karyawan (sisi karyawan).** Saat ini karyawan tidak punya halaman profil. Tabel `employees` hanya memuat data pekerjaan dan kontak dasar (nama, email, telepon, jenis kelamin, kode, jabatan, departemen, level, status, tanggal masuk, foto); yang bisa mengubah hanya HC (nama, email, telepon, jenis kelamin, kode, atasan) dan super admin (data pekerjaan). Belum ada, dan **dibahas dulu sebelum dibangun**: data personal, keluarga, edukasi & skill, aktivitas & prestasi, dokumen. Yang perlu diputuskan: siapa mengisi dan mengubah (karyawan sendiri, HC, atau keduanya dengan persetujuan), kolom mana yang wajib, siapa boleh melihat, bagaimana data sensitif dan dokumen disimpan (R2, tautan bertanda tangan seperti lampiran cuti), dan apakah masuk MVP atau tahap berikutnya.
2. ~~**Cuti bersama memotong cuti tahunan: pengaturan (toggle) di super admin.**~~ **Dibangun 2026-11-06** (belum dideploy; migrasi 0009 belum diterapkan ke D1 remote). Keputusan: nilai awal mati; potongan dihitung saat saldo dibaca (bukan ditulis sebagai baris) sehingga toggle bisa dibalik kapan saja; hanya karyawan aktif, hanya hari kerja, tidak untuk hari sebelum tanggal masuk; status Probation dan Magang dikecualikan (bisa diubah super admin); kuota khusus tetap dipotong; saldo boleh minus dan hanya menolak pengajuan baru; karyawan yang potongannya berubah menerima notifikasi (termasuk saat cuti bersama ditambah/dihapus di tengah tahun). Detail: `docs/LEAVE.md`. Catatan: Probation dan Magang "tidak dapat cuti" baru dipenuhi untuk potongan cuti bersama; kuota Cuti Tahunan bawaan mereka tetap 12 sampai butir 3 (jenis cuti dan kuota bawaan) dibangun.
3. **Dibangun 2026-11-06 (belum dideploy; migrasi 0010 belum diterapkan ke D1 remote): jenis cuti dan kuota bawaan diatur di Data master > Cuti** (bukan sub-menu Kuota Cuti seperti rencana awal). Keputusan: pengenal (`key`) tetap, nama (`label`) bebas diganti; jenis yang pernah dipakai hanya dinonaktifkan; 11 jenis bawaan ditandai sistem dan tidak dapat dihapus; "izin per jam" hanya dapat ditetapkan saat membuat; mengubah kuota bawaan berlaku langsung tanpa notifikasi. Detail: `docs/LEAVE.md`. Teks rencana awal: **Jenis cuti dan kuota bawaan dapat diatur di super admin** (sub-menu di menu Kuota Cuti). Saat ini 11 jenis cuti ditulis tetap di kode (`shared/src/leave.ts`) dan kuota bawaan di `DEFAULT_QUOTAS` (Cuti Tahunan 12, Ganti Hari 0, lainnya tanpa batas); hanya kuota per karyawan yang bisa diubah lewat admin. Rencana: tabel jenis cuti yang bisa ditambah dan diubah (nama, keterangan, kuota bawaan dari angka tertentu sampai tanpa batas, wajib lampiran, berbasis jam, batas jenis kelamin, aktif/nonaktif). Perlu diputuskan: nasib pengajuan lama bila jenis diganti nama atau dinonaktifkan, dan apakah jenis bawaan sistem boleh dihapus.
4. **Geofence dan batas jam masuk/keterlambatan: pengaturan di super admin.** Saat ini keduanya konstanta kode (`OFFICE` dan `WORK_START_SECONDS` di `shared/src/attendance.ts`): kantor satu titik, radius 1 km, masuk paling lambat 09:00 WIB tanpa toleransi, satu aturan untuk semua. Lokasi hanya ditandai untuk HC, tidak memblokir. Belum ada tabel pengaturan umum. Terbuka: apakah satu atau banyak lokasi, apakah di luar radius diblokir atau tetap hanya ditandai, toleransi keterlambatan, dan jam berbeda per departemen atau status.
5. Kesiapan teknis bersama untuk butir 2-4: perlu tabel pengaturan (nilai, siapa yang mengubah) dengan jejak audit, dan pembacaan pengaturan di server agar perhitungan lama tidak berubah diam-diam.

## Sumber daya Cloudflare (dibuat 2026-11-04)
- D1 `hris-spa-db` (id `50cdf64e-466e-49e9-abdc-51949f9d5b9b`, wilayah APAC); migrasi 0000-0002 sudah diterapkan ke remote.
- R2 `hris-spa-storage`.
- Pages `teach-hris-spa` → https://teach-hris-spa.pages.dev (dideploy 2026-11-05 dengan `wrangler pages deploy web/dist`; belum tersambung ke Git). Secret `JWT_SECRET` dan `URL_SIGNING_SECRET` diisi acak lewat `wrangler pages secret put` (tidak tersimpan di repo/chat).
- Belum ada: super admin pertama, domain kustom.
- Deploy ulang: `npm run deploy` (build + `wrangler pages deploy web/dist`). Gunakan `--project-name teach-hris-spa --branch main` bila diminta.
- **Deploy otomatis (2026-11-06):** push ke `main` memicu GitHub Actions (`.github/workflows/deploy.yml`: typecheck, build, `wrangler pages deploy` ke project yang sama). Dipilih dibanding integrasi Git bawaan Cloudflare karena project Pages hasil wrangler tidak bisa disambungkan ke Git setelah dibuat; membuat project baru berarti alamat berubah, secret diisi ulang, dan pengguna harus memasang ulang PWA serta mengaktifkan notifikasi lagi. Secret GitHub: `CLOUDFLARE_API_TOKEN` (izin Pages: Edit) dan `CLOUDFLARE_ACCOUNT_ID`. **Tetap manual:** migrasi D1 (jalankan sebelum mendorong kode yang membutuhkannya) dan Worker cron (`npm run deploy:cron`).
- Migrasi baru diterapkan manual: `npx wrangler d1 migrations apply hris-spa-db --remote` (sebelum merge PR yang membutuhkannya).

## Push notification (diaktifkan 2026-11-05)
- Web Push (VAPID) aktif di produksi. Secret `VAPID_PRIVATE_KEY` diisi lewat `wrangler pages secret put` (tidak tersimpan di repo/chat); `VAPID_PUBLIC_KEY` dan `VAPID_SUBJECT` ada di `wrangler.jsonc`. Detail: `docs/PUSH.md`.
- Mengganti kunci VAPID membuat semua langganan lama tidak berlaku; pengguna perlu menekan Matikan lalu Aktifkan lagi di Akun.
- FCM untuk aplikasi Tauri belum ada dan ditunda bersama Tauri (lihat bagian "Fokus PWA"). Push untuk Android dan iPhone memakai Web Push.

## Pengingat terjadwal diaktifkan (2026-11-05)
- Migrasi 0008 diterapkan ke D1 remote (`reminder_log`, `employees.reminders_enabled`).
- Secret `CRON_SECRET` (nilai sama) di Pages `teach-hris-spa` dan Worker `teach-hris-cron`; tidak di repo/chat. `CRON_ALLOW_NOW` tidak diset di produksi.
- Worker `teach-hris-cron` (`cron/`, `npm run deploy:cron`) berjadwal `*/5 * * * *`, tanpa alamat publik (`workers_dev: false`). Detail dan batasan: `docs/REMINDERS.md`.
- Pengingat yang dipilih pemilik: belum presensi masuk 08:45, belum pulang 8 jam setelah masuk, pengajuan menunggu > 24 jam (09:30); saklar per pengguna di Akun.

## Fokus PWA, aplikasi Android native (Tauri) ditunda (2026-11-05)
- Aplikasi ini internal. Pengguna: sekitar 20-30 Android dan 5-6 iPhone. PWA sudah mencakup keduanya (satu basis kode, tanpa toko aplikasi); Tauri hanya Android dan menambah beban (FCM, penandatanganan, distribusi APK).
- Tauri **tidak dihapus**: `web/src-tauri` dan `docs/SPIKE-TAURI.md` dipertahankan sebagai arsip; cabang `__TAURI_INTERNALS__` di `geo.ts`/`push.ts` dibiarkan tidak aktif. Halaman uji `/spike` dicabut dari produksi.
- Distribusi lewat Play Store dan App Store tidak dilanjutkan (lihat butir 6). Tauri hanya akan dibuka kembali bila ada kebutuhan teknis yang PWA tidak bisa penuhi (mis. presensi latar belakang).
- Penggantinya: panduan pasang PWA (Android: tombol pasang bawaan Chrome; iPhone: Safari > Bagikan > Tambahkan ke Layar Utama, syarat push di iOS) dan banner "ada versi baru" (`/version.json`, dicek saat aplikasi dibuka kembali dan tiap 10 menit).
