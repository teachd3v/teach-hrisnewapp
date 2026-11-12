CREATE TABLE `face_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `face_attempts_recent_idx` ON `face_attempts` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `face_attempts_day_idx` ON `face_attempts` (`date`,`employee_id`);