import { InferSelectModel } from "drizzle-orm";
import { real, int, sqliteTable, text, unique, primaryKey } from "drizzle-orm/sqlite-core";

// User Table
export const usersTable = sqliteTable("users_table", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  age: int().notNull(),
  email: text().notNull().unique(),
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

}, (t) => [
  unique().on(t.tripName, t.destination)
]);


// Itinerary Items Table (The cards inside a trip)
export const itineraryItems = sqliteTable("itinerary_items", {
  id: int("id").primaryKey({ autoIncrement: true }),
  tripId: int("trip_id").references(() => trips.id, { onDelete: 'cascade' }),
  title: text("title"),

  dayNumber: int("day_number").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),

  commuteInfo: text("commute_info"), // e.g. "15 min bus"
  commuteSeconds: int("commute_seconds"),

  type: text("type"), // "restaurant", "activity", etc.
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
});

export const tripSelections = sqliteTable("trip_selections", {
  tripId: int("trip_id").notNull().references(() => trips.id, { onDelete: 'cascade' }),
  activityId: int("activity_id").notNull().references(() => activities.id),
}, (table) => [
  primaryKey({ columns: [table.tripId, table.activityId] }),
]);

export type Trip = InferSelectModel<typeof trips>;
export type Activity = InferSelectModel<typeof activities>;
export type ItineraryItem = InferSelectModel<typeof itineraryItems>;
