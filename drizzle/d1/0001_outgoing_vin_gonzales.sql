CREATE TABLE `namespace_directory_meta` (
	`namespace_id` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`password_hash` text,
	`last_active_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`namespace_id`) REFERENCES `namespaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_namespace_directory_role" CHECK("role" IN ('admin','member','viewer')),
	CONSTRAINT "chk_namespace_directory_status" CHECK("status" IN ('active','disabled'))
);
--> statement-breakpoint
CREATE TABLE `namespace_profile_meta` (
	`namespace_id` text PRIMARY KEY NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`namespace_id`) REFERENCES `namespaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `repository_meta` (
	`repository_id` text PRIMARY KEY NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`home_pinned` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pat_global_grants` (
	`pat_id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pat_id`) REFERENCES `personal_access_tokens`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_pat_global_grants_level" CHECK("level" IN ('pull','push'))
);
