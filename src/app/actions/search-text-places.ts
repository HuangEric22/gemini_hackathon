'use server'

import { shadowSaveActivities } from '@/app/actions/shadow-save-activities';
import type { Activity } from '@/db/schema';
import { getGoogleMapsServerApiKey } from '@/lib/env';
import {
  mapRestPlaceToSnapshot,
  normalizeTextSearchPageSize,
  TEXT_SEARCH_FIELD_MASK,
  TEXT_SEARCH_URL,
  type RestTextSearchResponse,
} from '@/lib/google-places-text-search';

interface SearchTextPlacesInput {
  query: string;
  location: { lat: number; lng: number };
  city: string;
  pageToken?: string;
  pageSize?: number;
  radius: number;
}

interface SearchTextPlacesResult {
  activities: Activity[];
  nextPageToken: string | null;
}

export async function searchTextPlaces(input: SearchTextPlacesInput): Promise<SearchTextPlacesResult> {
  const query = input.query.trim();
  if (!query) return { activities: [], nextPageToken: null };

  const apiKey = getGoogleMapsServerApiKey();
  const body: Record<string, unknown> = {
    textQuery: query,
    pageSize: normalizeTextSearchPageSize(input.pageSize),
    locationBias: {
      circle: {
        center: {
          latitude: input.location.lat,
          longitude: input.location.lng,
        },
        radius: input.radius,
      },
    },
  };

  if (input.pageToken) body.pageToken = input.pageToken;

  const res = await fetch(TEXT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': TEXT_SEARCH_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => '');
    throw new Error(`Google Places Text Search failed (${res.status}): ${message}`);
  }

  const data = await res.json() as RestTextSearchResponse;
  const snapshots = (data.places ?? [])
    .map(place => mapRestPlaceToSnapshot(place, input.city, apiKey))
    .filter(place => place.googlePlaceId && place.name);
  const activities = await shadowSaveActivities(snapshots);

  return {
    activities,
    nextPageToken: data.nextPageToken ?? null,
  };
}
