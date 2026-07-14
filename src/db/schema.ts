import { InferSelectModel } from "drizzle-orm";
import { real, int, sqliteTable, text, unique, primaryKey } from "drizzle-orm/sqlite-core";

// User Table (synced from Clerk on sign-in)
export const users = sqliteTable("users", {
  id: int("id").primaryKey({ autoIncrement: true }),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  imageUrl: text("image_url"),
});

// Trip Table (For the Dashboard cards)
export const trips = sqliteTable("trips", {
  id: int("id").primaryKey({ autoIncrement: true }),
  tripName: text("trip_name").notNull(),
  destination: text("destination").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  dayCount: int("dayCount"),
  status: text("status").$type<"upcoming" | "past">().default("upcoming"),
  budget: int("budget"), // 1, 2, 3, or 4
  commute: text("commute"), // "roadtrip" or "public"
  interests: text("interests"),
  lastAiPreference: text("last_ai_preference"),
  isItineraryPublished: int("is_published", { mode: 'boolean' }).default(false),
  imageUrl: text("image_url"),
  userId: text("user_id"),

}, (t) => [
  unique("trips_user_trip_name_destination_unique").on(t.userId, t.tripName, t.destination)
]);


// Itinerary Items Table (The cards inside a trip)
export const itineraryItems = sqliteTable("itinerary_items", {
  id: int("id").primaryKey({ autoIncrement: true }),
  tripId: int("trip_id").references(() => trips.id, { onDelete: 'cascade' }),
  title: text("title"),
  description: text("description"),

  dayNumber: int("day_number").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),

  commuteInfo: text("commute_info"), // e.g. "15 min bus"
  commuteSeconds: int("commute_seconds"),

  type: text("type"), // "restaurant", "activity", "commute", "alternative", etc.
  isSuggested: int("is_suggested", { mode: 'boolean' }).default(false),
  sortOrder: int("sort_order").default(0),
  lat: real("lat"),
  lng: real("lng"),
});

// Mirrors Google Places API period format exactly — no conversion needed on save.
export interface PeriodPoint {
  day: number;    // 0 = Sunday … 6 = Saturday
  hour: number;
  minute: number;
}

export interface OpeningPeriod {
  open: PeriodPoint;
  close: PeriodPoint | null; // null means open 24h
}

// Array of open/close windows, one per operating day-block.
export type OpeningHours = OpeningPeriod[];

// Activity Table
export const activities = sqliteTable("activities", {
  // Core Identification
  id: int("id").primaryKey({ autoIncrement: true }),
  googlePlaceId: text("google_place_id").unique(), // Crucial for Distance Matrix API
  name: text("name").notNull(),
  description: text("description"),

  // Geographic Data (For Clustering/Turf.js)
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  address: text("address"),
  city: text("city"), // Useful for high-level filtering

  // The "Brain" Metadata (For the Algorithm)
  category: text("category"), // e.g., 'museum', 'park', 'restaurant'
  averageDuration: int("average_duration").default(60), // In minutes (important for schedule gaps!)
  openingHours: text("opening_hours", { mode: 'json' }).$type<OpeningHours>(),
  rating: real("rating"),

  // Logistics
  priceLevel: text("price_level"), // Google PriceLevel string: 'FREE' | 'INEXPENSIVE' | 'MODERATE' | 'EXPENSIVE' | 'VERY_EXPENSIVE'
  websiteUrl: text("website_url"),
  imageUrl: text("image_url"),
  userRatingCount: int("user_rating_count"),
});

export const tripSelections = sqliteTable("trip_selections", {
  tripId: int("trip_id").notNull().references(() => trips.id, { onDelete: 'cascade' }),
  activityId: int("activity_id").notNull().references(() => activities.id),
}, (table) => [
  primaryKey({ columns: [table.tripId, table.activityId] }),
]);

export type ItineraryGenerationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ItineraryGenerationJobPhase =
  | "planning"
  | "computing_routes"
  | "generating"
  | "validating"
  | "saving";

export const itineraryGenerationJobs = sqliteTable("itinerary_generation_jobs", {
  id: text("id").primaryKey(),
  tripId: int("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  status: text("status").$type<ItineraryGenerationJobStatus>().notNull().default("queued"),
  phase: text("phase").$type<ItineraryGenerationJobPhase>(),
  message: text("message").notNull().default("Waiting to start..."),
  inputJson: text("input_json", { mode: "json" }).$type<unknown>().notNull(),
  resultJson: text("result_json", { mode: "json" }).$type<unknown>(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  attemptCount: int("attempt_count").notNull().default(0),
  maxAttempts: int("max_attempts").notNull().default(3),
  provider: text("provider").$type<"inngest" | "bullmq">().notNull(),
  providerRunId: text("provider_run_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  generationVersion: text("generation_version").notNull(),
  promptVersion: text("prompt_version").notNull(),
  cancelRequested: int("cancel_requested", { mode: "boolean" }).notNull().default(false),
  createdAt: int("created_at", { mode: "timestamp_ms" }).notNull(),
  startedAt: int("started_at", { mode: "timestamp_ms" }),
  updatedAt: int("updated_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: int("completed_at", { mode: "timestamp_ms" }),
});

export type Trip = InferSelectModel<typeof trips>;
export type Activity = InferSelectModel<typeof activities>;
export type ItineraryItem = InferSelectModel<typeof itineraryItems>;
export type User = InferSelectModel<typeof users>;
export type ItineraryGenerationJob = InferSelectModel<typeof itineraryGenerationJobs>;
