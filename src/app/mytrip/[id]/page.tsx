import { db } from "@/db";
import { trips } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

// Next.js passes 'params' to dynamic pages
export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 1. Fetch this specific trip from the database
  const trip = await db.query.trips.findFirst({
    where: eq(trips.id, Number(id)),
  });

  // 2. If the trip doesn't exist, show the 404 page
  if (!trip) {
    notFound();
  }

  return (
    <div className="p-10 bg-white h-full w-full">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">{trip.tripName}</h1>
        <p className="text-gray-500">{trip.destination}, From {trip.startDate} To {trip.endDate}</p>
      </header>

      {/* Itinerary */}
      <div className="border-2 border-dashed border-gray-200 rounded-3xl p-20 text-center text-gray-400">
        Itinerary for {trip.tripName} goes here...
      </div>
    </div>
  );
}