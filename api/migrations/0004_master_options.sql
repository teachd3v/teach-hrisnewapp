CREATE TABLE `master_options` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `master_options_kind_idx` ON `master_options` (`kind`,`sort_order`);--> statement-breakpoint
ALTER TABLE `employees` ADD `department_id` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `level_id` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `employment_status_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `master_options_kind_name_unique` ON `master_options` (`kind`, lower(`name`));--> statement-breakpoint
INSERT INTO `master_options` (`id`, `kind`, `name`, `sort_order`, `active`, `created_at`) VALUES
  ('dept_ideas', 'department', 'IDEAS', 1, 1, '2026-11-05T00:00:00.000Z'),
  ('dept_sglt', 'department', 'SGLT', 2, 1, '2026-11-05T00:00:00.000Z'),
  ('dept_bi', 'department', 'BI', 3, 1, '2026-11-05T00:00:00.000Z'),
  ('dept_budaya', 'department', 'Budaya', 4, 1, '2026-11-05T00:00:00.000Z'),
  ('dept_remo', 'department', 'REMO', 5, 1, '2026-11-05T00:00:00.000Z'),
  ('dept_lsp', 'department', 'LSP', 6, 1, '2026-11-05T00:00:00.000Z'),
  ('level_direktur', 'level', 'Direktur', 1, 1, '2026-11-05T00:00:00.000Z'),
  ('level_manajer', 'level', 'Manajer', 2, 1, '2026-11-05T00:00:00.000Z'),
  ('level_supervisor', 'level', 'Supervisor', 3, 1, '2026-11-05T00:00:00.000Z'),
  ('level_koordinator', 'level', 'Koordinator', 4, 1, '2026-11-05T00:00:00.000Z'),
  ('level_staff', 'level', 'Staff', 5, 1, '2026-11-05T00:00:00.000Z'),
  ('level_pelaksana', 'level', 'Pelaksana', 6, 1, '2026-11-05T00:00:00.000Z'),
  ('status_kontrak', 'employment_status', 'Kontrak', 1, 1, '2026-11-05T00:00:00.000Z'),
  ('status_tetap', 'employment_status', 'Tetap', 2, 1, '2026-11-05T00:00:00.000Z'),
  ('status_probation', 'employment_status', 'Probation', 3, 1, '2026-11-05T00:00:00.000Z'),
  ('status_magang', 'employment_status', 'Magang', 4, 1, '2026-11-05T00:00:00.000Z');--> statement-breakpoint
UPDATE `employees` SET `department_id` = (SELECT `id` FROM `master_options` WHERE `kind` = 'department' AND lower(`name`) = lower(`employees`.`dept`)) WHERE `dept` IS NOT NULL;--> statement-breakpoint
UPDATE `employees` SET `level_id` = (SELECT `id` FROM `master_options` WHERE `kind` = 'level' AND lower(`name`) = lower(`employees`.`level`)) WHERE `level` IS NOT NULL;--> statement-breakpoint
UPDATE `employees` SET `employment_status_id` = (SELECT `id` FROM `master_options` WHERE `kind` = 'employment_status' AND lower(`name`) = lower(`employees`.`employment_status`)) WHERE `employment_status` IS NOT NULL;
