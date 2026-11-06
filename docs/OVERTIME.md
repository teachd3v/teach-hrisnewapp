# Izin & overtime

Diputuskan dan dibangun 2026-11-06 (lihat `docs/DECISIONS.md`). Migrasi 0015.

## Tampilan
- Tab bawah "Cuti" menjadi **Izin** (alamat `/cuti` tetap). Di bagian atas ada dua tombol sebaris: **Ajukan cuti** (kiri) dan **Ajukan overtime** (kanan, `/cuti/overtime`). Riwayat dipisah dengan tab Cuti | Overtime (`/cuti?riwayat=overtime`).
- Kartu saldo Ganti Hari menampilkan "termasuk N hari dari overtime" dan "N hari hangus".
- Persetujuan atasan (`/persetujuan`) dan layar HC (`/admin/cuti`, menu "Izin & overtime (HC)") memiliki tab Cuti | Overtime (`?jenis=overtime`). Lencana tab Izin menghitung cuti dan overtime yang menunggu persetujuan saya.

## Aturan
- Dua jenis: **Lembur** (hanya hari kerja) dan **Kerja di Hari Libur** (hanya akhir pekan atau tanggal di tabel Hari Libur). Pilihan yang tidak cocok dengan tanggalnya ditolak dengan petunjuk memakai jenis yang lain.
- Tanggal: sampai **14 hari ke belakang** dan **7 hari ke depan**; satu pengajuan aktif per karyawan per tanggal. Diisi jam mulai dan selesai (satu tanggal, selesai setelah mulai). **Minimal 4 jam** dan maksimal 16 jam per pengajuan. Alasan wajib.
- Yang boleh mengajukan: karyawan yang punya atasan (atau pucuk pimpinan), seperti cuti.
- Alur: atasan langsung → HC; pucuk pimpinan langsung ke HC; HC dapat **mengambil alih** pengajuan yang tertahan di atasan (alasan wajib, final, diaudit). Karyawan hanya membatalkan yang masih menunggu. Notifikasi (dalam aplikasi dan push) tanpa alasan; "perlu aksi" untuk atasan/HC ditandai selesai saat diputuskan.
- Penyetuju melihat chip "Ada/Tidak ada presensi pada tanggal ini" untuk Kerja di Hari Libur (informasi, bukan penolakan otomatis).

## Kredit Ganti Hari (otomatis setelah HC menyetujui)
Konstanta ada di satu tempat: `shared/src/overtime.ts`.
- **Kerja di Hari Libur**: 4 sampai kurang dari 6 jam = **0,5 hari**; 6 jam atau lebih = **1 hari**.
- **Lembur**: menit dijumlahkan **per tahun** (urut tanggal); tiap **4 jam = 0,5 hari**, sisa terbawa dan dijumlahkan dengan pengajuan berikutnya (5 jam + 5 jam + 5 jam = 15 jam = 1,5 hari).
- Tafsir atas jawaban "minimal 4 jam": batas minimal berlaku untuk kedua jenis, dan angka konversi di atas mengikuti usulan. Mudah diubah di konstanta bila tafsirnya berbeda.
- HC tidak mengubah angka kredit saat menyetujui.

### Saldo dan masa berlaku (dihitung saat dibaca, tidak ditulis ke kuota)
Saldo Ganti Hari dihitung dari "lot":
- **Lot dasar**: kuota Ganti Hari tahun itu (bawaan atau khusus per karyawan; bawaan 0), berlaku 1 Januari sampai 31 Desember tahun itu.
- **Lot overtime**: kredit berlaku sejak **tanggal overtime sampai 31 Maret tahun berikutnya** (3 bulan di tahun depan). Sesudah itu hangus.
- Pemakaian (cuti jenis Ganti Hari, dinilai pada **tanggal mulai**) mengambil dari lot yang paling cepat kedaluwarsa lebih dulu (kuota dasar dulu, lalu kredit overtime yang paling lama). Pemakaian pada Januari-Maret tahun depan boleh memakai kredit tahun lalu; setelah 31 Maret tidak.
- Kredit bertanggal masa depan (pengajuan lebih dulu) sudah masuk kuota tetapi baru tersedia mulai tanggal overtime-nya.
- Kuota Ganti Hari tanpa batas (bila diatur kosong) mematikan perhitungan lot.
- Form cuti mengirim `asOf` = tanggal mulai sehingga sisa yang ditampilkan dan dicek server sesuai tanggal itu. Saat HC menyetujui cuti Ganti Hari, kelebihan pemakaian (`shortfall` > 0) ditolak.

### Pencabutan
- Overtime yang sudah disetujui **hanya dapat dicabut HC** (alasan wajib). Pencabutan ditolak bila kreditnya sudah terpakai (kelebihan pemakaian Ganti Hari akan bertambah); batalkan atau ubah dulu pengajuan Ganti Hari karyawan. Pengajuan berstatus `cancelled` dengan `revoked_*` terisi dan tampil "Dicabut HC"; karyawan diberi tahu.

## API (`/api/overtime`, Bearer)
| Endpoint | Siapa | Fungsi |
|---|---|---|
| `GET /meta` | semua | aturan, jendela tanggal, hari libur di jendela, `canSubmit` |
| `GET /mine` | semua | riwayat sendiri |
| `POST /` `{kind, date, startTime, endTime, reason}` | semua | ajukan |
| `POST /:id/cancel` | pengaju | batalkan selama menunggu |
| `GET /approvals?tab=pending\|history` | atasan | bawahan langsung (dengan `hasAttendance`) |
| `POST /:id/manager-decision` `{approve, notes}` | atasan langsung | setuju/tolak |
| `GET /admin?status=pending_hc\|pending_manager\|approved\|all` | admin | daftar |
| `POST /:id/hc-decision`, `POST /:id/hc-override` `{approve, reason}` | admin | keputusan final / ambil alih |
| `POST /:id/revoke` `{reason}` | admin | cabut yang disetujui |

Audit: `overtime.submitted`, `overtime.cancelled`, `overtime.manager_decision`, `overtime.hc_decision`, `overtime.hc_override`, `overtime.revoked` (kelompok "Overtime").

## Rekap & ekspor
Ringkasan Excel mendapat dua kolom: **Lembur (jam)** dan **Kerja di hari libur (hari)** (hanya yang disetujui pada rentang tanggal rekap).

## Belum ada
- Overtime tidak otomatis dicocokkan dengan jam presensi (hanya keterangan ada/tidak ada presensi bagi penyetuju).
- Jam lembur yang tidak mencapai blok 4 jam di akhir tahun tidak terbawa ke tahun berikutnya (dijumlahkan per tahun).
- Pembayaran/kompensasi uang lembur di luar Ganti Hari tidak dicakup.
