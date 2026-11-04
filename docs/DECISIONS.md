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
