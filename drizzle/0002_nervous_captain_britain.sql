ALTER TABLE `itinerary_items` ADD `description` text;--> statement-breakpoint
ALTER TABLE `itinerary_items` ADD `is_suggested` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `itinerary_items` ADD `sort_order` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `itinerary_items` ADD `lat` real;--> statement-breakpoint
ALTER TABLE `itinerary_items` ADD `lng` real;--> statement-breakpoint
ALTER TABLE `trips` ADD `user_id` text;