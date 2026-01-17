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
  // Insert into Database
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

  // Refresh the "My Trips" page data
  revalidatePath('/mytrip');

  // Send the user to their new itinerary
  redirect(`/mytrip/${newTrip.id}`);
}