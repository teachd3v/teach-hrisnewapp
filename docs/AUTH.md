# Login berbasis token

Tanpa cookie, karena aplikasi Tauri memuat SPA dari origin lain.

| Endpoint | Auth | Fungsi |
|---|---|---|
| `POST /api/auth/login` | – | `{email, password, device?}` → `{accessToken, refreshToken, expiresIn, mustChangePassword, user}` |
| `POST /api/auth/refresh` | – | `{refreshToken}` → pasangan token baru (rotasi) |
| `POST /api/auth/logout` | – | `{refreshToken}` → mencabut seluruh family token itu |
| `GET /api/auth/me` | Bearer | profil singkat + `mustChangePassword` (supaya memuat ulang aplikasi tidak melewati kewajiban mengganti password awal) |
| `POST /api/auth/change-password` | Bearer | `{currentPassword, newPassword, device?}` → `{ok, accessToken, refreshToken, expiresIn}`; mencabut semua sesi lama lalu menerbitkan sesi baru untuk perangkat ini (perangkat lain keluar, perangkat ini tetap masuk) |

## Aturan
- Access token: JWT HS256, 15 menit (`JWT_SECRET`). Klaim: `sub`, `role`, `iat`, `exp`.
- Refresh token: 32 byte acak, berlaku 30 hari. Di D1 hanya hash SHA-256.
- Rotasi tiap refresh. Token yang sudah dipakai lalu dipakai lagi = indikasi pencurian → seluruh family dicabut, tercatat di audit.
- Klaim token diatomkan lewat `UPDATE ... WHERE used_at IS NULL`, sehingga dua refresh paralel tidak sama-sama lolos.
- 5 kali salah password → akun dikunci 15 menit. Pesan galat login selalu sama (tidak membocorkan email terdaftar).
- Password PBKDF2-SHA256, 100.000 iterasi (batas Workers). Tidak ada password default di kode; akun baru dibuat dengan password awal sekali pakai (`must_change_password`).
- Role dibaca dari klaim token (maks. 15 menit basi). Aksi sensitif sebaiknya cek ulang role dari D1.

## Penyimpanan di klien
- Web: access token di memori, refresh token lewat `web/src/lib/session.ts` (sementara `localStorage`; satu-satunya titik yang diganti di Tauri). `web/src/lib/api.ts` me-refresh otomatis sekali saat 401 (satu permintaan refresh pada satu waktu).
- Tauri: refresh token di penyimpanan aman perangkat (Keychain/Keystore) — dikerjakan di spike Tauri.

## Super admin pertama
`api/scripts/seed-super-admin.mjs` mencetak SQL; jalankan manual ke D1, jangan simpan hasilnya di repo.

## Belum dikerjakan
- Pembatasan laju per IP, reset password oleh admin.
