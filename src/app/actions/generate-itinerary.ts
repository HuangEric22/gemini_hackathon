'use server'

import type { ItineraryGenerationResponse } from '@/shared';
import { generateItineraryWorkflow, type GenerateItineraryInput } from '@/lib/itinerary/workflow';

// Non-streaming entry point kept for tests and direct server-action callers.
export async function generateItineraryAction(
  input: GenerateItineraryInput,
): Promise<ItineraryGenerationResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  return generateItineraryWorkflow(input, { apiKey });
}

