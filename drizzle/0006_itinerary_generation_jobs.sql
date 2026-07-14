CREATE TABLE `itinerary_generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`phase` text,
	`message` text DEFAULT 'Waiting to start...' NOT NULL,
	`input_json` text NOT NULL,
	`result_json` text,
	`error_code` text,
	`error_message` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`provider` text NOT NULL,
	`provider_run_id` text,
	`idempotency_key` text NOT NULL,
	`generation_version` text NOT NULL,
	`prompt_version` text NOT NULL,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `itinerary_generation_jobs_idempotency_key_unique` ON `itinerary_generation_jobs` (`idempotency_key`);