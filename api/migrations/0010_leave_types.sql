CREATE TABLE `leave_types` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`default_quota` real,
	`requires_attachment` integer DEFAULT false NOT NULL,
	`time_based` integer DEFAULT false NOT NULL,
	`gender` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`system` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `leave_types` (`key`, `label`, `description`, `default_quota`, `requires_attachment`, `time_based`, `gender`, `sort_order`, `active`, `system`, `created_at`) VALUES
  ('Cuti Tahunan', 'Cuti Tahunan', 'Mengurangi jatah cuti tahunan reguler.', 12, 0, 0, NULL, 1, 1, 1, '2026-11-06T00:00:00.000Z'),
  ('Cuti Ayah', 'Cuti Ayah', 'Khusus karyawan laki-laki untuk kelahiran anak.', NULL, 0, 0, 'Laki-laki', 2, 1, 1, '2026-11-06T00:00:00.000Z'),
  ('Cuti Berkabung', 'Cuti Berkabung', 'Untuk duka cita keluarga inti wafat.', NULL, 0, 0, NULL, 3, 1, 1, '2026-11-06T00:00:00.000Z'),
  ('Cuti Melahirkan', 'Cuti Melahirkan', 'Khusus karyawan perempuan.', NULL, 0, 0, 'Perempuan', 4, 1, 1, '2026-11-06T00:00:00.000Z'),
  ('Cuti Pernikahan', 'Cuti Pernikahan', 'Untuk hari pernikahan karyawan.', NULL, 0, 0, NULL, 5, 1, 1, '2026-11-06T00:00:00.000Z'),
  ('Cuti Unpaid', 'Cuti Diluar Tanggungan (Unpaid)', 'Tidak memotong kuota tahunan, gaji dipotong.', NULL, 0, 0, NULL, 6, 1, 1, '2026-11-06T00:00:00.000Z'),
  ('Sakit', 'Izin Sakit', 'Memerlukan surat keterangan dokter.', NULL, 1, 0, NULL, 7, 1, 1, '2026-11-06T00:00:00.000Z'),
  ('Ganti Hari', 'Ganti Hari', 'Mengambil kompensasi dari masuk di hari libur.', 0, 0, 0, NULL, 8, 1, 1, '2026-11-06T00:00:00.000Z'),
  ('Izin Terlambat', 'Izin Keterlambatan masuk', 'Memerlukan detail jam estimasi kehadiran.', NULL, 0, 1, NULL, 9, 1, 1, '2026-11-06T00:00:00.000Z'),
  ('Izin Pulang Cepat', 'Izin Pulang Cepat', 'Memerlukan detail jam estimasi pulang.', NULL, 0, 1, NULL, 10, 1, 1, '2026-11-06T00:00:00.000Z'),
  ('Dinas Luar Kota', 'Dinas Luar Kota / SPD', 'Perjalanan dinas resmi luar kota.', NULL, 0, 0, NULL, 11, 1, 1, '2026-11-06T00:00:00.000Z');
