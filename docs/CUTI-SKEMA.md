# Skema cuti: periode, apresiasi masa kerja, dan kuota manual

Status: keputusan HC sudah diterima (lihat butir terakhir `docs/DECISIONS.md`). Belum dibangun. Dokumen ini menjadi acuan implementasi.

## Keputusan HC

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Cuti Besar: per milestone atau total? | **10 hari per milestone** (masa kerja 7, 14, dan 21 tahun), jadi 30 hari dalam 21 tahun. |
| 2 | Hangus dihitung dari apa? | **Dari tanggal milestone**, 2 tahun. Sisa hari **tetap hangus** walau sebagian sudah diajukan. |
| 3 | Cuti Besar: batas pengajuan? | **Maksimal 5 hari per pengajuan**. Boleh mengajukan lagi sampai saldo habis. |
| 4 | Cuti bulanan: boleh dibawa? | **Hangus di akhir bulan**. Bulan baru mendapat kuota baru. |
| 5 | Cuti Berkabung: satu atau beberapa kejadian? | **Beberapa kejadian dalam satu bulan** boleh, selama tanggalnya berbeda. Kuota 5 hari per bulan dipakai bersama untuk semua kejadian di bulan itu. |
| 6 | Pengajuan lintas bulan? | Dihitung ke **bulan tanggal mulai**. |
| 7 | Kuota manual per karyawan? | **Tetap bisa diatur manual** oleh Admin dan Super Admin. |

## Jenis cuti yang terdampak

| Jenis | Periode | Kuota | Batas per pengajuan | Hangus | Pemberian |
|---|---|---|---|---|---|
| Cuti Tahunan | tahun | 12 hari | - | akhir tahun | dasar (otomatis) |
| Cuti Berkabung Keluarga Inti | **bulan** | 5 hari | - | akhir bulan | dasar bulanan |
| Cuti Haid | **bulan** | **2 hari** | - | akhir bulan | dasar bulanan (Perempuan) |
| Cuti Besar | **milestone** | 10 hari | **5 hari** | **2 tahun dari milestone** | apresiasi otomatis (7, 14, 21 tahun) |
| Jenis lain | sesuai data | sesuai data | - | sesuai data | manual |

**Cuti Berkabung, beberapa kejadian per bulan:** kuota 5 hari per bulan dipakai bersama. Karyawan boleh mengajukan lebih dari satu kali dalam sebulan, dengan tanggal yang tidak tumpang tindih. Setelah bulan berganti, kuota baru tersedia.

## Model data

**`leave_types` (aturan per jenis) — kolom baru:**
- `quota_period`: `year` | `month` | `none`
- `max_days_per_request`: nullable (Cuti Besar = 5)
- `expiry_months`: nullable (Cuti Besar = 24, dihitung dari milestone)
- `service_milestones_years`: JSON, mis. `[7,14,21]` (Cuti Besar); null untuk jenis lain

**`leave_grants` (pengganti `leave_quotas`) — satu baris per pemberian:**
- `id`, `employee_id`, `leave_type`, `days`, `valid_from`, `valid_until`, `source` (`base` | `manual` | `service_award` | `overtime`), `source_ref`, `created_at`, `created_by`
- Unik pada (`employee_id`, `leave_type`, `source_ref`). `source_ref` contohnya `2026` (tahunan), `2026-11` (bulanan), `milestone-7` (Cuti Besar). Ini menjamin pemberian tidak dobel.
- Kuota manual dari HC menjadi grant `manual` dengan `valid_until` sesuai periode jenisnya.

**Pemakaian dan saldo:**
- Jenis berperiode `year` atau `milestone`: saldo = jumlah grant yang masih berlaku, dikurangi pemakaian, dengan FIFO berdasarkan `valid_until` terdekat (sama seperti Ganti Hari di `shared/src/overtime.ts`).
- Jenis berperiode `month`: tidak perlu grant. Saldo bulan berjalan = kuota bulan itu dikurangi pemakaian dengan `start_date` di bulan itu (WIB).

## Aturan validasi pengajuan

1. Jumlah hari ≤ `max_days_per_request` (bila diatur).
2. Jumlah hari ≤ saldo yang tersedia pada tanggal mulai.
3. Jenis `month`: pemakaian dihitung per bulan `start_date`.
4. Pengajuan tidak boleh tumpang tindih tanggal dengan pengajuan aktif (pending atau approved) jenis yang sama.
5. Cuti Besar: hanya bila grant `service_award` untuk milestone yang sudah tercapai masih berlaku.
6. Kelayakan tetap: jenis kelamin dan status kepegawaian (sudah ada di `leave_types`).

## Pemberian otomatis Cuti Besar

- Saat `getBalances` atau pengajuan dibuka, cek milestone masa kerja karyawan (dari `join_date`). Untuk setiap milestone yang sudah tercapai, buat grant `service_award` dengan `INSERT OR IGNORE` (idempoten). `valid_until` = tanggal milestone + 24 bulan.
- Pendekatan "dihitung saat dibutuhkan" dipakai seperti Ganti Hari, jadi tidak perlu cron baru.

## Kuota manual oleh HC

- Admin dan Super Admin dapat menambah atau mengubah kuota per karyawan per jenis.
- Perubahan dicatat di log audit dengan aksi `leave.quota_changed`.
- Untuk jenis `year`, kuota manual menjadi grant `manual` dengan `valid_until` akhir tahun.

## Migrasi

1. Tambah kolom di `leave_types`, dengan nilai untuk jenis yang sudah ada.
2. Buat `leave_grants`. Salin isi `leave_quotas` tahun berjalan sebagai grant `manual` (sumber lama tidak dihapus sampai verifikasi selesai).
3. Ubah `getBalances` dan validasi pengajuan memakai grant. `leave_quotas` dibiarkan sampai hasilnya terverifikasi.
4. Hapus `leave_quotas` pada rilis berikutnya.

## Yang belum diputuskan

- Cuti Haid: apakah ditulis sebagai "cuti haid" atau "cuti hadi" di aplikasi? Data produksi memakai "Cuti Haid". Aku menganggap keduanya sama.
- Cuti Besar: apakah karyawan yang melewati dua milestone sekaligus (mis. dimasukkan sistem setelah 15 tahun) langsung mendapat dua grant? Usulan: ya, masing-masing 10 hari dengan masa berlaku dari milestone-nya.
