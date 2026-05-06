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

import { generatePlaceSummary } from '@/app/actions/generate-place-summary';

// ── Helpers ───────────────────────────────────────────────────────────────────
function setGeminiResponse(text: string) {
  mockGenerateContent.mockResolvedValue({ text });
}

const BASE_INPUT = {
  name: 'Fushimi Inari Shrine',
  type: 'tourist_attraction',
  address: '68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto',
  reviews: [
    { author: 'Alice', rating: 5, text: 'Breathtaking!' },
    { author: 'Bob', rating: 4, text: 'Very peaceful and beautiful.' },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('generatePlaceSummary', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockGenerateContent.mockClear();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns the trimmed text from Gemini', async () => {
    setGeminiResponse('  A stunning shrine with thousands of vermilion torii gates.  ');
    const result = await generatePlaceSummary(BASE_INPUT);
    expect(result).toBe('A stunning shrine with thousands of vermilion torii gates.');
  });

  it('returns an empty string when Gemini responds with null text', async () => {
    mockGenerateContent.mockResolvedValue({ text: null });
    const result = await generatePlaceSummary(BASE_INPUT);
    expect(result).toBe('');
  });

  it('uses one of the Gemini fallback models', async () => {
    setGeminiResponse('Some description.');
    await generatePlaceSummary(BASE_INPUT);
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(['gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',]).toContain(callArg.model);
  });

  it('includes the place name in the prompt', async () => {
    setGeminiResponse('desc');
    await generatePlaceSummary(BASE_INPUT);
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('Fushimi Inari Shrine');
  });

  it('includes the place type in the prompt (with underscores replaced)', async () => {
    setGeminiResponse('desc');
    await generatePlaceSummary(BASE_INPUT);
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('tourist attraction');
  });

  it('includes the address in the prompt', async () => {
    setGeminiResponse('desc');
    await generatePlaceSummary(BASE_INPUT);
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto');
  });

  it('includes review authors and text in the prompt', async () => {
    setGeminiResponse('desc');
    await generatePlaceSummary(BASE_INPUT);
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('Alice');
    expect(callArg.contents).toContain('Breathtaking!');
    expect(callArg.contents).toContain('Bob');
  });

  it('uses "No reviews available." in the prompt when reviews array is empty', async () => {
    setGeminiResponse('desc');
    await generatePlaceSummary({ ...BASE_INPUT, reviews: [] });
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('No reviews available.');
  });

  it('handles a null type gracefully (uses "unknown" in prompt)', async () => {
    setGeminiResponse('desc');
    await generatePlaceSummary({ ...BASE_INPUT, type: null });
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('unknown');
  });

  it('handles a null address gracefully (uses "unknown" in prompt)', async () => {
    setGeminiResponse('desc');
    await generatePlaceSummary({ ...BASE_INPUT, address: null });
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('unknown');
  });

  it('throws when the Gemini API call fails', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API quota exceeded'));
    await expect(generatePlaceSummary(BASE_INPUT)).rejects.toThrow('API quota exceeded');
  });

  it('includes review ratings in the prompt', async () => {
    setGeminiResponse('desc');
    await generatePlaceSummary(BASE_INPUT);
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('5/5');
    expect(callArg.contents).toContain('4/5');
  });
});
