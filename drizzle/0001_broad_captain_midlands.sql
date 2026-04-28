ALTER TABLE `itinerary_items` ADD `title` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `lat` real NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `lng` real NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `dayCount` integer;