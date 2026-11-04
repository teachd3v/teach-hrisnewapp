CREATE TABLE `attendances` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`clock_in` text,
	`clock_in_lat` real,
	`clock_in_lng` real,
	`clock_in_photo_key` text,
	`clock_out` text,
	`clock_out_lat` real,
	`clock_out_lng` real,
	`clock_out_photo_key` text,
	`status` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendances_employee_date_unique` ON `attendances` (`employee_id`,`date`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`target_label` text,
	`details` text,
	`ip` text
);
--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE INDEX `audit_log_action_idx` ON `audit_log` (`action`,`at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_id`,`at`);--> statement-breakpoint
CREATE TABLE `credentials` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`password_changed_at` text,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_code` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`gender` text,
	`title` text,
	`dept` text,
	`level` text,
	`employment_status` text,
	`join_date` text,
	`photo_key` text,
	`role` text DEFAULT 'employee' NOT NULL,
	`manager_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_email_unique` ON `employees` (`email`);--> statement-breakpoint
CREATE INDEX `employees_manager_idx` ON `employees` (`manager_id`);--> statement-breakpoint
CREATE TABLE `holidays` (
	`date` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `leave_quotas` (
	`employee_id` text NOT NULL,
	`leave_type` text NOT NULL,
	`year` integer NOT NULL,
	`quota` real NOT NULL,
	PRIMARY KEY(`employee_id`, `leave_type`, `year`)
);
--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`total_days` real NOT NULL,
	`reason` text,
	`attachment_key` text,
	`status` text NOT NULL,
	`manager_decided_by` text,
	`manager_decided_at` text,
	`manager_notes` text,
	`hc_decided_by` text,
	`hc_decided_at` text,
	`hc_notes` text,
	`hc_override` integer DEFAULT false NOT NULL,
	`hc_override_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leave_requests_employee_idx` ON `leave_requests` (`employee_id`,`start_date`);--> statement-breakpoint
CREATE INDEX `leave_requests_status_idx` ON `leave_requests` (`status`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`href` text,
	`entity_id` text,
	`created_at` text NOT NULL,
	`read_at` text
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_entity_idx` ON `notifications` (`entity_id`);--> statement-breakpoint
CREATE TABLE `push_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`kind` text NOT NULL,
	`token` text NOT NULL,
	`web_keys` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_devices_token_unique` ON `push_devices` (`token`);--> statement-breakpoint
CREATE INDEX `push_devices_employee_idx` ON `push_devices` (`employee_id`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`family_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`device_label` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_hash_unique` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_employee_idx` ON `refresh_tokens` (`employee_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_family_idx` ON `refresh_tokens` (`family_id`);