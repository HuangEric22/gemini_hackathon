'use server'

import { db } from "@/db";
import { trips } from "@/db/schema";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createTripAction(formData: {
  tripName: string;
  destination: string;
  startDate?: string;
  endDate?: string;
  interests?: string;
  budget?: number;
  commute?: string;
}) {

  console.log("--- 1. Action Started ---", formData.tripName);

  let newTripId: number | undefined;

  // Insert into Database
  try {
    console.log("--- 2. Attempting DB Insert ---");

    const [newTrip] = await db.insert(trips).values({
      tripName: formData.tripName,
      destination: formData.destination,
      startDate: formData.startDate,
      endDate: formData.endDate,
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

  // if (newTripId) {
  //   // Refresh the "My Trips" page data
  //   revalidatePath('/mytrip');

  //   // Send the user to their new itinerary
  //   redirect(`/mytrip/${newTripId}`);
  // }
}