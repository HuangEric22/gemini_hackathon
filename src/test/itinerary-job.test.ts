import { describe, expect, it } from 'vitest';
import { itineraryJobInputSchema } from '@/lib/jobs/itinerary-job-input';
import { safeJobError } from '@/lib/jobs/job-logger';

describe('itinerary job boundaries', () => {
  const validInput = {
    activities: [{ name: 'Golden Gate Park', lat: 37.7694, lng: -122.4862 }],
    numDays: 2,
    transportMode: 'DRIVE',
  };

  it('accepts a valid immutable generation input', () => {
    expect(itineraryJobInputSchema.safeParse(validInput).success).toBe(true);
  });

  it('rejects empty activities and invalid day counts', () => {
    expect(itineraryJobInputSchema.safeParse({ ...validInput, activities: [] }).success).toBe(false);
    expect(itineraryJobInputSchema.safeParse({ ...validInput, numDays: 0 }).success).toBe(false);
  });

  it('maps rate limits to a stable user-safe error', () => {
    expect(safeJobError(new Error('429 RESOURCE_EXHAUSTED'))).toEqual({
      code: 'PROVIDER_RATE_LIMITED',
      message: 'The AI service is busy. Please try again.',
    });
  });

  it('does not expose an unexpected provider error', () => {
    const result = safeJobError(new Error('secret upstream response body'));
    expect(result.code).toBe('GENERATION_FAILED');
    expect(result.message).not.toContain('secret');
  });
});
