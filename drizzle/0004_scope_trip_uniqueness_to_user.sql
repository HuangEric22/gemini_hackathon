DROP INDEX IF EXISTS `trips_trip_name_destination_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `trips_user_trip_name_destination_unique` ON `trips` (`user_id`,`trip_name`,`destination`);
