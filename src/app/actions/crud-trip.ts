'use server'

import { db } from "@/db";
import { itineraryItems, trips, tripSelections, activities} from "@/db/schema";
import { revalidatePath } from "next/cache";
import { and, eq} from "drizzle-orm";
import { ItineraryGenerationResponse } from "@/shared";

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
}) {

  console.log("--- 1. Action Started ---", formData.tripName);

  let newTripId: number | undefined;

  // Insert into Database
  try {
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
      status: 'upcoming', // Default for new trips
    }).returning();

    console.log("--- 3. DB Insert Successful, ID:", newTrip?.id);
    revalidatePath('/mytrip');

    return { success: true, id: newTrip.id };

  } catch (error: any) {

    console.error("--- 4. Caught Error ---");
    console.log("Message:", error.message);

    const errorMessage = error.message || "";
    const causeMessage = error.cause?.message || "";
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
  // 1. Delete old items for this trip
  await db.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId));

  // 2. Flatten AI JSON into DB rows
  const itemsToInsert = itinerary.days.flatMap((day) => 
    day.items.map((item) => ({
      tripId,
      title: item.title,
      dayNumber: day.day_number,
      startTime: item.start_time,
      endTime: item.end_time,
      type: item.type,
    }))
  );

  if (itemsToInsert.length > 0) {
    await db.insert(itineraryItems).values(itemsToInsert);
  }
}

// read
export async function getTripById(tripId: number) {
  try {
    const result = await db.select().from(trips).where(eq(trips.id, tripId));
    return result[0] || null;
  } catch (error) {
    console.error("Database error:", error);
    throw new Error("Failed to fetch trip");
  }
}

export async function getTripSelectionsByTripId(tripId: number) {
  try {
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
    const items = await db
      .select()
      .from(itineraryItems)
      .where(eq(itineraryItems.tripId, tripId))
      .orderBy(itineraryItems.dayNumber, itineraryItems.startTime);

    return items;
  } catch (error) {
    console.error("Error fetching itinerary items:", error);
    return [];
  }
}

// update
export async function updateWantToGo(tripId: number, activityId: number, isAdding: boolean) {
  if (!tripId || !activityId) {
    console.error("updateWantToGo called with missing IDs", { tripId, activityId });
    return;
  }

  if (isAdding) {
    await db.insert(tripSelections).values({ tripId, activityId }).onConflictDoNothing();
  } else {
    await db.delete(tripSelections)
      .where(and(eq(tripSelections.tripId, tripId), eq(tripSelections.activityId, activityId)));
  }
}