ALTER TABLE `leave_types` ADD `quota_period` text DEFAULT 'year' NOT NULL;
--> statement-breakpoint
ALTER TABLE `leave_types` ADD `max_days_per_request` real;
