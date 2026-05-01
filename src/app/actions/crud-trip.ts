'use server'

import { db, ensureDbSchema } from "@/db";
import { itineraryItems, trips, tripSelections, activities} from "@/db/schema";
import { revalidatePath } from "next/cache";
import { and, eq} from "drizzle-orm";
import { ItineraryGenerationResponse } from "@/shared";
import { auth } from "@clerk/nextjs/server";

async function requireOwnedTrip(tripId: number) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in.");

  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .limit(1);

  if (!trip) throw new Error("Trip not found or not allowed.");
  return { userId, tripId: trip.id };
}

// create
export async function createTripAction(formData: {
  tripName: string;
  lat: number;
  lng: number;
  destination: string;
  startDate?: string;
  endDate?: string;
  dayCount: number;
  interests?: string;
  budget?: number;
  commute?: string;
  imageUrl?: string;
}) {

  console.log("--- 1. Action Started ---", formData.tripName);

  // Insert into Database
  try {
    await ensureDbSchema();

    console.log("--- 2. Attempting DB Insert ---");

    let dayCount: number | null = null;

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);

      const diffTime = end.getTime() - start.getTime();
      dayCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
    } else if (formData.dayCount) {
      dayCount = formData.dayCount; // from flexible dropdown
    }

    const { userId } = await auth();
    if (!userId) return { success: false, error: "Not signed in." };

    const [newTrip] = await db.insert(trips).values({
      tripName: formData.tripName,
      destination: formData.destination,
      lat: formData.lat,
      lng: formData.lng,
      startDate: formData.startDate,
      endDate: formData.endDate,
      dayCount: dayCount,
      interests: formData.interests,
      budget: formData.budget,
      commute: formData.commute,
      imageUrl: formData.imageUrl || null,
      status: 'upcoming',
      userId,
    }).returning();

    console.log("--- 3. DB Insert Successful, ID:", newTrip?.id);
    revalidatePath('/mytrip');

    return { success: true, id: newTrip.id };

  } catch (error: unknown) {

    console.error("--- 4. Caught Error ---");
    const errorMessage = error instanceof Error ? error.message : String(error);
    const causeMessage =
      error instanceof Error &&
      "cause" in error &&
      error.cause instanceof Error
        ? error.cause.message
        : "";

    const isDuplicate = errorMessage.includes("UNIQUE") || causeMessage.includes("UNIQUE");


    if (isDuplicate) {
      return {
        success: false,
        error: "A trip with this name and destination already exists."
      };
    }

    return {
      success: false,
      error: "An error occurs while creating your trip."
    };
  }
}

export async function saveGeneratedItinerary(tripId: number, itinerary: ItineraryGenerationResponse) {
  await requireOwnedTrip(tripId);

  // 1. Delete old items for this trip
  await db.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId));

  // 2. Flatten AI JSON into DB rows — save ALL items (commutes, suggestions, alternatives)
  const itemsToInsert = itinerary.days.flatMap((day) =>
    day.items.map((item, idx) => ({
      tripId,
      title: item.title,
      description: item.description ?? null,
      dayNumber: day.day_number,
      startTime: item.start_time,
      endTime: item.end_time,
      type: item.type,
      commuteInfo: item.commute_info ?? null,
      commuteSeconds: item.commute_seconds ?? null,
      isSuggested: item.is_suggested ?? false,
      sortOrder: idx,
      lat: item.lat ?? null,
      lng: item.lng ?? null,
    }))
  );

  if (itemsToInsert.length > 0) {
    await db.insert(itineraryItems).values(itemsToInsert);
  }
}

// read
export async function getTripById(tripId: number) {
  try {
    await ensureDbSchema();
    const { userId } = await requireOwnedTrip(tripId);
    const result = await db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, userId)));
    return result[0] || null;
  } catch (error) {
    console.error("Database error:", error);
    throw new Error("Failed to fetch trip");
  }
}

export async function getTripSelectionsByTripId(tripId: number) {
  try {
    await requireOwnedTrip(tripId);

    const results = await db
      .select({
        activity: activities,
      })
      .from(tripSelections)
      .innerJoin(activities, eq(tripSelections.activityId, activities.id))
      .where(eq(tripSelections.tripId, tripId));

    // Return just the array of activity objects
    return results.map((row) => row.activity);
  } catch (error) {
    console.error("Error fetching trip selections:", error);
    return [];
  }
}

export async function getItineraryItemsByTripId(tripId: number) {
  try {
    await requireOwnedTrip(tripId);

    const items = await db
      .select()
      .from(itineraryItems)
      .where(eq(itineraryItems.tripId, tripId))
      .orderBy(itineraryItems.dayNumber, itineraryItems.sortOrder);

    return items;
  } catch (error) {
    console.error("Error fetching itinerary items:", error);
    return [];
  }
}

// delete
export async function deleteTripAction(tripId: number) {
  try {
    await ensureDbSchema();
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Not signed in." };
    await db.delete(trips).where(and(eq(trips.id, tripId), eq(trips.userId, userId)));
    revalidatePath('/mytrip');
    return { success: true };
  } catch (error) {
    console.error("Error deleting trip:", error);
    return { success: false, error: "Failed to delete trip." };
  }
}

export async function saveTripSelections(tripId: number, activityIds: number[]) {
  await requireOwnedTrip(tripId);

  await db.delete(tripSelections).where(eq(tripSelections.tripId, tripId));
  if (activityIds.length > 0) {
    await db.insert(tripSelections).values(
      activityIds.map(activityId => ({ tripId, activityId }))
    ).onConflictDoNothing();
  }
}

// update
export async function updateWantToGo(tripId: number, activityId: number, isAdding: boolean) {
  if (!tripId || !activityId) {
    console.error("updateWantToGo called with missing IDs", { tripId, activityId });
    return;
  }

  await requireOwnedTrip(tripId);

  if (isAdding) {
    await db.insert(tripSelections).values({ tripId, activityId }).onConflictDoNothing();
  } else {
    await db.delete(tripSelections)
      .where(and(eq(tripSelections.tripId, tripId), eq(tripSelections.activityId, activityId)));
  }
}
