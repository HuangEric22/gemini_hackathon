'use server'

import { db } from "@/db";
import { activities, OpeningHours } from "@/db/schema";
import { sql } from "drizzle-orm";

export interface PlaceSnapshot {
  googlePlaceId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  city: string;
  category: string;
  rating: number | null;
  imageUrl: string | null;
  description: string | null;
  openingHours: OpeningHours | null;  // Google's period array format
  priceLevel: string | null;           // Google's string enum e.g. 'MODERATE'
  websiteUrl: string | null;
}

// Called client-side after Google results arrive.
// Upserts into the activities table so subsequent searches for the same
// city hit the DB instead of Google (once DB-first lookup is wired in).
// Returns the saved Activity rows (with integer IDs) so callers can use them directly.
export async function shadowSaveActivities(places: PlaceSnapshot[]) {
  if (!places.length) return [];

  console.log(`[ShadowSave] Upserting ${places.length} activities to DB (city: ${places[0]?.city}, category: ${places[0]?.category})`);

  const saved = await db
    .insert(activities)
    .values(places)
    .onConflictDoUpdate({
      target: activities.googlePlaceId,
      set: {
        rating: sql`excluded.rating`,
        imageUrl: sql`excluded.image_url`,
        city: sql`excluded.city`,
        category: sql`excluded.category`,
        description: sql`excluded.description`,
        openingHours: sql`excluded.opening_hours`,
        priceLevel: sql`excluded.price_level`,
        websiteUrl: sql`excluded.website_url`,
      },
    })
    .returning();

  console.log(`[ShadowSave] Done — ${saved.length} activities saved/updated`);
  return saved;
}
