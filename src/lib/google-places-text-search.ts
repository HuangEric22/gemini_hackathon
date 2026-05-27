import type { PlaceSnapshot } from '@/app/actions/shadow-save-activities';

export const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
export const DEFAULT_TEXT_SEARCH_PAGE_SIZE = 10;
export const MAX_TEXT_SEARCH_PAGE_SIZE = 20;
export const TEXT_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.formattedAddress',
  'places.rating',
  'places.priceLevel',
  'places.websiteUri',
  'places.photos',
  'places.editorialSummary',
  'places.userRatingCount',
  'nextPageToken',
].join(',');

export interface RestTextSearchPlace {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  rating?: number;
  priceLevel?: string;
  websiteUri?: string;
  photos?: { name?: string }[];
  editorialSummary?: { text?: string };
  userRatingCount?: number;
}

export interface RestTextSearchResponse {
  places?: RestTextSearchPlace[];
  nextPageToken?: string;
}

export function normalizeTextSearchPageSize(pageSize?: number) {
  if (!pageSize || pageSize < 1) return DEFAULT_TEXT_SEARCH_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_TEXT_SEARCH_PAGE_SIZE);
}

export function buildPlacePhotoUrl(photoName: string | undefined, apiKey: string) {
  if (!photoName) return null;
  const params = new URLSearchParams({ maxWidthPx: '400', key: apiKey });
  return `https://places.googleapis.com/v1/${photoName}/media?${params.toString()}`;
}

export function mapRestPlaceToSnapshot(
  place: RestTextSearchPlace,
  city: string,
  apiKey: string,
): PlaceSnapshot {
  return {
    googlePlaceId: place.id ?? '',
    name: place.displayName?.text ?? '',
    lat: place.location?.latitude ?? 0,
    lng: place.location?.longitude ?? 0,
    address: place.formattedAddress ?? null,
    city,
    category: 'activity',
    rating: place.rating ?? null,
    imageUrl: buildPlacePhotoUrl(place.photos?.[0]?.name, apiKey),
    description: place.editorialSummary?.text ?? null,
    openingHours: null,
    priceLevel: place.priceLevel ?? null,
    websiteUrl: place.websiteUri ?? null,
    userRatingCount: place.userRatingCount ?? null,
  };
}
