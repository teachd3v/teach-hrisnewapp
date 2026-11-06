CREATE TABLE `profile_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`section` text NOT NULL,
	`data` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `profile_entries_employee_section_idx` ON `profile_entries` (`employee_id`,`section`);--> statement-breakpoint
ALTER TABLE `employees` ADD `nik` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `birth_place` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `birth_date` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `nationality` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `marital_status` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `religion` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `blood_type` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `address` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `city` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `province` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `postal_code` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `ktp_address` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `bank_name` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `bank_account_no` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `bank_account_name` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `profile_consented_at` text;