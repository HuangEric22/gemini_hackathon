import { db } from "@/db";
import { trips } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";
import { Calendar, MapPin, ChevronRight, Plane } from "lucide-react";

export default async function MyTripsPage() {
  // 1. Fetch all trips from the database, newest first
  const allTrips = await db.select().from(trips).orderBy(desc(trips.id));

  // 2. Filter into categories
  const upcomingTrips = allTrips.filter((t) => t.status === "upcoming");
  const pastTrips = allTrips.filter((t) => t.status === "past");

  return (
    <div className="min-h-screen w-full bg-white p-8 lg:p-12 space-y-12">
      <header className="flex justify-between items-center">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">My Trips</h1>
      </header>

      {/* --- UPCOMING TRIPS SECTION --- */}
      <main className="flex-1 overflow-y-auto p-8 lg:p-12 pt-0 space-y-12">
        <section className="space-y-6">
          <div className="flex items-center gap-2 text-slate-400">
            <Plane className="w-5 h-5" />
            <h2 className="text-xl font-bold uppercase tracking-widest text-sm">Upcoming trips</h2>
          </div>

          {upcomingTrips.length === 0 ? (
            <EmptyState message="No upcoming adventures planned yet." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {upcomingTrips.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          )}
        </section>

        {/* --- PAST TRIPS SECTION --- */}
        <section className="space-y-6 pt-10 border-t border-slate-100">
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar className="w-5 h-5" />
            <h2 className="text-xl font-bold uppercase tracking-widest text-sm">Past trips</h2>
          </div>

          {pastTrips.length === 0 ? (
            <p className="text-slate-400 italic">No past trips recorded.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {pastTrips.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function TripCard({ trip }: { trip: any }) {
  return (
    <Link 
      href={`/mytrip/${trip.id}`} 
      className="group relative flex flex-col bg-white border border-slate-200 rounded-3xl overflow-hidden hover:shadow-2xl hover:border-indigo-200 transition-all duration-300"
    >
      {/* Trip Image / Placeholder */}
      <div className="relative h-48 w-full bg-slate-100 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100">
            <MapPin className="w-10 h-10 text-indigo-200" />
        </div>
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter text-indigo-600 shadow-sm">
          {trip.status}
        </div>
      </div>

      {/* Trip Info */}
      <div className="p-6 space-y-3">
        <div>
          <h3 className="text-xl font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
            {trip.tripName}
          </h3>
          <p className="text-slate-400 text-sm font-medium flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3" /> {trip.destination}
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-50">
          <div className="flex items-center gap-2 text-slate-500">
            <Calendar className="w-4 h-4 text-slate-300" />
            <span className="text-xs font-bold">
              {trip.startDate ? `${trip.startDate} — ${trip.endDate}` : "Dates TBD"}
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="w-full py-20 border-2 border-dashed border-slate-100 rounded-3xl flex flex-col items-center justify-center space-y-4 text-slate-400">
      <Plane className="w-12 h-12 opacity-20" />
      <p className="font-medium">{message}</p>
    </div>
  );
}