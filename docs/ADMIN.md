# Menu admin

Endpoint di `/api/admin` (peran dibaca ulang dari D1, bukan dari token). Semua perubahan tercatat di log audit.

| Hak | Admin (HC) | Super admin |
|---|---|---|
| Lihat daftar karyawan | ya | ya |
| Tambah karyawan (password awal sekali pakai, wajib diganti) | ya, peran `employee` saja, tanpa data kepegawaian | ya, semua peran |
| Ubah nama, email, telepon, jenis kelamin, kode, atasan, pucuk pimpinan | ya (bukan akun admin lain) | ya |
| Ubah jabatan, departemen, level, status, tanggal masuk, peran, aktif/nonaktif | tidak | ya |
| Reset password (mencabut semua sesi, membuka kunci akun) | ya (bukan akun admin lain) | ya |
| Kuota cuti per karyawan/jenis/tahun (kosong = kembali ke bawaan) | ya | ya |
| Hari libur (tambah/ubah/hapus) | ya | ya |

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
