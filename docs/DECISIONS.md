# Keputusan project

Diputuskan 2026-11-04 (menindaklanjuti "Keputusan yang masih terbuka" di HANDOFF-hris-spa.md).

| # | Topik | Keputusan |
|---|---|---|
| 1 | Repo GitHub | `teachd3v/teach-hrisnewapp` |
| 2 | API | Pages Functions (Hono) dalam project Pages yang sama. Cron nanti lewat Worker kecil terpisah. |
| 3 | Data master | Mulai kosong (tanpa impor dari D1 lama). |
| 4 | Domain | Ditunda; sementara `*.pages.dev`. `WEB_ORIGIN` di `wrangler.jsonc` placeholder sampai domain ditetapkan. |
| 5 | Cakupan MVP | Sesuai handoff (login, presensi, cuti dua tahap, persetujuan, notifikasi, profil, menu admin HP). |
| 6 | Distribusi | Privat/internal (Play internal/closed testing, Apple Unlisted/Custom App). |
| 7 | Akun toko & Mac | Belum dikonfirmasi: Google Play Console, Apple Developer, Mac untuk build iOS. |

## Masih terbuka
- Kebijakan cuti bersama, geofence, jam masuk/keterlambatan (lihat handoff).
- Kesiapan akun toko dan Mac (butir 7).

## Sumber daya Cloudflare (dibuat 2026-11-04)
- D1 `hris-spa-db` (id `50cdf64e-466e-49e9-abdc-51949f9d5b9b`, wilayah APAC); migrasi 0000-0002 sudah diterapkan ke remote.
- R2 `hris-spa-storage`.
- Pages `teach-hris-spa` → https://teach-hris-spa.pages.dev (dideploy 2026-11-05 dengan `wrangler pages deploy web/dist`; belum tersambung ke Git). Secret `JWT_SECRET` dan `URL_SIGNING_SECRET` diisi acak lewat `wrangler pages secret put` (tidak tersimpan di repo/chat).
- Belum ada: super admin pertama, domain kustom.
- Deploy ulang: `npm run deploy` (build + `wrangler pages deploy web/dist`). Gunakan `--project-name teach-hris-spa --branch main` bila diminta.
- Migrasi baru diterapkan manual: `npx wrangler d1 migrations apply hris-spa-db --remote` (sebelum merge PR yang membutuhkannya).

## Push notification (diaktifkan 2026-11-05)
- Web Push (VAPID) aktif di produksi. Secret `VAPID_PRIVATE_KEY` diisi lewat `wrangler pages secret put` (tidak tersimpan di repo/chat); `VAPID_PUBLIC_KEY` dan `VAPID_SUBJECT` ada di `wrangler.jsonc`. Detail: `docs/PUSH.md`.
- Mengganti kunci VAPID membuat semua langganan lama tidak berlaku; pengguna perlu menekan Matikan lalu Aktifkan lagi di Akun.
- FCM untuk aplikasi Tauri belum ada (menunggu spike dan proyek Firebase).

## Pengingat terjadwal diaktifkan (2026-11-05)
- Migrasi 0008 diterapkan ke D1 remote (`reminder_log`, `employees.reminders_enabled`).
- Secret `CRON_SECRET` (nilai sama) di Pages `teach-hris-spa` dan Worker `teach-hris-cron`; tidak di repo/chat. `CRON_ALLOW_NOW` tidak diset di produksi.
- Worker `teach-hris-cron` (`cron/`, `npm run deploy:cron`) berjadwal `*/5 * * * *`, tanpa alamat publik (`workers_dev: false`). Detail dan batasan: `docs/REMINDERS.md`.
- Pengingat yang dipilih pemilik: belum presensi masuk 08:45, belum pulang 8 jam setelah masuk, pengajuan menunggu > 24 jam (09:30); saklar per pengguna di Akun.

## Fokus PWA, aplikasi Android native (Tauri) ditunda (2026-11-05)
- Aplikasi ini internal. Pengguna: sekitar 20-30 Android dan 5-6 iPhone. PWA sudah mencakup keduanya (satu basis kode, tanpa toko aplikasi); Tauri hanya Android dan menambah beban (FCM, penandatanganan, distribusi APK).
- Tauri **tidak dihapus**: `web/src-tauri` dan `docs/SPIKE-TAURI.md` dipertahankan sebagai arsip; cabang `__TAURI_INTERNALS__` di `geo.ts`/`push.ts` dibiarkan tidak aktif. Halaman uji `/spike` dicabut dari produksi.
- Dibuka kembali bila ada kebutuhan yang PWA tidak bisa penuhi (mis. presensi latar belakang).
- Penggantinya: panduan pasang PWA (Android: tombol pasang bawaan Chrome; iPhone: Safari > Bagikan > Tambahkan ke Layar Utama, syarat push di iOS) dan banner "ada versi baru" (`/version.json`, dicek saat aplikasi dibuka kembali dan tiap 10 menit).
