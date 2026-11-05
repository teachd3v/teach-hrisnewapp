# Pengingat terjadwal

Push otomatis yang dikirim pada jam tertentu. Pages Functions tidak punya cron, jadi ada satu Worker kecil terpisah (`cron/`, nama `teach-hris-cron`) yang berjalan **tiap 5 menit** dan memanggil `POST /api/internal/cron` di aplikasi. Semua logika, kunci VAPID, dan dedup ada di aplikasi; Worker hanya pemicu (tanpa D1/VAPID sendiri), jadi kunci push tidak perlu disalin.

## Tiga pengingat (waktu WIB, hanya hari kerja)
| Jenis | Kapan | Siapa | Isi |
|---|---|---|---|
| `att_in` Belum presensi masuk | 08:45 sampai sebelum 09:00 | Karyawan aktif yang belum presensi hari ini | "Batas presensi masuk pukul 09:00" → `/presensi` |
| `att_out` Belum presensi pulang | 8 jam sesudah presensi masuk (maks. sampai 23:00) | Yang sudah masuk, belum pulang | "Sudah 8 jam sejak presensi masuk" → `/presensi` |
| `approvals` Pengajuan menunggu | 09:30 sampai 12:00 | Atasan (cuti bawahan > 24 jam); admin/super admin (cuti tahap HC dan koreksi presensi > 24 jam, tidak termasuk milik sendiri) | Satu ringkasan: "2 cuti bawahan, 1 koreksi presensi sudah menunggu lebih dari 24 jam" → layar terkait |

Tidak dikirim bila: akhir pekan atau hari libur (tabel Hari Libur), karyawan nonaktif, pengingat dimatikan, belum punya perangkat push, sedang cuti/sakit/dinas sehari penuh (`att_in`), punya Izin Keterlambatan disetujui (`att_in`), punya Izin Pulang Cepat disetujui (`att_out`), atau belum masuk kerja (tanggal masuk di masa depan).
Hanya push: tidak membuat baris di kotak notifikasi aplikasi (agar tidak menumpuk tiap hari).

## Jaminan
- **Sekali per orang per jenis per hari**: baris `reminder_log` (unik jenis+tanggal+karyawan) diklaim sebelum mengirim, sehingga cron yang berjalan berulang atau bersamaan tidak mengirim ganda.
- **Per panggilan maksimal 20 penerima** (menjaga jumlah permintaan keluar di bawah batas Workers). Bila masih ada sisa, API menjawab `more: true` dan Worker mengulang (sampai 6 putaran per pemicu; sisanya diteruskan pemicu 5 menit berikutnya).
- Pengingat dimatikan per pengguna lewat saklar **Pengingat harian** di Akun (kartu notifikasi); notifikasi pengajuan/keputusan tidak terpengaruh.
- Log pengingat lebih dari 30 hari dibersihkan otomatis.

## Keamanan
- `/api/internal/cron` hanya menerima `Authorization: Bearer <CRON_SECRET>` (perbandingan waktu-konstan; secret < 24 karakter ditolak). Tanpa login/token pengguna. Waktu selalu dari server; `?now=` dan `?dry=` hanya untuk uji lokal (`CRON_ALLOW_NOW=1` di `.dev.vars`, **tidak pernah** diset di produksi).
- `CRON_SECRET` ada di dua tempat dengan nilai sama: secret Pages dan secret Worker `teach-hris-cron`. Tidak di repo/chat.

## Operasi
- Deploy Worker: `npm run deploy:cron` (butuh `CRON_SECRET` sudah diisi: `wrangler secret put CRON_SECRET --config cron/wrangler.jsonc`).
- Lihat log: dashboard Cloudflare → Workers → teach-hris-cron → Logs (hanya mencatat saat ada yang diklaim, atau galat).
- Mengubah jam/ambang: `shared/src/reminders.ts`; jadwal pemicu: `cron/wrangler.jsonc`.
- Satu pemicu cron dipakai (bukan beberapa) agar tidak menghabiskan jatah pemicu akun.

## Pengujian
Data seed lokal dengan jam buatan: batas jendela (08:44:59, 08:45:00, 08:59:59, 09:00:00; 15:59:59 dan 16:00:00; 09:29, 09:30, 11:59, 12:00), akhir pekan dan libur, pengecualian cuti/izin/nonaktif/matikan pengingat, isi pesan ringkasan, dedup (panggilan ulang tidak mengklaim lagi), pengelompokan 20+5 dengan `more`, keamanan endpoint (tanpa/salah secret 401), dan Worker lewat pemicu uji (secret benar → API 200; salah → dicatat 401).
**Belum teruji**: kedatangan push sungguhan dari cron ke HP (jalur push-nya sendiri sudah terbukti di fitur Push), dan pemicu terjadwal Cloudflare di produksi.

## Batasan
- Presisi waktu cron Cloudflare sekitar satu menit; jendela 08:45 sampai 08:59 memberi tiga kesempatan (08:45, 08:50, 08:55).
- Pengingat pulang memakai "8 jam setelah masuk", bukan jam tetap; tidak memperhitungkan istirahat.
- Aplikasi Tauri (FCM) belum menerima pengingat (menunggu FCM).
