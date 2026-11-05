CREATE TABLE `reminder_log` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`employee_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_log_unique` ON `reminder_log` (`kind`,`date`,`employee_id`);--> statement-breakpoint
ALTER TABLE `employees` ADD `reminders_enabled` integer DEFAULT true NOT NULL;