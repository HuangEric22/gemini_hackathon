import { describe, expect, it } from 'vitest';
import { getDistanceMeters, rankActivities } from '@/lib/place-ranking';

describe('place ranking', () => {
  it('calculates distance from the trip center in meters', () => {
    const meters = getDistanceMeters(
      { lat: 35.6586, lng: 139.7454 },
      { lat: 35.7101, lng: 139.8107 },
    );

    expect(meters).toBeGreaterThan(8_000);
    expect(meters).toBeLessThan(9_000);
  });

  it('returns ranked activities with score reasons and match metadata', () => {
    const ranked = rankActivities([
      {
        name: 'Quiet Side Street',
        category: 'activity',
        lat: 35.65,
        lng: 139.74,
        rating: 4.1,
        userRatingCount: 40,
        imageUrl: null,
      },
      {
        name: 'Tokyo National Museum',
        category: 'museum',
        description: 'Major museum and cultural attraction.',
        lat: 35.7188,
        lng: 139.7765,
        rating: 4.6,
        userRatingCount: 25_000,
        imageUrl: 'https://example.com/photo.jpg',
      },
    ], {
      center: { lat: 35.6812, lng: 139.7671 },
      query: 'museum',
      radiusMeters: 8_000,
    });

    expect(ranked[0].name).toBe('Tokyo National Museum');
    expect(ranked[0].matchType).toBe('query-match');
    expect(ranked[0].scoreReasons).toContain('Matches your search');
    expect(ranked[0].distanceMeters).toBeGreaterThan(0);
  });
});
