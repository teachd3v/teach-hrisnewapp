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
| `GET /api/notifications`, `POST /read-all`, `POST /:id/read` | semua | notifikasi dalam aplikasi |

## Aturan yang ditegakkan server
- Durasi dihitung server: hari kerja Senin–Jumat di luar `holidays`.
- Tanggal valid, tidak bentrok dengan pengajuan aktif lain, kuota cukup (dicek lagi saat HC menyetujui), jenis berbatas gender, izin jam-jaman wajib jam.
- Tidak boleh memutuskan pengajuan sendiri. Atasan harus atasan langsung pengaju; peran admin dibaca ulang dari D1, bukan dari token.
- Keputusan memakai update bersyarat pada status, jadi dua keputusan bersamaan tidak sama-sama lolos.
- Kuota bawaan: Cuti Tahunan 12, Ganti Hari 0, jenis lain tanpa batas; jatah khusus di `leave_quotas`.
- Notifikasi tidak memuat alasan cuti. Notifikasi "perlu aksi" ditandai selesai saat pengajuan diputuskan/dibatalkan.

## Belum ada
- **Lampiran** (surat sakit): butuh unggah ke R2. Aturan "Sakit wajib lampiran" belum dipaksa (ada TODO di `routes/leave.ts`).
- Push (FCM/Web Push); baru notifikasi dalam aplikasi.
- Admin: kelola kuota dan hari libur, atur atasan/`is_top_leader` (sementara lewat SQL).
- Keputusan + audit + notifikasi belum satu transaksi: keputusan dicatat dulu (update bersyarat), lalu audit dan notifikasi dalam satu batch. Bila batch kedua gagal, keputusan tetap tercatat tanpa notifikasi.
- Cuti bersama memotong cuti tahunan atau tidak: kebijakan belum ditetapkan.
- Rentang cuti lintas tahun dihitung ke tahun tanggal mulai.
