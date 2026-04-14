import { Activity } from "@/db/schema";
import { ItineraryGenerationResponse, TravelMatrix } from "@/shared";
import { generateItineraryAction } from "@/app/actions/generate-itinerary";

export const itineraryService = {
  generate: async (
    userPicks: Activity[],
    numDays: number,
    currentItinerary?: ItineraryGenerationResponse | null,
    preference?: string,
    travelMatrix?: TravelMatrix,
    transportMode?: string,
    dayAssignments?: Record<string, string[]>,
  ): Promise<ItineraryGenerationResponse> => {
    return generateItineraryAction({
      activities: userPicks.map(a => ({
        name: a.name,
        lat: a.lat,
        lng: a.lng,
        category: a.category ?? undefined,
        googlePlaceId: a.googlePlaceId,
      })),
      numDays,
      travelMatrix,
      transportMode,
      currentItinerary: currentItinerary ?? undefined,
      preference: preference || undefined,
      dayAssignments,
    });
  },
};
