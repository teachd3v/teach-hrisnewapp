# Log audit

Catatan semua kejadian penting: siapa, melakukan apa, kepada siapa/apa, kapan (UTC di D1, tampil WIB), dari alamat IP mana. Tabel `audit_log` **tambah-saja**: trigger SQL (`0001_audit_triggers.sql`) menolak `UPDATE` dan `DELETE`, termasuk lewat SQL manual.

## Layar (Akun → Log audit, khusus super admin)
- Daftar terbaru dulu; ketuk satu catatan untuk rincian lengkap (waktu, pelaku, aksi dan kodenya, target, alamat IP, semua isi `details`).
- **Filter** (lembar bawah): kategori, pelaku, pencarian teks, dan rentang tanggal (WIB, kalender). Filter aktif tampil sebagai chip yang bisa dihapus satu per satu atau di-reset.
- Pencarian mencocokkan nama pelaku, nama target, **kata pada label aksi** (mis. "kuota", "koreksi"), kode aksi, dan alamat IP. `%` dan `_` diperlakukan sebagai huruf biasa, bukan wildcard.
- Aksi yang layak diperhatikan diberi penanda "Perlu perhatian": gagal masuk, akun terkunci, token sesi dipakai ulang, ambil alih HC, reset password karyawan, membuka berkas milik orang lain, dan pengambilan rekap.
- Penelusuran per halaman 30 catatan (kursor `waktu|id`, tanpa duplikat), tombol "Muat lebih banyak".

## API
`GET /api/audit?group=&action=&actor=&q=&from=&to=&cursor=&limit=` hanya untuk **super admin** (peran dibaca ulang dari D1); admin biasa dan karyawan mendapat 403. Kategori: auth, leave, attendance, employee, master, holiday, file, report.

## Daftar aksi
Label dan kelompok ada di `shared/src/audit-labels.ts`. Aksi baru yang belum diberi label tetap tampil dengan kode aslinya; tambahkan labelnya di file itu saat membuat aksi baru.

## Batasan
- Melihat log itu sendiri **tidak dicatat** (akan sangat berisik); akses ke datanya dibatasi pada super admin.
- Tidak ada ekspor log dan tidak ada masa simpan/arsip; tabel terus bertambah (D1 cukup untuk ukuran organisasi ini; tinjau bila sudah ratusan ribu baris).
- `details` memuat catatan keputusan dan alasan ambil alih/koreksi, jadi layar ini sensitif.
- Percobaan masuk dengan email tak dikenal tercatat dengan email yang diketik sebagai target; tidak ada pembatasan laju per alamat IP (masih terbuka).
