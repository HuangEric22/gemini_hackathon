import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockGenerateContent, mockRunPlanningPhase, mockComputeRouteMatrixAction } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
  mockRunPlanningPhase: vi.fn(),
  mockComputeRouteMatrixAction: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: mockGenerateContent } };
  }),
  Type: {
    ARRAY: 'array',
    BOOLEAN: 'boolean',
    INTEGER: 'integer',
    NUMBER: 'number',
    OBJECT: 'object',
    STRING: 'string',
  },
}));

vi.mock('@/lib/gemini-planning-phase', () => ({
  runPlanningPhase: mockRunPlanningPhase,
}));

vi.mock('@/app/actions/compute-route-matrix', () => ({
  computeRouteMatrixAction: mockComputeRouteMatrixAction,
}));

import { generateItineraryAction } from '@/app/actions/generate-itinerary';
import { regenerateDayAction } from '@/app/actions/regenerate-day';

const validDay = {
  day_number: 1,
  brief_description: 'A relaxed first day.',
  items: [
    {
      title: 'Fushimi Inari Shrine',
      start_time: '09:00',
      end_time: '11:00',
      type: 'activity',
      is_suggested: false,
      lat: 34.9671,
      lng: 135.7727,
    },
  ],
};

const validItinerary = { days: [validDay] };

describe('LLM output validation in itinerary actions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockRunPlanningPhase.mockResolvedValue('');
    mockComputeRouteMatrixAction.mockResolvedValue({});
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('generateItineraryAction falls back when the first model returns empty text', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: '' })
      .mockResolvedValueOnce({ text: JSON.stringify(validItinerary) });

    const result = await generateItineraryAction({
      activities: [{ name: 'Fushimi Inari Shrine', lat: 34.9671, lng: 135.7727 }],
      numDays: 1,
    });

    expect(result).toEqual(validItinerary);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('regenerateDayAction falls back when the first model returns wrong-shaped JSON', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: '{"day_number":1,"items":[]}' })
      .mockResolvedValueOnce({ text: JSON.stringify(validDay) });

    const result = await regenerateDayAction({
      currentItinerary: validItinerary,
      dayNumber: 1,
      activities: [{ name: 'Fushimi Inari Shrine', lat: 34.9671, lng: 135.7727 }],
    });

    expect(result).toEqual(validItinerary);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });
});
