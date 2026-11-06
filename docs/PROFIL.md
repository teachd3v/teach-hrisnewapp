# Profil karyawan

Diputuskan 2026-11-06 (lihat `docs/DECISIONS.md`). Dibangun bertahap; **dokumen belum ada** (menyusul).

## Yang ada
Akun > **Profil saya** (semua karyawan) dan, untuk HC/super admin, Karyawan > (karyawan) > **Lihat profil lengkap**. Isinya:
- **Kepala**: foto profil (unggah/ganti/hapus), nama, jabatan, departemen, status, level.
- **Kelengkapan** (tidak memblokir apa pun): persen dan daftar yang belum terisi (12 kolom personal, satu kontak darurat, satu pendidikan, foto).
- **Personal**: telepon, NIK, tempat/tanggal lahir, kewarganegaraan, status pernikahan, agama dan golongan darah (opsional), alamat domisili, kota, provinsi, kode pos, alamat KTP, rekening bank (nama bank, nomor, nama pemilik). NIK dan nomor rekening disamarkan di tampilan; nilai penuh hanya di form ubah.
- **Keluarga**: kontak darurat dan anggota keluarga.
- **Edukasi**: pendidikan formal, non-formal, pelatihan, keterampilan, bahasa.
- **Aktivitas**: pengalaman kerja, organisasi, kepanitiaan, kegiatan sosial, prestasi, minat karier, dan riwayat promosi (hanya HC yang mengisi; karyawan melihat saja).
- Keterangan penggunaan data ditampilkan sampai karyawan menekan "Saya mengerti" (`employees.profile_consented_at`).

## Aturan akses (ditegakkan server, `api/src/routes/profile.ts`)
| Siapa | Profil lengkap | Mengubah | Kartu ringkas (nama, jabatan, departemen, foto) |
|---|---|---|---|
| Pemilik | ya | ya, langsung (tanpa persetujuan) | ya |
| HC / super admin | ya | ya, termasuk bagian khusus HC | ya |
| Atasan langsung, karyawan lain | **tidak** (403) | tidak | ya |
- Nama dan email tetap hanya diubah HC (menu Karyawan), bukan lewat profil.
- Foto profil terlihat oleh semua pengguna login lewat tautan bertanda tangan 5 menit; hanya berkas yang benar-benar menjadi foto seorang karyawan yang bisa ditautkan.
- Batas 50 butir per bagian per karyawan.

## Data
- Kolom personal ada di `employees` (migrasi 0013). Semua daftar berulang di **satu tabel** `profile_entries` (`section` + `data` JSON + urutan). Definisi bagian, kolom, pilihan, dan validasi ada di `shared/src/profile.ts` (dipakai server untuk memvalidasi dan klien untuk membangun form generik); menambah bagian cukup menambah definisi.
- Validasi: NIK 16 digit; kode pos 5 digit; rekening 5-20 digit; telepon 6-20 karakter (angka, +, -, spasi); tanggal ISO (lahir tidak boleh di masa depan atau sebelum 1900); tahun 4 digit; pilihan harus dari daftar; teks dipangkas dan dibatasi panjangnya. Kolom yang tidak dikenal diabaikan (tidak ada celah mengubah `role` dkk lewat profil).
- Foto: JPG/PNG/WEBP maks. 2 MB (klien memotong persegi dan mengecilkan ke maks. 512 px sebelum unggah), disimpan di R2 `profile_photos/{id}/…`; foto lama dihapus saat diganti.

## API (`/api/profile`, Bearer; `:id` boleh `me`)
| Endpoint | Fungsi |
|---|---|
| `GET /:id` | profil lengkap (pemilik/admin) + kelengkapan + izin |
| `GET /:id/card` | kartu ringkas (semua pengguna login) |
| `PATCH /:id/personal` | ubah sebagian kolom personal |
| `POST /:id/entries` `{section, data}` | tambah butir |
| `PATCH /entries/:entryId` `{data}`, `DELETE /entries/:entryId` | ubah/hapus butir |
| `POST /:id/photo` (multipart `file`), `DELETE /:id/photo` | foto profil |
| `POST /me/consent` | tandai keterangan penggunaan data sudah dibaca |

## Audit
- `profile.view` (perlu perhatian): membuka profil **orang lain**; satu catatan per pasangan pelaku-tujuan per 10 menit agar muat ulang layar tidak membanjiri log.
- `profile.updated`: yang dicatat hanya **nama kolom** yang berubah atau bagian dan jenis operasinya (`add`/`edit`/`delete`); nilai (NIK, rekening, dst.) tidak masuk log.
- `profile.photo`: ganti atau hapus foto.

## Belum ada
- **Dokumen** (KTP, KK, NPWP, ijazah, sertifikat, kontrak): rencananya R2 + tautan bertanda tangan + audit akses; PDF/JPG/PNG/WEBP maks. 5 MB; karyawan dan HC dapat mengunggah.
- Ekspor CV (PDF/Excel).
- Tampilan foto di daftar lain (persetujuan, presensi HC, dll.): saat ini hanya di Akun dan halaman profil.
- Data dari project lama tidak diimpor (mulai kosong).
