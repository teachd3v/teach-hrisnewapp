CREATE TABLE `face_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`vectors` text NOT NULL,
	`sample_count` integer NOT NULL,
	`model_version` text NOT NULL,
	`status` text NOT NULL,
	`consent_at` text NOT NULL,
	`consent_version` text NOT NULL,
	`reference_photo_key` text NOT NULL,
	`stats` text,
	`created_at` text NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`decision_note` text
);
--> statement-breakpoint
CREATE INDEX `face_templates_employee_idx` ON `face_templates` (`employee_id`,`status`);--> statement-breakpoint
ALTER TABLE `attendances` ADD `clock_in_face_score` real;--> statement-breakpoint
ALTER TABLE `attendances` ADD `clock_in_face_result` text;--> statement-breakpoint
ALTER TABLE `attendances` ADD `clock_in_live` real;--> statement-breakpoint
ALTER TABLE `attendances` ADD `clock_in_face_vec` text;--> statement-breakpoint
ALTER TABLE `attendances` ADD `clock_out_face_score` real;--> statement-breakpoint
ALTER TABLE `attendances` ADD `clock_out_face_result` text;--> statement-breakpoint
ALTER TABLE `attendances` ADD `clock_out_live` real;--> statement-breakpoint
ALTER TABLE `attendances` ADD `clock_out_face_vec` text;