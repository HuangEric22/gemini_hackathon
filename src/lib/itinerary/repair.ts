import type { ItineraryGenerationResponse } from '@/shared';
import type { GenerateItineraryInput } from './types';

// Fixes safe structural issues without asking the model to regenerate content.
export function repairItineraryStructure(
  itinerary: ItineraryGenerationResponse,
  input: GenerateItineraryInput,
): ItineraryGenerationResponse {
  const sortedDays = [...itinerary.days].sort((a, b) => a.day_number - b.day_number);
  const days = sortedDays.slice(0, input.numDays).map((day, index) => ({
    ...day,
    day_number: index + 1,
    brief_description: day.brief_description || `Day ${index + 1}`,
  }));

  while (days.length < input.numDays) {
    days.push({
      day_number: days.length + 1,
      brief_description: `Day ${days.length + 1}`,
      items: [],
    });
  }

  return { days };
}

