CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `app_settings` (`key`, `value`, `updated_by`, `updated_at`) VALUES
  ('joint_leave_deducts_annual', '0', NULL, '2026-11-06T00:00:00.000Z'),
  ('joint_leave_exempt_status_ids', '["status_probation","status_magang"]', NULL, '2026-11-06T00:00:00.000Z');
