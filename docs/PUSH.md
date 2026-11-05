# Push notification

Popup di layar HP untuk notifikasi baru (pengajuan cuti, keputusan atasan/HC, koreksi presensi) **meski aplikasi/browser tidak dibuka**. Isinya sama dengan notifikasi di dalam aplikasi, yaitu tanpa alasan cuti/koreksi.

Ada dua jalur, sesuai platform:

| Jalur | Untuk | Status |
|---|---|---|
| **Web Push** (VAPID, tanpa Firebase) | HP yang membuka web (Android Chrome dll.; iPhone hanya bila aplikasi ditambahkan ke Layar Utama) | **Dibangun** |
| **FCM** (Firebase) | Aplikasi Tauri (Android/iOS) | Menunggu spike Tauri + proyek Firebase |

## Cara kerja Web Push
- Pengguna mengetuk **Aktifkan notifikasi** (Akun, atau ajakan di Beranda). Browser meminta izin, mendaftarkan `sw.js`, dan berlangganan memakai kunci publik VAPID dari server. Langganan disimpan di `push_devices` (`kind = webpush`, `token = endpoint`, `web_keys = {p256dh, auth}`).
- Setelah sebuah aksi menulis notifikasi (ajukan/putuskan cuti, ajukan/putuskan koreksi), server mengirim push ke semua perangkat penerima lewat `waitUntil` (tidak menunda respons; kegagalan push tidak menggagalkan aksi).
- Isi pesan dienkripsi (RFC 8291, aes128gcm) dan ditandatangani VAPID (RFC 8292) dengan WebCrypto murni: `api/src/lib/web-push.ts` (dari project lama), pengirim di `api/src/lib/push.ts`.
- Mengetuk popup membuka aplikasi di layar terkait (`href` notifikasi). Bila aplikasi sudah terbuka, SPA berpindah layar tanpa muat ulang.
- Langganan yang sudah mati (FCM/Mozilla menjawab 404/410) dihapus otomatis.

## Aturan keamanan
- Endpoint langganan hanya boleh milik layanan push resmi (FCM, Mozilla, Apple, Windows), HTTPS; server tidak bisa dipakai menembak alamat sembarang.
- Satu perangkat yang dipakai bergantian: saat **keluar akun**, langganan dilepas dari akun itu; saat masuk, langganan yang sudah diberi izin didaftarkan ke akun yang sedang masuk. Maksimal 10 perangkat per akun (yang tertua dibuang).
- Kunci privat VAPID hanya sebagai secret (`wrangler pages secret put VAPID_PRIVATE_KEY`), tidak di repo. Kunci publik dan kontak VAPID (`VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`) ada di `wrangler.jsonc`. Kontak memakai URL situs, bukan email pribadi, karena dikirim ke layanan push.
- Tanpa `VAPID_*`, push dimatikan diam-diam dan kartu di Akun menampilkan galat saat diaktifkan.

## API (`/api/push`, Bearer)
`GET /config` (kunci publik) · `POST /subscribe` · `POST /unsubscribe` · `POST /test` (kirim notifikasi uji ke perangkat saya).

## Pengujian
- Putaran enkripsi: perangkat mendekripsi persis pesan asli; tanda tangan VAPID terverifikasi; 410 ditandai "mati".
- API: validasi endpoint/kunci, daftar ulang, perpindahan akun, dan pembersihan langganan palsu setelah dikirim ke FCM sungguhan; pengajuan cuti tetap berhasil.
- **Belum teruji di HP nyata**: popup benar-benar muncul, ikon, ketuk membuka layar yang benar. Browser pane tidak bisa memberi izin notifikasi.

## Batasan
- iPhone/iOS: hanya bila aplikasi ditambahkan ke Layar Utama (Safari → Bagikan → Tambahkan ke Layar Utama) dan iOS 16.4 ke atas; di tab Safari biasa tidak ada push.
- Android: hemat baterai agresif (beberapa merek) dapat menunda push; aktifkan "tanpa batasan" untuk Chrome bila perlu.
- Ikon notifikasi dan aplikasi masih ikon sementara "HT" (`web/public/icons`); ganti dengan ikon resmi.
- Notifikasi pengingat terjadwal (mis. belum presensi) belum ada: Pages Functions tidak punya cron, perlu Worker terpisah.
