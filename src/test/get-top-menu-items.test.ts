import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockGeminiWithFallback } = vi.hoisted(() => ({
  mockGeminiWithFallback: vi.fn(),
}));

vi.mock('@/lib/gemini-with-fallback', () => ({
  geminiWithFallback: mockGeminiWithFallback,
}));

import { getTopMenuItems } from '@/app/actions/get-top-menu-items';

const BASE_INPUT = {
  name: 'Ramen House',
  reviews: [
    { author: 'Alice', rating: 5, text: 'Loved the tonkotsu ramen.' },
  ],
};

describe('getTopMenuItems', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockGeminiWithFallback.mockReset();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns parsed menu item names', async () => {
    mockGeminiWithFallback.mockResolvedValue('["Tonkotsu Ramen", "Gyoza"]');

    const result = await getTopMenuItems(BASE_INPUT);

    expect(result).toEqual(['Tonkotsu Ramen', 'Gyoza']);
  });

  it('returns an empty array when output is not a string array', async () => {
    mockGeminiWithFallback.mockResolvedValue('[123, true]');

    const result = await getTopMenuItems(BASE_INPUT);

    expect(result).toEqual([]);
  });
});
