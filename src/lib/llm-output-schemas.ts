import { z } from 'zod';

export const itineraryItemSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  start_time: z.string(),
  end_time: z.string(),
  type: z.string(),
  commute_info: z.string().optional(),
  commute_seconds: z.number().optional(),
  is_suggested: z.boolean().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const itineraryDaySchema = z.object({
  day_number: z.number(),
  brief_description: z.string(),
  items: z.array(itineraryItemSchema),
});

export const itineraryGenerationResponseSchema = z.object({
  days: z.array(itineraryDaySchema),
});

export const stringArraySchema = z.array(z.string());
