import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '@/db/schema';
import {
  mapRestPlaceToSnapshot,
  normalizeTextSearchPageSize,
  TEXT_SEARCH_FIELD_MASK,
} from '@/lib/google-places-text-search';

const { mockShadowSaveActivities } = vi.hoisted(() => ({
  mockShadowSaveActivities: vi.fn(),
}));

vi.mock('@/app/actions/shadow-save-activities', () => ({
  shadowSaveActivities: mockShadowSaveActivities,
}));

import { searchTextPlaces } from '@/app/actions/search-text-places';

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1,
    googlePlaceId: 'places/fake-1',
    name: 'Museum of Good Tests',
    description: 'A useful place.',
    lat: 35.1,
    lng: 139.1,
    address: '123 Test St',
    city: 'Tokyo',
    category: 'activity',
    averageDuration: 60,
    openingHours: null,
    rating: 4.7,
    priceLevel: 'PRICE_LEVEL_MODERATE',
    websiteUrl: 'https://example.com',
    imageUrl: 'https://example.com/photo.jpg',
    userRatingCount: 1000,
    ...overrides,
  };
}

describe('google places text search mapping', () => {
  it('maps REST place fields into a PlaceSnapshot', () => {
    const snapshot = mapRestPlaceToSnapshot({
      id: 'places/fake-1',
      displayName: { text: 'Museum of Good Tests' },
      location: { latitude: 35.1, longitude: 139.1 },
      formattedAddress: '123 Test St',
      rating: 4.7,
      priceLevel: 'PRICE_LEVEL_MODERATE',
      websiteUri: 'https://example.com',
      photos: [{ name: 'places/fake-1/photos/photo-1' }],
      editorialSummary: { text: 'A useful place.' },
      userRatingCount: 1000,
    }, 'Tokyo', 'test-key');

    expect(snapshot).toMatchObject({
      googlePlaceId: 'places/fake-1',
      name: 'Museum of Good Tests',
      lat: 35.1,
      lng: 139.1,
      address: '123 Test St',
      city: 'Tokyo',
      category: 'activity',
      rating: 4.7,
      description: 'A useful place.',
      priceLevel: 'PRICE_LEVEL_MODERATE',
      websiteUrl: 'https://example.com',
      userRatingCount: 1000,
    });
    expect(snapshot.imageUrl).toBe('https://places.googleapis.com/v1/places/fake-1/photos/photo-1/media?maxWidthPx=400&key=test-key');
  });

  it('handles missing optional fields without crashing', () => {
    const snapshot = mapRestPlaceToSnapshot({}, 'Tokyo', 'test-key');

    expect(snapshot).toMatchObject({
      googlePlaceId: '',
      name: '',
      lat: 0,
      lng: 0,
      address: null,
      imageUrl: null,
      description: null,
      priceLevel: null,
      websiteUrl: null,
      userRatingCount: null,
    });
  });

  it('keeps page size within Google Text Search limits', () => {
    expect(normalizeTextSearchPageSize()).toBe(10);
    expect(normalizeTextSearchPageSize(0)).toBe(10);
    expect(normalizeTextSearchPageSize(7.8)).toBe(7);
    expect(normalizeTextSearchPageSize(30)).toBe(20);
  });
});

describe('searchTextPlaces', () => {
  const originalEnv = process.env;
  const mockFetch = vi.fn();

  beforeEach(() => {
    process.env = { ...originalEnv, GOOGLE_MAPS_API_KEY: 'server-key' };
    mockShadowSaveActivities.mockReset();
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('sends a pageSize 10 Text Search request and returns saved activities with nextPageToken', async () => {
    const saved = [makeActivity()];
    mockShadowSaveActivities.mockResolvedValue(saved);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      places: [{
        id: 'places/fake-1',
        displayName: { text: 'Museum of Good Tests' },
        location: { latitude: 35.1, longitude: 139.1 },
        formattedAddress: '123 Test St',
      }],
      nextPageToken: 'next-token',
    }), { status: 200 }));

    const result = await searchTextPlaces({
      query: 'museums',
      location: { lat: 35, lng: 139 },
      city: 'Tokyo',
      radius: 500,
    });

    expect(mockFetch).toHaveBeenCalledWith('https://places.googleapis.com/v1/places:searchText', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'X-Goog-Api-Key': 'server-key',
        'X-Goog-FieldMask': TEXT_SEARCH_FIELD_MASK,
      }),
    }));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({
      textQuery: 'museums',
      pageSize: 10,
      locationBias: {
        circle: {
          center: { latitude: 35, longitude: 139 },
          radius: 500,
        },
      },
    });
    expect(mockShadowSaveActivities).toHaveBeenCalledWith([expect.objectContaining({
      googlePlaceId: 'places/fake-1',
      name: 'Museum of Good Tests',
    })]);
    expect(result).toEqual({ activities: saved, nextPageToken: 'next-token' });
  });

  it('sends pageToken on follow-up page requests', async () => {
    mockShadowSaveActivities.mockResolvedValue([makeActivity({ id: 2, googlePlaceId: 'places/fake-2' })]);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      places: [{
        id: 'places/fake-2',
        displayName: { text: 'Second Page Cafe' },
        location: { latitude: 35.2, longitude: 139.2 },
      }],
    }), { status: 200 }));

    const result = await searchTextPlaces({
      query: 'cafes',
      location: { lat: 35, lng: 139 },
      city: 'Tokyo',
      pageToken: 'next-token',
      pageSize: 10,
      radius: 500
    });

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({
      textQuery: 'cafes',
      pageSize: 10,
      pageToken: 'next-token',
    });
    expect(result.nextPageToken).toBeNull();
  });
});
