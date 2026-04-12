import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePlacesSearch, clearSearchCache } from '@/hooks/places-search';

// --------------------------------------------------------------------------
// vi.hoisted() runs before vi.mock() hoisting, so the spy exists
// by the time the mock factory references it.
// --------------------------------------------------------------------------
const { mockSearchNearby } = vi.hoisted(() => {
  const fakePlaces = [
    {
      id: 'place-1',
      displayName: 'Place 1',
      formattedAddress: '123 Fake St',
      location: { lat: () => 35.01, lng: () => 135.76 },
      rating: 4.5,
      photos: [{ getURI: () => 'https://example.com/place-1.jpg' }],
      primaryType: 'museum',
    },
    {
      id: 'place-2',
      displayName: 'Place 2',
      formattedAddress: '456 Fake Ave',
      location: { lat: () => 35.02, lng: () => 135.77 },
      rating: 4.2,
      photos: [],
      primaryType: 'park',
    },
  ];

  return {
    mockSearchNearby: vi.fn().mockResolvedValue({ places: fakePlaces }),
  };
});

vi.mock('@/lib/google-maps', () => ({
  LoadPlacesLibrary: vi.fn().mockResolvedValue({
    Place: { searchNearby: mockSearchNearby },
    SearchNearbyRankPreference: { POPULARITY: 'POPULARITY' },
  }),
}));

vi.mock('@/utils/calculate_radius', () => ({
  calculateRadiusFromViewport: vi.fn().mockReturnValue(5000),
}));

// --------------------------------------------------------------------------
// Shared args used across tests
// --------------------------------------------------------------------------
const KYOTO = { lat: 35.0116, lng: 135.7681 };
const CATEGORIES = ['tourist_attraction', 'museum', 'park'];

// Helper — waits for the async library load to complete before the test proceeds
async function setupHook() {
  const hook = renderHook(() => usePlacesSearch());
  await waitFor(() => expect(hook.result.current.isLoaded).toBe(true));
  return hook;
}

describe('usePlacesSearch — in-memory cache', () => {
  beforeEach(() => {
    clearSearchCache();
    mockSearchNearby.mockClear();
  });

  it('calls Google on the first search (cache miss)', async () => {
    const { result } = await setupHook();

    await act(async () => {
      await result.current.searchNearby(KYOTO, CATEGORIES, 10);
    });

    expect(mockSearchNearby).toHaveBeenCalledTimes(1);
    expect(result.current.results).toHaveLength(2);
  });

  it('does NOT call Google a second time for the same location + categories (cache hit)', async () => {
    const { result } = await setupHook();

    await act(async () => {
      await result.current.searchNearby(KYOTO, CATEGORIES, 10);
    });

    await act(async () => {
      await result.current.searchNearby(KYOTO, CATEGORIES, 10);
    });

    expect(mockSearchNearby).toHaveBeenCalledTimes(1); // still 1, not 2
    expect(result.current.results).toHaveLength(2);
  });

  it('calls Google again when the location changes', async () => {
    const OSAKA = { lat: 34.6937, lng: 135.5023 };
    const { result } = await setupHook();

    await act(async () => {
      await result.current.searchNearby(KYOTO, CATEGORIES, 10);
    });

    await act(async () => {
      await result.current.searchNearby(OSAKA, CATEGORIES, 10);
    });

    expect(mockSearchNearby).toHaveBeenCalledTimes(2);
  });

  it('calls Google again when the categories change', async () => {
    const RESTAURANTS = ['restaurant', 'cafe'];
    const { result } = await setupHook();

    await act(async () => {
      await result.current.searchNearby(KYOTO, CATEGORIES, 10);
    });

    await act(async () => {
      await result.current.searchNearby(KYOTO, RESTAURANTS, 10);
    });

    expect(mockSearchNearby).toHaveBeenCalledTimes(2);
  });

  it('treats category arrays as order-independent (same key regardless of order)', async () => {
    const { result } = await setupHook();

    await act(async () => {
      await result.current.searchNearby(KYOTO, ['museum', 'park', 'tourist_attraction'], 10);
    });

    // Reversed order — should still be a cache hit
    await act(async () => {
      await result.current.searchNearby(KYOTO, ['tourist_attraction', 'park', 'museum'], 10);
    });

    expect(mockSearchNearby).toHaveBeenCalledTimes(1);
  });

  it('calls Google again after the cache TTL expires', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const { result } = renderHook(() => usePlacesSearch());
    // With fake timers active, manually flush the LoadPlacesLibrary promise
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await result.current.searchNearby(KYOTO, CATEGORIES, 10);
    });

    // Jump 31 minutes forward — past the 30-min TTL
    vi.setSystemTime(now + 31 * 60 * 1000);

    await act(async () => {
      await result.current.searchNearby(KYOTO, CATEGORIES, 10);
    });

    expect(mockSearchNearby).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
