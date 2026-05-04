CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`google_place_id` text,
	`name` text NOT NULL,
	`description` text,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`address` text,
	`city` text,
	`category` text,
	`average_duration` integer DEFAULT 60,
	`opening_hours` text,
	`rating` real,
	`price_level` integer,
	`website_url` text,
	`image_url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_google_place_id_unique` ON `activities` (`google_place_id`);--> statement-breakpoint
CREATE TABLE `itinerary_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer,
	`day_number` integer NOT NULL,
	`start_time` text,
	`end_time` text,
	`commute_info` text,
	`commute_seconds` integer,
	`type` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trip_selections` (
	`trip_id` integer NOT NULL,
	`activity_id` integer NOT NULL,
	PRIMARY KEY(`trip_id`, `activity_id`),
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_name` text NOT NULL,
	`destination` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`status` text DEFAULT 'upcoming',
	`budget` integer,
	`commute` text,
	`interests` text,
	`last_ai_preference` text,
	`is_published` integer DEFAULT false
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trips_trip_name_destination_unique` ON `trips` (`trip_name`,`destination`);--> statement-breakpoint
CREATE TABLE `users_table` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`age` integer NOT NULL,
	`email` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_table_email_unique` ON `users_table` (`email`);