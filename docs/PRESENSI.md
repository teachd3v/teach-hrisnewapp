# Presensi

## Kebijakan (diputuskan 2026-11-05)
- **Lokasi hanya dicatat**, tidak memblokir. Server menghitung jarak ke kantor (-6.4733643, 106.7274949, radius 1 km; konstanta `OFFICE` di `shared/src/attendance.ts`). Di luar radius atau tanpa lokasi ditandai untuk HC.
- **Jam masuk paling lambat 09:00 WIB, tanpa toleransi** (09:00:00 tepat waktu, 09:00:01 terlambat 1 menit). Satu aturan untuk semua karyawan (`WORK_START_SECONDS` di `shared/src/attendance.ts`).
  - Pengecualian: **Izin Keterlambatan (menu Cuti) yang sudah disetujui** pada tanggal itu. Izin yang masih menunggu belum membebaskan.
  - Terlambat **dihitung saat dibaca, tidak disimpan**, jadi izin yang disetujui sesudah presensi otomatis ikut berlaku.
  - Presensi tidak diblokir; ditandai: Terlambat N mnt (merah), Terlambat (izin disetujui), Disetujui: {Cuti/Sakit/Dinas Luar Kota/…}, Libur: {nama}, Akhir pekan. Ringkasan terlambat tampil di layar HC.
  - Jam pulang dan durasi kerja hanya dicatat (belum ada aturan jam pulang).
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
| `GET /today` | presensi hari ini (tanggal WIB dari server) |
| `GET /mine?month=YYYY-MM` | riwayat sendiri |
| `POST /clock-in`, `POST /clock-out` | multipart: `photo`, `lat`, `lng`, `accuracy`, `face` |
| `GET /admin?date=` | HC: semua karyawan aktif pada satu tanggal |

Aturan server: waktu dan tanggal dari server (bukan perangkat); satu presensi masuk per hari; pulang butuh masuk lebih dulu dan hanya sekali (update bersyarat, dua permintaan bersamaan tidak sama-sama lolos); foto dicek dari isi berkas (JPG/PNG/WEBP, maks. 3 MB); koordinat divalidasi; jarak dihitung server.
Foto di R2 `attendance/{id}/{tanggal}/…`, dibuka lewat tautan bertanda tangan 5 menit. **Hanya pemilik dan admin** (atasan langsung tidak); akses admin tercatat di audit.

## Batasan yang perlu diketahui
- "Wajah terdeteksi" berasal dari perangkat; bukan verifikasi identitas. Foto dilihat HC bila perlu.
- Lokasi palsu (aplikasi mock GPS) dan jam perangkat tidak bisa dideteksi dari web; jam memang dari server, lokasi tidak.
- Lupa presensi pulang: baris tetap "Belum pulang"; belum ada koreksi oleh HC atau penutupan otomatis.
- Presensi di hari cuti/libur/akhir pekan ditandai, tidak dicegah. Hari libur mengikuti tabel Hari Libur; tidak ada kalender kerja per karyawan.
- Izin Keterlambatan membebaskan seluruh hari itu; jam estimasi yang diisi pada izin belum dibandingkan dengan jam presensi.
- Belum diuji di HP nyata: kamera, GPS, dan deteksi wajah. Di emulasi browser, kamera dan GPS dipalsukan untuk menguji alur, jadi deteksi wajah nyata belum teruji.
