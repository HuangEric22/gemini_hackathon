// services/itinerary-service.ts
import { Activity } from "@/db/schema";
import { ItineraryGenerationResponse } from "@/shared";

const PYTHON_API_URL = "http://localhost:8000";

export const itineraryService = {
  generate: async (
    userPicks: Activity[],
    numDays: number,
    currentItinerary?: any,
    preference?: string
  ): Promise<ItineraryGenerationResponse> => {
    try {
      const response = await fetch(`${PYTHON_API_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_picks: userPicks,
          num_days: numDays,
          current_itinerary: currentItinerary,
          preference: preference || "",
        }),
      });

      if (!response.ok) throw new Error("Failed to generate itinerary");
      return await response.json();
    } catch (error) {
      console.error("Itinerary Service Error:", error);
      throw error;
    }
  },
};