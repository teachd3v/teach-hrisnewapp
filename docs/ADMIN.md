# Menu admin

Endpoint di `/api/admin` (peran dibaca ulang dari D1, bukan dari token). Semua perubahan tercatat di log audit.

| Hak | Admin (HC) | Super admin |
|---|---|---|
| Lihat daftar karyawan | ya | ya |
| Tambah karyawan (password awal sekali pakai, wajib diganti) | ya, peran `employee` saja, tanpa data kepegawaian | ya, semua peran |
| Ubah nama, email, telepon, jenis kelamin, kode, atasan, pucuk pimpinan | ya (bukan akun admin lain) | ya |
| Ubah jabatan, departemen, level, status, tanggal masuk, peran, aktif/nonaktif | tidak | ya |
| Reset password (mencabut semua sesi, membuka kunci akun) | ya (bukan akun admin lain) | ya |
| Lihat data master (departemen, level, status) | ya | ya |
| Kelola data master (tambah, ubah nama, nonaktifkan, urutan, hapus) | tidak | ya |
| Kuota cuti per karyawan/jenis/tahun (kosong = kembali ke bawaan) | ya | ya |
| Lihat jenis cuti (`GET /api/leave-types`) | ya (rinci) | ya (rinci); karyawan biasa hanya nama |
| Kelola jenis cuti: tambah, ubah nama/keterangan/kuota bawaan/lampiran/jenis kelamin, aktif-nonaktif, urutan, hapus (Data master > Cuti) | tidak | ya |
| Hari libur (tambah/ubah/hapus) | ya | ya |
| Lihat pengaturan cuti bersama memotong Cuti Tahunan (`GET /api/admin/settings/joint-leave`) | ya | ya |
| Ubah pengaturan itu: saklar dan status yang dikecualikan (`PUT`; disimpan di `app_settings`, tercatat di audit) | tidak | ya |

## Tata letak menu admin (Akun)
Menu Admin di tab Akun dikelompokkan dan bisa dilipat (`web/src/pages/Account.tsx`). Pilihan buka/tutup tiap kelompok diingat di perangkat; kelompok tanpa menu yang boleh dilihat peran itu disembunyikan.
| Kelompok | Menu | Catatan |
|---|---|---|
| **Persetujuan** (terbuka bawaan) | Izin & overtime, Koreksi presensi, Pendaftaran wajah | Lencana angka = pekerjaan yang menunggu HC. Kelompok yang tertutup menampilkan jumlah totalnya. |
| Presensi & laporan | Presensi harian, Rekap & ekspor Excel | |
| Kelola data | Karyawan, Kuota cuti, Hari libur, Data master (super admin) | |
| Sistem (super admin) | Pengaturan presensi, Log audit | |

Angka lencana dari `GET /api/admin/queues` (admin): `leave` dan `overtime` berstatus menunggu HC, `corrections` koreksi presensi menunggu, `face` pendaftaran wajah menunggu. Dimuat ulang setiap Akun dibuka dan tiap menit. Akhiran "(HC)" tidak dipakai di nama menu dan judul halaman.

## Dashboard Beranda (admin dan super admin)
Beranda admin punya tab **[Saya | Ringkasan]** (`web/src/pages/Home.tsx`); karyawan biasa tidak melihat tab dan tidak memanggil API dashboard. Bawaan "Saya", pilihan terakhir diingat di perangkat. Isi Ringkasan, tiap kartu memuat datanya sendiri:
- **Perlu tindakan**: ubin antrean (izin & overtime, koreksi, wajah) dari `GET /api/admin/queues`; hanya tampil bila ada yang menunggu.
- **Kehadiran** Harian/Bulanan, `GET /api/dashboard/attendance?mode=day&date=` dan `?mode=month&month=`. Memakai aturan Rekap (jam masuk berefektif-tanggal, izin terlambat, hari libur, cuti sehari penuh). Hari berjalan: "Belum presensi"; "Tidak hadir" hanya sampai kemarin. Tingkat bulanan = hadir / (hadir + tidak hadir). Tanggal sebelum 2024-01-01 atau masa depan ditolak.
- **Momen karyawan**, `GET /api/dashboard/people?month=`: tab Ulang tahun, Masa kerja (tonggak LSA ditandai), LSA (bulan ini + 3 bulan ke depan; tonggak 5, 7, 10, 14, 20 tahun). Ulang tahun hanya tanggal dan bulan (tahun lahir tidak dikirim). Ada petunjuk "N karyawan belum punya tanggal lahir/masuk".
Endpoint hanya untuk admin. Aturan murni ada di `shared/src/moments.ts`. Tanpa migrasi; tidak ada audit per pemuatan dashboard.
Belum ada: pencatatan LSA "sudah diberikan", ulang tahun terlihat semua karyawan, grafik tren, notifikasi push ulang tahun.

## Data master (`/api/master`)
Departemen, level, dan status kepegawaian adalah pilihan dropdown di form karyawan. Karyawan menyimpan **id** (`department_id`, `level_id`, `employment_status_id`), jadi mengganti nama berlaku untuk semua. Jabatan tetap teks bebas.
- Nama unik per jenis (tanpa membedakan huruf besar kecil). Item yang dipakai tidak bisa dihapus, hanya dinonaktifkan; item nonaktif hilang dari dropdown tetapi karyawan lama tetap menampilkannya dan boleh menyimpan perubahan lain.
- Urutan bisa diatur (penting untuk level). Isi awal dari project lama: departemen IDEAS, SGLT, BI, Budaya, REMO, LSP; level Direktur sampai Pelaksana; status Kontrak, Tetap, Probation, Magang.
- Server menolak id yang jenisnya salah atau yang nonaktif saat dipilih.

## Aturan
- Atasan: tidak boleh diri sendiri atau membentuk rantai melingkar; harus karyawan aktif. Pucuk pimpinan tidak punya atasan.
- Harus tersisa minimal satu super admin aktif; tidak bisa menonaktifkan akun sendiri.
- Menonaktifkan akun mencabut semua refresh token-nya.
- Kuota kelipatan 0,5 hari, 0-366.
- Mengubah hari libur tidak menghitung ulang pengajuan yang sudah ada.

## Belum ada
- Impor massal karyawan (diputuskan mulai kosong; tambah satu per satu).
- Tampilan log audit di UI (data sudah tercatat, baca lewat D1).
- Hapus karyawan (hanya nonaktifkan, supaya riwayat cuti dan audit tetap utuh).
