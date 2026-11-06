CREATE TABLE `attendance_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`effective_from` text NOT NULL,
	`work_start` text DEFAULT '09:00' NOT NULL,
	`grace_minutes` integer DEFAULT 0 NOT NULL,
	`location_mode` text DEFAULT 'flag' NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_policies_effective_unique` ON `attendance_policies` (`effective_from`);--> statement-breakpoint
CREATE TABLE `office_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`radius_m` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `attendances` ADD `clock_in_outside` integer;--> statement-breakpoint
ALTER TABLE `attendances` ADD `clock_out_outside` integer;
--> statement-breakpoint
INSERT INTO `office_locations` (`id`, `name`, `lat`, `lng`, `radius_m`, `active`, `created_at`) VALUES
  ('office_main', 'Kantor', -6.4733643, 106.7274949, 1000, 1, '2026-11-06T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `attendance_policies` (`id`, `effective_from`, `work_start`, `grace_minutes`, `location_mode`, `created_by`, `created_at`) VALUES
  ('policy_default', '0001-01-01', '09:00', 0, 'flag', NULL, '2026-11-06T00:00:00.000Z');
--> statement-breakpoint
UPDATE `attendances` SET `clock_in_outside` = CASE WHEN `clock_in_distance` IS NULL THEN NULL WHEN `clock_in_distance` > 1000 THEN 1 ELSE 0 END WHERE `clock_in` IS NOT NULL AND `clock_in_corrected` = 0;
--> statement-breakpoint
UPDATE `attendances` SET `clock_out_outside` = CASE WHEN `clock_out_distance` IS NULL THEN NULL WHEN `clock_out_distance` > 1000 THEN 1 ELSE 0 END WHERE `clock_out` IS NOT NULL AND `clock_out_corrected` = 0;
