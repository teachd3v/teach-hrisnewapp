# Migrasi profil dan dokumen dari sistem lama (hrteach.site)

Cakupan (diputuskan 2026-11-12): karyawan departemen **REMO** dan **Haryo Mojopahit** (pucuk pimpinan), hanya profil dan dokumen. Tidak ikut: presensi, cuti, penilaian, notifikasi.
Skrip: `api/scripts/migrate-from-old.ts`. Semua langkah membaca sistem lama saja. Berkas keluaran berisi data pribadi: simpan di luar repo (bawaan: `LOCALHOST/migrasi-data/`), jangan di-commit.

## Aturan pemetaan
| Hal | Aturan |
|---|---|
| Akun | Dicocokkan lewat email (email atau email institusional lama). Ada: ditimpa dengan nilai lama yang terisi (nilai lama kosong tidak menghapus data baru). Belum ada: dibuat dengan id lama. Peran super admin tidak diturunkan. |
| Password | Semua akun yang termigrasi **diatur ulang ke satu password sementara** (wajib ganti saat masuk pertama), sesi lama dicabut. Termasuk akun yang sudah ada di sistem baru. |
| Atasan | Karyawan REMO → Nurhadi Widodo; Nurhadi → Haryo Mojopahit; Haryo `is_top_leader`, tanpa atasan. |
| Master | Departemen, level, status: dicocokkan nama ke `master_options` (nilai lama sama persis dengan master baru; "-" dan kosong menjadi kosong). |
| Rekening | Lama: satu teks "BANK - nomor". Baru: nama bank dan nomor dipisah; nama pemilik rekening dikosongkan. |
| Riwayat profil | 14 tabel lama → `profile_entries` (id `mig-…`). Divalidasi dengan aturan server (`validateFields`); nilai tak valid dibuang dan dihitung di laporan. Istilah dialih-bahasakan (Beginner→Pemula, Istri/Suami→Pasangan, Fluent→Lanjut, dst.). Kolom tanggal yang di sistem lama hanya berisi tahun menjadi 1 Januari tahun itu; rentang tahun menjadi tahun awal. |
| Dokumen | Satu baris per berkas (dokumen lama multi-berkas dipecah, judul diberi "(1/2)"). Kategori: Pendidikan→ijazah, Pelatihan→sertifikat, Pekerjaan→**pekerjaan**, Prestasi→**prestasi** (dua kategori baru), Identitas→ktp/kk/npwp menurut judul, Lainnya→lainnya. |
| Berkas R2 | `documents/{id}/x` → `employee_documents/migrated/{id}/x`; `avatars/…` → `profile_photos/migrated/{id}/…`. Dibuka lewat baris database, tidak bergantung pada awalan id. |

Idempoten: menjalankan `migrate.sql` lagi menghapus baris `mig-…` milik karyawan itu lalu mengisi ulang. Isian profil dan dokumen yang dibuat manual di sistem baru tidak disentuh.

## Urutan (Windows cmd)
Langkah 0 dan 2-6 dijalankan dari **satu folder**, yaitu repo sistem baru. Buka cmd lalu masuk ke sana dulu:
```
cd /d "C:\Users\Asus VivoBook\Documents\LOCALHOST\new-hris-teach\hris-spa-teachapp"
```
Folder data: `C:\Users\Asus VivoBook\Documents\LOCALHOST\migrasi-data` (berisi `hrteach-export.sql`, dan nanti folder `out`).

0. **Deploy kode** (kategori dokumen baru); harus selesai sebelum langkah 6. Dari folder repo di atas:
   ```
   git add shared/src/profile.ts api/scripts/migrate-from-old.ts docs/MIGRASI.md
   git commit -m "Kategori dokumen pekerjaan dan prestasi, skrip migrasi dari sistem lama"
   git push
   ```
   Tunggu GitHub Actions hijau (tab Actions di repo `teach-hrisnewapp`). Tidak ada migrasi database baru, jadi tidak ada yang dijalankan manual.
1. Ekspor D1 lama: **sudah dilakukan**, tidak perlu diulang.
2. Rencana berkas (folder repo):
   `npx tsx api/scripts/migrate-from-old.ts plan "C:\Users\Asus VivoBook\Documents\LOCALHOST\migrasi-data\hrteach-export.sql" "C:\Users\Asus VivoBook\Documents\LOCALHOST\migrasi-data\out"`
3. Salin berkas R2 lama ke bucket baru (folder repo; butuh `npx wrangler login` sekali bila belum; bisa diulang, yang sudah tersalin dilewati):
   `npx tsx api/scripts/migrate-from-old.ts copy "C:\Users\Asus VivoBook\Documents\LOCALHOST\migrasi-data\out"`
   Baca daftar "TIDAK ADA/GAGAL" bila ada.
4. Buat SQL (folder repo). Ganti `PasswordSementara` dengan pilihanmu; tanpa spasi sebelum `&&`:
   `set MIG_TEMP_PASSWORD=PasswordSementara&& npx tsx api/scripts/migrate-from-old.ts sql "C:\Users\Asus VivoBook\Documents\LOCALHOST\migrasi-data\hrteach-export.sql" "C:\Users\Asus VivoBook\Documents\LOCALHOST\migrasi-data\out"`
   Lalu baca `out\sql-report.txt`. Hanya berkas yang tersalin yang dibuatkan baris dokumennya.
5. Cek akun yang akan ditimpa (folder repo; baca saja):
   `npx wrangler d1 execute hris-spa-db --remote --file "C:\Users\Asus VivoBook\Documents\LOCALHOST\migrasi-data\out\preflight.sql"`
6. Jalankan (folder repo):
   `npx wrangler d1 execute hris-spa-db --remote --file "C:\Users\Asus VivoBook\Documents\LOCALHOST\migrasi-data\out\migrate.sql"`
7. Periksa di aplikasi (Karyawan, Profil, Dokumen) dan bagikan password sementara ke tiap orang.
8. Hapus folder `out` bila sudah tidak perlu (mengandung data pribadi dan hash password).

Pengujian (2026-11-12): dijalankan di D1 lokal dua kali; jumlah baris sama (tidak ganda), atasan dan pucuk pimpinan benar.
