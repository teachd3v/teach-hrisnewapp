# Presensi

## Kebijakan (diputuskan 2026-11-05; pengaturan oleh super admin sejak 2026-11-06)
Aturan lokasi dan jam masuk diatur di **Akun > Pengaturan presensi** (super admin mengubah, admin melihat), disimpan di tabel `office_locations` dan `attendance_policies`; semua perubahan tercatat di audit (`setting.changed`).
- **Lokasi kantor (geofence): satu atau beberapa**, masing-masing dengan nama, koordinat, radius (20-5000 m), aktif/nonaktif; tombol "Pakai lokasi saya sekarang" mengisi koordinat dari GPS perangkat. Server menilai jarak ke lokasi aktif **terdekat** dan menyimpan jaraknya serta penanda `clock_in_outside`/`clock_out_outside` (**snapshot saat presensi**, tidak dihitung ulang bila radius diubah). Awal: satu titik "Kantor" (-6.4733643, 106.7274949, radius 1 km).
- **Mode lokasi** (bagian dari aturan, bawaan `flag`):
  - `flag`: lokasi hanya dicatat/ditandai, presensi tidak diblokir. Di luar radius atau tanpa lokasi ditandai untuk HC.
  - `block`: presensi masuk dan pulang **ditolak (403)** bila lokasi tidak ada atau di luar radius + margin akurasi GPS (margin = akurasi perangkat, maks. 100 m). Tombol "Kirim tanpa lokasi" tidak tersedia. Karyawan dengan **Dinas Luar Kota yang disetujui** pada hari itu dibebaskan; selebihnya lewat koreksi HC. Mode ini hanya dapat diaktifkan bila ada minimal satu lokasi aktif, dan lokasi aktif terakhir tidak dapat dinonaktifkan/dihapus selama aturan blokir sedang atau akan berlaku.
- **Jam masuk paling lambat dan toleransi (satu aturan untuk semua karyawan; bawaan 09:00 WIB, toleransi 0).** Terlambat bila lewat jam masuk + toleransi; **menit terlambat dihitung dari jam masuk** (09:05:01 dengan toleransi 5 menit = terlambat 6 menit). Bawaan: 09:00:00 tepat waktu, 09:00:01 terlambat 1 menit.
  - **Aturan berlaku mulai tanggal tertentu** (bawaan besok, tidak boleh lampau): terlambat dihitung dengan aturan yang berlaku pada tanggal presensinya, jadi mengubah jam masuk tidak menulis ulang riwayat dan laporan lama. Aturan yang dijadwalkan dapat dibatalkan sebelum berlaku; yang sudah berlaku tidak dapat dihapus (buat aturan baru).
  - Pengecualian: **Izin Keterlambatan (menu Cuti) yang sudah disetujui** pada tanggal itu. Izin yang masih menunggu belum membebaskan.
  - Terlambat **dihitung saat dibaca, tidak disimpan**, jadi izin yang disetujui sesudah presensi otomatis ikut berlaku.
  - Jam masuk hanya berlaku di **hari kerja** (Senin-Jumat di luar hari libur); presensi di akhir pekan/libur tidak dihitung terlambat.
  - Ditandai (presensi tidak diblokir karena terlambat): Terlambat N mnt (merah), Terlambat (izin disetujui), Disetujui: {Cuti/Sakit/Dinas Luar Kota/…}, Libur: {nama}, Akhir pekan. Ringkasan terlambat tampil di layar HC.
  - Jam pulang dan durasi kerja hanya dicatat (belum ada aturan jam pulang).
  - Pengingat "belum presensi masuk" mengikuti jam masuk pada aturan yang berlaku hari itu (15 menit sebelum batas).
- **Foto selfie wajib** saat masuk dan pulang.

## Alur di HP
Tab Presensi (kartu hari ini + riwayat per bulan) → "Presensi masuk/pulang" → layar kamera:
kamera depan 3:4 (tampilan dicerminkan), kotak deteksi wajah kuning, foto otomatis setelah wajah stabil 3 detik atau tombol "Ambil foto" → layar konfirmasi (Ulangi / Kirim). Lokasi diminta paralel sejak layar dibuka.
- Kamera gagal/ditolak: tombol "Buka kamera sistem" (`<input capture>`), foto tetap wajib.
- Deteksi wajah gagal dimuat: tombol manual tetap berfungsi; foto ditandai "wajah tidak terdeteksi otomatis".
- Lokasi gagal/ditolak: pengguna bisa "Coba lokasi lagi" atau "Kirim tanpa lokasi" (tercatat tanpa titik lokasi).
- Foto diproses di perangkat (potong 3:4, maks. 900 px, JPEG), tidak dicerminkan.

## API (`/api/attendance`, Bearer)
| Endpoint | Fungsi |
|---|---|
| `GET /today` | presensi hari ini (tanggal WIB dari server) + aturan yang berlaku (`policy`: jam masuk, toleransi, mode lokasi) |
| `GET /mine?month=YYYY-MM` | riwayat sendiri |
| `POST /clock-in`, `POST /clock-out` | multipart: `photo`, `lat`, `lng`, `accuracy`, `face` |
| `GET /admin?date=` | HC: semua karyawan aktif pada satu tanggal |
| `GET/PUT/DELETE /api/attendance-settings…` | pengaturan presensi: lokasi (`/locations`) dan aturan (`/policy`); admin membaca, super admin mengubah |

Aturan server: waktu dan tanggal dari server (bukan perangkat); satu presensi masuk per hari; pulang butuh masuk lebih dulu dan hanya sekali (update bersyarat, dua permintaan bersamaan tidak sama-sama lolos); foto dicek dari isi berkas (JPG/PNG/WEBP, maks. 3 MB); koordinat divalidasi; jarak dan penilaian di luar radius dihitung server; pada mode `block` presensi di luar radius ditolak sebelum foto disimpan.
Foto di R2 `attendance/{id}/{tanggal}/…`, dibuka lewat tautan bertanda tangan 5 menit. **Hanya pemilik dan admin** (atasan langsung tidak); akses admin tercatat di audit.

## Koreksi presensi (lupa masuk/pulang)
Karyawan mengajukan, **HC memutuskan** (satu tahap). Menu: Presensi → "Lupa presensi? Ajukan koreksi"; antrean HC di Akun → Koreksi presensi (HC).
- Jenis ditentukan **server** dari data tanggal itu: tidak ada presensi -> masuk dan pulang diisi ("both"); ada masuk tanpa pulang -> hanya pulang ("out_only"); sudah lengkap -> ditolak. Lupa masuk berarti pulang juga kosong (tombol pulang butuh masuk).
- Hanya tanggal yang sudah lewat, sampai 7 hari kalender ke belakang. Jam masuk dari presensi asli tidak pernah diubah. Pulang harus sesudah masuk, tanggal sama (WIB). Alasan wajib. Satu pengajuan menunggu per tanggal.
- Disetujui -> menulis ke presensi dan menandainya "Dikoreksi HC" (tanpa foto/lokasi). Terlambat tetap dihitung dengan aturan 09:00 (koreksi masuk 09:45 tetap terlambat kecuali ada izin terlambat disetujui).
- HC tidak bisa memutuskan koreksinya sendiri. Saat diputuskan keadaan data diperiksa lagi (mis. jam pulang sudah terisi -> setuju ditolak server, HC cukup menolak). Dua putusan bersamaan tidak sama-sama lolos.
- Notifikasi: HC (perlu aksi) saat diajukan, pemohon saat diputuskan; tanpa alasan. Semua tercatat di audit.
- API: `/api/attendance-corrections` (`POST /`, `GET /state?date=`, `GET /mine`, `POST /:id/cancel`, `GET /admin`, `POST /:id/decision`).

## Batasan yang perlu diketahui
- "Wajah terdeteksi" berasal dari perangkat; bukan verifikasi identitas. Foto dilihat HC bila perlu.
- Lokasi palsu (aplikasi mock GPS) dan jam perangkat tidak bisa dideteksi dari web; jam memang dari server, lokasi tidak.
- Tidak ada penutupan otomatis untuk lupa pulang; baris tetap "Belum pulang" sampai dikoreksi (batas 7 hari). Koreksi tidak membuktikan kehadiran; mengandalkan penilaian HC.
- Presensi di hari cuti/libur/akhir pekan ditandai, tidak dicegah. Hari libur mengikuti tabel Hari Libur; tidak ada kalender kerja per karyawan.
- Izin Keterlambatan membebaskan seluruh hari itu; jam estimasi yang diisi pada izin belum dibandingkan dengan jam presensi.
- Alur kamera, GPS, dan deteksi wajah sudah dicoba di browser HP nyata oleh pemilik dan berfungsi baik (2026-11-05). Belum diuji di dalam aplikasi Tauri (menunggu spike).

## Rekap & ekspor Excel (HC)
Akun → Rekap & ekspor Excel. HC memilih **rentang tanggal bebas** (dari - sampai; pilihan cepat: bulan ini, bulan lalu, 7 dan 30 hari terakhir; maksimal 92 hari, tidak melewati hari ini) dan, bila perlu, satu departemen. Layar menampilkan ringkasan per karyawan, lalu **Unduh Excel** (.xlsx, dibuat di perangkat tanpa dependensi rentan).
- Lembar **Ringkasan** per karyawan: hari kerja, hadir, tidak hadir, terlambat (hari dan total menit), terlambat berizin, belum pulang, dikoreksi, di luar kantor, tanpa lokasi, total jam kerja, cuti (Tahunan, Sakit, Dinas Luar Kota, lainnya), izin terlambat/pulang cepat (kali).
- Lembar **Rincian** per hari: jam masuk/pulang, durasi, menit terlambat, status, keterangan (libur, cuti, tidak hadir), tanda koreksi, lokasi.
- Aturan sama dengan layar: batas jam masuk pada aturan yang berlaku di tiap tanggal (ditulis di bagian atas file Excel), izin terlambat disetujui, libur dari tabel Hari Libur. "Tidak hadir" = hari kerja tanpa presensi dan tanpa cuti/izin sehari penuh yang disetujui, dihitung sampai kemarin (hari ini belum selesai) dan sejak tanggal masuk kerja karyawan.
- API `GET /api/reports/range?from=&to=&department=` hanya untuk admin; setiap pengambilan tercatat di audit (`report.range`).
- Di aplikasi Tauri, unduh berkas butuh plugin tambahan (belum dikerjakan); di browser/PWA berfungsi.
