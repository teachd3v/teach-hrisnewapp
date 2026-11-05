CREATE TABLE `attendance_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`clock_in_time` text,
	`clock_out_time` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`decision_notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attendance_corrections_employee_idx` ON `attendance_corrections` (`employee_id`,`date`);--> statement-breakpoint
CREATE INDEX `attendance_corrections_status_idx` ON `attendance_corrections` (`status`);--> statement-breakpoint
ALTER TABLE `attendances` ADD `clock_in_corrected` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `attendances` ADD `clock_out_corrected` integer DEFAULT false NOT NULL;