import { int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

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
  startDate: text("start_date"), // Using text for ISO dates in SQLite
  endDate: text("end_date"),
  status: text("status").$type<"upcoming" | "past">().default("upcoming"),
  budget: int("budget"), // 1, 2, 3, or 4
  commute: text("commute"), // "roadtrip" or "public"
  interests: text("interests"),
}, (t)=>({
  unique_trip_constraint: unique().on(t.tripName, t.destination)
}));

// Itinerary Items Table (The cards inside a trip)
export const itineraryItems = sqliteTable("itinerary_items", {
  id: int("id").primaryKey({ autoIncrement: true }),
  // This connects the item to a specific trip
  tripId: int("trip_id").references(() => trips.id, { onDelete: 'cascade' }),
  
  dayNumber: int("day_number").notNull(),
  title: text("title").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  commuteInfo: text("commute_info"), // e.g. "15 min bus"
  order: int("order"), // For drag and drop sorting
  type: text("type"), // "restaurant", "activity", etc.
});