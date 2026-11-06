CREATE TABLE `overtime_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`minutes` integer NOT NULL,
	`reason` text,
	`status` text NOT NULL,
	`manager_decided_by` text,
	`manager_decided_at` text,
	`manager_notes` text,
	`hc_decided_by` text,
	`hc_decided_at` text,
	`hc_notes` text,
	`hc_override` integer DEFAULT false NOT NULL,
	`hc_override_reason` text,
	`revoked_by` text,
	`revoked_at` text,
	`revoke_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `overtime_requests_employee_date_idx` ON `overtime_requests` (`employee_id`,`date`);--> statement-breakpoint
CREATE INDEX `overtime_requests_status_idx` ON `overtime_requests` (`status`);