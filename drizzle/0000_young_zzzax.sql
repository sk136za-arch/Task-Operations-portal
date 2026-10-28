CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deployments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`sprint` text DEFAULT '' NOT NULL,
	`environment` text NOT NULL,
	`type` text NOT NULL,
	`planned_date` text,
	`actual_date` text,
	`date_label` text DEFAULT '' NOT NULL,
	`detail` text NOT NULL,
	`result` text DEFAULT 'planned' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` text NOT NULL,
	`imported_by` text NOT NULL,
	`valid_tasks` integer NOT NULL,
	`deployments` integer NOT NULL,
	`warnings` integer NOT NULL,
	`duplicates` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lookup_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lookup_kind_value_unique` ON `lookup_values` (`kind`,`value`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`environment` text NOT NULL,
	`team` text NOT NULL,
	`service` text NOT NULL,
	`title` text NOT NULL,
	`uat_detail` text DEFAULT '' NOT NULL,
	`production_detail` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`remark` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_task_id_unique` ON `tasks` (`task_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`granted_by` text,
	`granted_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
INSERT INTO `users` (`id`,`email`,`display_name`,`role`,`active`,`granted_by`,`granted_at`,`updated_at`) VALUES ('bootstrap:sk136za@gmail.com','sk136za@gmail.com','Site Admin','admin',true,'bootstrap','2026-10-28T00:00:00.000Z','2026-10-28T00:00:00.000Z');
