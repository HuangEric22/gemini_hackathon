import { Activity } from "@/db/schema";
import { ItineraryGenerationResponse } from "@/shared";

type ProgressCallback = (message: string) => void;

export const itineraryService = {
  generate: async (
    userPicks: Activity[],
    numDays: number,
    currentItinerary?: ItineraryGenerationResponse | null,
    preference?: string,
    transportMode?: string,
    dayAssignments?: Record<string, string[]>,
    pace?: 'relaxed' | 'moderate' | 'packed',
    budget?: 'budget' | 'moderate' | 'luxury',
    startTime?: string,
    onProgress?: ProgressCallback,
  ): Promise<ItineraryGenerationResponse> => {
    const body = {
      activities: userPicks.map(a => ({
        name: a.name,
        lat: a.lat,
        lng: a.lng,
        category: a.category ?? undefined,
        googlePlaceId: a.googlePlaceId,
        openingHours: a.openingHours,
        averageDuration: a.averageDuration,
      })),
      numDays,
      transportMode,
      currentItinerary: currentItinerary ?? undefined,
      preference: preference || undefined,
      dayAssignments,
      pace,
      budget,
      startTime,
    };

    const response = await fetch('/api/generate-itinerary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Itinerary generation failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as
          | { type: 'progress'; message: string }
          | { type: 'complete'; data: ItineraryGenerationResponse }
          | { type: 'error'; message: string };

        if (event.type === 'progress') {
          onProgress?.(event.message);
        } else if (event.type === 'complete') {
          return event.data;
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    }

    throw new Error('Stream ended without a complete event');
  },
};
