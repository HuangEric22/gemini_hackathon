'use server'

import type { ItineraryGenerationResponse } from '@/shared';
import { getRequiredGeminiApiKey } from '@/lib/env';
import { generateItineraryWorkflow, type GenerateItineraryInput } from '@/lib/itinerary/workflow';

// Non-streaming entry point kept for tests and direct server-action callers.
export async function generateItineraryAction(
  input: GenerateItineraryInput,
): Promise<ItineraryGenerationResponse> {
  return generateItineraryWorkflow(input, { apiKey: getRequiredGeminiApiKey() });
}
