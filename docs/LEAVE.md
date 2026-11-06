# Fitur cuti

Port dari project lama, dengan alur dua tahap: atasan langsung → HC.

## Status pengajuan
`pending_manager` → `pending_hc` → `approved` | `rejected`; `cancelled` bila dibatalkan pengaju (baris tidak dihapus, demi jejak audit).
Pucuk pimpinan (`employees.is_top_leader`) langsung `pending_hc`. Karyawan lain tanpa atasan tidak boleh mengajukan.

## Endpoint (`/api/leave`, semua butuh Bearer)
| Endpoint | Siapa | Fungsi |
|---|---|---|
| `GET /meta?year=` | semua | saldo per jenis, atasan, hari libur, `canSubmit` |
| `GET /mine` | semua | riwayat sendiri |
| `POST /` | semua | ajukan |
| `POST /:id/cancel` | pengaju | batalkan selama menunggu |
| `GET /approvals?tab=pending\|history` | atasan | bawahan langsung |
| `POST /:id/manager-decision` `{approve, notes}` | atasan langsung pengaju | setuju/tolak |
| `GET /admin?status=pending_hc\|pending_manager\|all` | admin | daftar |
| `POST /:id/hc-decision` `{approve, notes}` | admin | keputusan final |
| `POST /:id/hc-override` `{approve, reason}` | admin | ambil alih yang tertahan di atasan; alasan wajib, final, tercatat di audit |
| `POST /attachments` (multipart `file`), `DELETE /attachments?key=` | pengaju | unggah lampiran (PDF/JPG/PNG/WEBP, maks. 5 MB, tipe dicek dari isi berkas) dan buang unggahan yang batal dipakai |
| `POST /api/files/link` `{key}` → `GET /api/files/get?...` | pemilik, admin, atasan langsung | tautan bertanda tangan berumur 5 menit; akses selain pemilik dicatat di audit (`file.access`) |
| `GET /api/notifications`, `POST /read-all`, `POST /:id/read` | semua | notifikasi dalam aplikasi |

## Aturan yang ditegakkan server
- Durasi dihitung server: hari kerja Senin–Jumat di luar `holidays`.
- Tanggal valid, tidak bentrok dengan pengajuan aktif lain, kuota cukup (dicek lagi saat HC menyetujui), jenis berbatas gender, izin jam-jaman wajib jam.
- Jenis Sakit wajib lampiran. Satu berkas hanya untuk satu pengajuan; lampiran pengajuan yang dibatalkan dihapus dari R2.
- Tidak boleh memutuskan pengajuan sendiri. Atasan harus atasan langsung pengaju; peran admin dibaca ulang dari D1, bukan dari token.
- Keputusan memakai update bersyarat pada status, jadi dua keputusan bersamaan tidak sama-sama lolos.
- Kuota bawaan: Cuti Tahunan 12, Ganti Hari 0, jenis lain tanpa batas; jatah khusus di `leave_quotas`.
- **Cuti bersama memotong Cuti Tahunan (pengaturan super admin, bawaan mati).** Tanggal `JOINT` selalu dikeluarkan dari hari kerja pengajuan. Bila pengaturan `joint_leave_deducts_annual` menyala, saldo Cuti Tahunan juga berkurang 1 hari per cuti bersama yang jatuh Senin-Jumat pada tahun itu. Potongan **dihitung saat saldo dibaca** (`getBalances`), tidak ditulis sebagai baris, jadi menyalakan/mematikan langsung benar tanpa memproses ulang data. Aturannya: hanya karyawan aktif; status di `joint_leave_exempt_status_ids` (bawaan Probation dan Magang) tidak dipotong; hari sebelum `join_date` tidak dihitung; kuota khusus tetap dipotong; saldo boleh minus (pengajuan Cuti Tahunan baru ditolak, pengajuan lama tidak diubah). Saldo menampilkan `jointDeducted` terpisah.
- Perubahan yang memengaruhi saldo (menyalakan/mematikan, mengubah daftar pengecualian, menambah/menghapus/mengganti jenis cuti bersama saat pengaturan menyala) mengirim notifikasi `leave.joint_changed` ke karyawan yang potongannya berubah, dalam batch yang sama dengan perubahannya, dan tercatat di audit (`setting.changed`, `holiday.set`/`holiday.deleted`).
- Notifikasi tidak memuat alasan cuti. Notifikasi "perlu aksi" ditandai selesai saat pengajuan diputuskan/dibatalkan.

## Belum ada
- Unggahan yang tidak pernah dipakai pengajuan (aplikasi ditutup di tengah proses) tertinggal di R2; belum ada pembersihan terjadwal (butuh Worker cron atau aturan lifecycle R2).
- Push (FCM/Web Push); baru notifikasi dalam aplikasi.
- Admin: kelola kuota dan hari libur, atur atasan/`is_top_leader` (sementara lewat SQL).
- Keputusan + audit + notifikasi belum satu transaksi: keputusan dicatat dulu (update bersyarat), lalu audit dan notifikasi dalam satu batch. Bila batch kedua gagal, keputusan tetap tercatat tanpa notifikasi.
- Rentang cuti lintas tahun dihitung ke tahun tanggal mulai.
