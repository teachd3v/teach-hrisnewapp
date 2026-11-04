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
