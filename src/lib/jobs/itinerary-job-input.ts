import { z } from 'zod';
import { itineraryGenerationResponseSchema } from '@/lib/llm-output-schemas';

const periodPointSchema = z.object({ day: z.number().int().min(0).max(6), hour: z.number().int(), minute: z.number().int() });
const openingPeriodSchema = z.object({ open: periodPointSchema, close: periodPointSchema.nullable() });

export const itineraryJobInputSchema = z.object({
  activities: z.array(z.object({
    name: z.string().min(1),
    lat: z.number(),
    lng: z.number(),
    category: z.string().nullish(),
    googlePlaceId: z.string().nullish(),
    openingHours: z.array(openingPeriodSchema).nullish(),
    averageDuration: z.number().int().positive().nullish(),
  })).min(1),
  numDays: z.number().int().min(1).max(30),
  transportMode: z.enum(['DRIVE', 'TRANSIT', 'WALK']).optional(),
  currentItinerary: itineraryGenerationResponseSchema.nullish(),
  preference: z.string().max(2_000).optional(),
  dayAssignments: z.record(z.string(), z.array(z.string())).optional(),
  pace: z.enum(['relaxed', 'moderate', 'packed']).optional(),
  budget: z.enum(['budget', 'moderate', 'luxury']).optional(),
  startTime: z.string().max(30).optional(),
});

export const submitItineraryJobSchema = z.object({
  input: itineraryJobInputSchema,
  idempotencyKey: z.string().min(8).max(200),
});
