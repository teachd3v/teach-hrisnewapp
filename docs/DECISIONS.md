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
Status kode per 2026-11-06. Butir yang sudah selesai dipindah ke "Sudah dibangun" di bawah.

1. **Profil karyawan (sisi karyawan).** Rencana **disetujui 2026-11-06**, dikerjakan bertahap (data saat ini masih percobaan; tidak ada impor dari project lama). Keputusan:
   - **Kelompok data:** Data personal, Keluarga (termasuk kontak darurat), Edukasi & Skill, Aktivitas & Prestasi, Dokumen. Model data mengacu project lama (`hris-teachapp-lama/lib/db/schema.ts`) tetapi disederhanakan: kolom personal baru di `employees` (NIK, tempat/tanggal lahir, kewarganegaraan, status pernikahan, agama, golongan darah, alamat domisili dan KTP, rekening bank, telepon) dan **satu tabel `profile_entries`** untuk semua daftar berulang (keluarga, pendidikan, skill, pengalaman, prestasi, dst.); definisi bagian dan kolom ada di `shared`, divalidasi server, dan satu editor generik membangun layarnya.
   - **Akses:** pemilik, HC, dan super admin melihat semua; semua karyawan yang login hanya melihat nama, foto, jabatan, departemen; atasan langsung tidak melihat data sensitif. Membuka profil atau dokumen **orang lain** dicatat di audit (`profile.view`). Perubahan profil tercatat di audit dengan nama kolom yang berubah (nilai sensitif tidak dicatat).
   - **Pengubahan:** karyawan mengubah profil sendiri langsung (tanpa persetujuan HC, termasuk NIK, tanggal lahir, rekening); HC/super admin dapat mengubah semua; nama dan email tetap hanya HC. Riwayat promosi hanya diisi HC (karyawan melihat saja).
   - **Kelengkapan:** tidak ada kolom wajib selain satu kontak darurat (tidak memblokir apa pun); ada indikator kelengkapan. Agama dan golongan darah opsional. NIK dan rekening disamarkan di tampilan, nilai penuh di form ubah. Keterangan penggunaan data HR internal ditampilkan saat pertama kali mengisi.
   - **Foto profil:** unggah dari kamera/galeri, dipotong persegi dan dikecilkan di perangkat, terlihat oleh semua pengguna login (tautan bertanda tangan).
   - **Dokumen:** KTP, KK, NPWP, ijazah, sertifikat, kontrak, lainnya; karyawan dan HC dapat mengunggah (HC untuk kontrak/SK); PDF/JPG/PNG/WEBP maks. 5 MB; akses hanya pemilik dan admin, akses orang lain diaudit. Ekspor CV (PDF/Excel) ditunda.
   - **Urutan:** (1) fondasi: kolom personal, `profile_entries`, definisi bagian, akses, audit, halaman Profil saya (personal, kontak darurat, keluarga); (2) edukasi & skill, aktivitas & prestasi (menambah definisi); (3) foto profil; (4) dokumen; (5) sisi admin (lihat/ubah profil dari daftar Karyawan) dan indikator kelengkapan. **Status 2026-11-06: langkah 1, 2, 3, dan 5 sudah dibangun (migrasi 0013; belum dideploy; lihat `docs/PROFIL.md`); tinggal langkah 4, dokumen.**

## Sudah dibangun dan live (2026-11-06)
1. **Cuti bersama memotong Cuti Tahunan: pengaturan (saklar) di super admin.** Di Akun > Kuota cuti, berupa saklar dengan panel lipat berisi daftar status yang dikecualikan (migrasi 0009, tabel `app_settings`). Nilai awal mati. Potongan dihitung saat saldo dibaca (bukan ditulis sebagai baris) sehingga saklar bisa dibalik kapan saja; hanya karyawan aktif, hanya hari kerja, tidak untuk hari sebelum tanggal masuk; Probation dan Magang dikecualikan (bisa diubah super admin); kuota khusus tetap dipotong; saldo boleh minus dan hanya menolak pengajuan baru; karyawan yang potongannya berubah menerima notifikasi (termasuk saat cuti bersama ditambah/dihapus di tengah tahun). Hanya super admin yang dapat mengubah; admin melihat. Detail: `docs/LEAVE.md`. **Saklar belum dinyalakan di produksi.**
2. **Jenis cuti dan kuota bawaan dikelola di Data master > Cuti** (migrasi 0010 dan 0011; bukan sub-menu Kuota Cuti seperti rencana awal). Pengenal (`key`) tetap dan nama (`label`) bebas diganti tanpa memutus riwayat; jenis yang pernah dipakai hanya dinonaktifkan; 11 jenis bawaan ditandai sistem dan tidak dapat dihapus; "izin per jam" hanya dapat ditetapkan saat membuat; mengubah kuota bawaan berlaku langsung tanpa notifikasi. Tiap jenis dapat dibatasi **jenis kelamin** dan **status kepegawaian** (kosong = semua); batasan ditegakkan di server, form, dan saldo (contoh: Cuti Besar khusus karyawan tetap). Detail: `docs/LEAVE.md`.
3. **Deploy otomatis lewat GitHub Actions** (lihat bagian Sumber daya Cloudflare). Migrasi 0009-0011 sudah diterapkan ke D1 remote.
4. Perbaikan tampilan: tab Data master sama lebar dan dirapatkan untuk 4 tab (`Segmented` di `web/src/ui.tsx`).
5. **Probation/Magang tidak berhak Cuti Tahunan: sudah dapat diatur lewat batasan status** (butir 2 di atas), tanpa fitur kuota-per-status tersendiri. Caranya: Data master > Cuti > Cuti Tahunan, centang hanya status yang berhak (mis. Tetap dan Kontrak). Karyawan berstatus lain tidak melihat Cuti Tahunan di form dan saldo, dan pengajuannya ditolak server; kartu saldo di Beranda memakai tampilan kosong. **Perlu diperiksa:** pengaturan ini baru berlaku bila sudah dicentang di produksi (bawaan migrasi: semua status boleh). Karyawan tanpa status juga tidak lolos jenis yang dibatasi, jadi isi status semua karyawan lebih dulu.
6. **Pengaturan presensi (geofence, jam masuk, toleransi, mode lokasi) di Akun > Pengaturan presensi** (migrasi 0012; **dibangun 2026-11-06, belum dideploy dan migrasi 0012 belum diterapkan ke D1 remote**). Rencana disetujui 2026-11-06 (data presensi saat ini masih percobaan, aplikasi belum diluncurkan ke karyawan). Keputusan: beberapa lokasi kantor (`office_locations`), penilaian ke lokasi aktif terdekat; aturan berlaku mulai tanggal tertentu (`attendance_policies`, bawaan besok, tidak boleh lampau) sehingga riwayat tidak berubah; status di luar kantor disimpan sebagai snapshot saat presensi; mode lokasi `flag` (bawaan) atau `block` (lokasi wajib, ditolak di luar radius + margin akurasi GPS maks. 100 m, Dinas Luar Kota yang disetujui dibebaskan, selebihnya koreksi HC); toleransi bawaan 0 menit dengan menit terlambat dihitung dari jam masuk; satu jam masuk untuk semua karyawan; jam pulang tetap hanya dicatat; pengingat "belum presensi masuk" mengikuti jam masuk. Hanya super admin yang dapat mengubah; admin melihat; semua perubahan tercatat di audit. Detail: `docs/PRESENSI.md`. **Belum diuji di HP** (mode `block` dan layar pengaturan).

## Sumber daya Cloudflare (dibuat 2026-11-04)
- D1 `hris-spa-db` (id `50cdf64e-466e-49e9-abdc-51949f9d5b9b`, wilayah APAC); migrasi 0000-0011 sudah diterapkan ke remote.
- R2 `hris-spa-storage`.
- Pages `teach-hris-spa` → https://teach-hris-spa.pages.dev (dideploy pertama 2026-11-05 dengan `wrangler pages deploy web/dist`; tidak tersambung ke Git bawaan Cloudflare, deploy kini otomatis lewat GitHub Actions). Secret `JWT_SECRET` dan `URL_SIGNING_SECRET` diisi acak lewat `wrangler pages secret put` (tidak tersimpan di repo/chat).
- Belum ada: super admin pertama, domain kustom.
- Deploy ulang: `npm run deploy` (build + `wrangler pages deploy web/dist`). Gunakan `--project-name teach-hris-spa --branch main` bila diminta.
- **Deploy otomatis (2026-11-06):** push ke `main` memicu GitHub Actions (`.github/workflows/deploy.yml`: typecheck, build, `wrangler pages deploy` ke project yang sama). Dipilih dibanding integrasi Git bawaan Cloudflare karena project Pages hasil wrangler tidak bisa disambungkan ke Git setelah dibuat; membuat project baru berarti alamat berubah, secret diisi ulang, dan pengguna harus memasang ulang PWA serta mengaktifkan notifikasi lagi. Secret GitHub: `CLOUDFLARE_API_TOKEN` (izin Pages: Edit) dan `CLOUDFLARE_ACCOUNT_ID`. **Tetap manual:** migrasi D1 (jalankan sebelum mendorong kode yang membutuhkannya) dan Worker cron (`npm run deploy:cron`).
- Migrasi baru diterapkan manual: `npx wrangler d1 migrations apply hris-spa-db --remote` (sebelum merge PR yang membutuhkannya). Bila muncul galat 403 / kode 7403 ("account not valid or not authorized"), ulangi perintahnya; bila berulang, `npx wrangler logout` lalu `npx wrangler login`.

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
