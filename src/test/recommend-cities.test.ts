import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock @google/genai ────────────────────────────────────────────────────────
const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: mockGenerateContent } };
  }),
}));

import { getRecommendedCities } from '@/app/actions/recommend-cities';

// ── Helpers ───────────────────────────────────────────────────────────────────
const ALLOWED_GEMINI_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

function setGeminiResponse(text: string) {
  mockGenerateContent.mockResolvedValue({ text });
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('getRecommendedCities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockGenerateContent.mockClear();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'fake-key-for-tests' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns an array of city names when Gemini responds with clean JSON', async () => {
    setGeminiResponse('["Osaka", "Nara", "Hiroshima", "Kobe", "Nagoya"]');
    const result = await getRecommendedCities('Kyoto');
    expect(result).toEqual(['Osaka', 'Nara', 'Hiroshima', 'Kobe', 'Nagoya']);
  });

  it('extracts JSON even when Gemini adds surrounding prose (defensive parsing)', async () => {
    setGeminiResponse('Here are my recommendations: ["Lyon", "Nice", "Bordeaux"] — enjoy your trip!');
    const result = await getRecommendedCities('Paris');
    expect(result).toEqual(['Lyon', 'Nice', 'Bordeaux']);
  });

  it('returns an empty array when Gemini response contains no JSON array', async () => {
    setGeminiResponse('Sorry, I cannot make recommendations at this time.');
    const result = await getRecommendedCities('Paris');
    expect(result).toEqual([]);
  });

  it('returns an empty array when GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY;
    const result = await getRecommendedCities('Tokyo');
    expect(result).toEqual([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('returns an empty array and does not throw when the Gemini API call fails', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Network error'));
    const result = await getRecommendedCities('Berlin');
    expect(result).toEqual([]);
  });

  it('passes the city name into the prompt', async () => {
    setGeminiResponse('["Florence", "Venice", "Naples"]');
    await getRecommendedCities('Rome');
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('Rome');
  });

  it('uses an allowed Gemini model', async () => {
    setGeminiResponse('["Sapporo"]');
    await getRecommendedCities('Tokyo');
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(ALLOWED_GEMINI_MODELS).toContain(callArg.model);
  });

  it('returns an empty array when Gemini returns null text', async () => {
    mockGenerateContent.mockResolvedValue({ text: null });
    const result = await getRecommendedCities('Seoul');
    expect(result).toEqual([]);
  });
});
