CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`dress_code` text DEFAULT 'none' NOT NULL,
	`setting` text DEFAULT 'indoor' NOT NULL,
	`notes` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activities_date_idx` ON `activities` (`date`);--> statement-breakpoint
CREATE TABLE `category_care` (
	`category` text PRIMARY KEY NOT NULL,
	`wash_after_wears` integer NOT NULL,
	`needs_ironing` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `day_plans` (
	`date` text PRIMARY KEY NOT NULL,
	`outfit_id` integer,
	`locked` integer DEFAULT false NOT NULL,
	`notes` text,
	`weather_override` text,
	`wear_log_id` integer,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`outfit_id`) REFERENCES `outfits`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`outfit_id` integer,
	`garment_ids` text DEFAULT '[]' NOT NULL,
	`kind` text NOT NULL,
	`scope` text DEFAULT 'one_off' NOT NULL,
	`context` text,
	`note` text,
	`expires_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`outfit_id`) REFERENCES `outfits`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `garments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`subcategory` text,
	`colours` text DEFAULT '[]' NOT NULL,
	`pattern` text DEFAULT 'solid' NOT NULL,
	`materials` text DEFAULT '[]' NOT NULL,
	`fit` text,
	`silhouette` text,
	`layering_role` text,
	`warmth` integer DEFAULT 3 NOT NULL,
	`formality` integer DEFAULT 3 NOT NULL,
	`seasons` text DEFAULT '[]' NOT NULL,
	`weather` text DEFAULT '[]' NOT NULL,
	`occasions` text DEFAULT '[]' NOT NULL,
	`style_tags` text DEFAULT '[]' NOT NULL,
	`brand` text,
	`notes` text,
	`details` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'clean' NOT NULL,
	`status_changed_at` text,
	`wear_count` integer DEFAULT 0 NOT NULL,
	`wears_since_wash` integer DEFAULT 0 NOT NULL,
	`last_worn_on` text,
	`wash_after_wears` integer,
	`needs_ironing` integer,
	`photo_file` text,
	`illustration_svg` text,
	`illustration_key` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `garments_category_idx` ON `garments` (`category`);--> statement-breakpoint
CREATE INDEX `garments_status_idx` ON `garments` (`status`);--> statement-breakpoint
CREATE TABLE `outfit_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`outfit_id` integer NOT NULL,
	`garment_id` integer,
	`slot` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`snapshot` text NOT NULL,
	FOREIGN KEY (`outfit_id`) REFERENCES `outfits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`garment_id`) REFERENCES `garments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `outfit_items_outfit_idx` ON `outfit_items` (`outfit_id`);--> statement-breakpoint
CREATE INDEX `outfit_items_garment_idx` ON `outfit_items` (`garment_id`);--> statement-breakpoint
CREATE TABLE `outfits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`warnings` text DEFAULT '[]' NOT NULL,
	`favourite` integer DEFAULT false NOT NULL,
	`saved` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`based_on_outfit_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outfits_saved_idx` ON `outfits` (`saved`,`archived`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `style_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`garment_ids` text DEFAULT '[]' NOT NULL,
	`colours` text DEFAULT '[]' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`permanent` integer DEFAULT true NOT NULL,
	`expires_at` text,
	`active` integer DEFAULT true NOT NULL,
	`feedback_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`feedback_id`) REFERENCES `feedback`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `wear_log_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wear_log_id` integer NOT NULL,
	`garment_id` integer,
	`snapshot` text NOT NULL,
	FOREIGN KEY (`wear_log_id`) REFERENCES `wear_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`garment_id`) REFERENCES `garments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `wear_log_items_garment_idx` ON `wear_log_items` (`garment_id`);--> statement-breakpoint
CREATE INDEX `wear_log_items_log_idx` ON `wear_log_items` (`wear_log_id`);--> statement-breakpoint
CREATE TABLE `wear_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`outfit_id` integer,
	`outfit_name` text DEFAULT '' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`outfit_id`) REFERENCES `outfits`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `wear_logs_date_idx` ON `wear_logs` (`date`);--> statement-breakpoint
CREATE TABLE `weather_cache` (
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`fetched_at` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`latitude`, `longitude`)
);
