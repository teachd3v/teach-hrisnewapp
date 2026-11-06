CREATE TABLE `employee_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`file_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `employee_documents_employee_idx` ON `employee_documents` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `employee_documents_key_unique` ON `employee_documents` (`file_key`);