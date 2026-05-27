'use server'

import { and, inArray, sql } from 'drizzle-orm';
import { db, ensureDbSchema } from '@/db';
import { activities, type Activity } from '@/db/schema';
import { DEFAULT_ATTRACTIONS, DEFAULT_EVENT, DEFAULT_RESTAURANTS } from '@/db/default_data';
import type { DiscoveryActivityGroups, MapPlace } from '@/shared';

const MIN_SECTION_RESULTS = 3;

type DefaultPlace = {
  id?: string;
  displayName?: string;
  formattedAddress?: string;
  location?: { lat?: number; lng?: number };
  rating?: number;
  editorialSummary?: string | { text?: string };
  priceLevel?: string;
  websiteURI?: string;
  websiteUri?: string;
  userRatingCount?: number;
};

// Checks whether development should avoid live Google Places calls.
function shouldUseMockPlaces() {
  return process.env.USE_MOCK_PLACES === 'true' || process.env.NEXT_PUBLIC_USE_MOCK_PLACES === 'true';
}

// Normalizes city names for loose matching against cached activity rows.
function normalizeCity(city: string) {
  return city.trim().toLowerCase();
}

// Extracts plain text from the different default-data summary shapes.
function descriptionText(summary: DefaultPlace['editorialSummary']) {
  if (!summary) return null;
  return typeof summary === 'string' ? summary : summary.text ?? null;
}

// Converts bundled default place data into the activity insert shape.
function mapDefaultPlace(place: DefaultPlace, city: string, category: string) {
  return {
    googlePlaceId: place.id ?? '',
    name: place.displayName ?? '',
    lat: place.location?.lat ?? 0,
    lng: place.location?.lng ?? 0,
    address: place.formattedAddress ?? null,
    city,
    category,
    rating: place.rating ?? null,
    imageUrl: null,
    description: descriptionText(place.editorialSummary),
    openingHours: null,
    priceLevel: place.priceLevel ?? null,
    websiteUrl: place.websiteURI ?? place.websiteUri ?? null,
    userRatingCount: place.userRatingCount ?? null,
  };
}

// Seeds a default category into the DB and returns real Activity rows.
async function seedDefaultSection(defaults: DefaultPlace[], city: string, category: string) {
  const rows = defaults
    .map(place => mapDefaultPlace(place, city, category))
    .filter(place => place.googlePlaceId && place.name && place.lat && place.lng)
    .slice(0, 15);

  if (!rows.length) return [];

  return db
    .insert(activities)
    .values(rows)
    .onConflictDoNothing({
      target: activities.googlePlaceId,
    })
    .returning();
}

// Splits cached activities into the sections used by discovery UI.
function groupActivities(rows: Activity[]) {
  return {
    attractions: rows.filter(activity => activity.category === 'attraction'),
    restaurants: rows.filter(activity => activity.category === 'restaurant'),
    events: rows.filter(activity => activity.category === 'culture' || activity.category === 'event'),
    hotels: rows.filter(activity => activity.category === 'hotel'),
  };
}

// Converts a DB activity row into a map pin/detail payload.
function toMapPlace(activity: Activity): MapPlace | null {
  if (!activity.googlePlaceId) return null;

  const category: MapPlace['category'] =
    activity.category === 'restaurant' ? 'restaurant'
      : activity.category === 'hotel' ? 'hotel'
        : activity.category === 'culture' || activity.category === 'event' ? 'event'
          : 'attraction';

  return {
    id: activity.googlePlaceId,
    name: activity.name,
    lat: activity.lat,
    lng: activity.lng,
    category,
    rating: activity.rating ?? null,
    address: activity.address ?? null,
    imageUrl: activity.imageUrl ?? null,
    images: activity.imageUrl ? [activity.imageUrl] : [],
    type: activity.category ?? null,
    description: activity.description ?? null,
    websiteUrl: activity.websiteUrl ?? null,
    openingHoursText: null,
    reviews: null,
  };
}

// Builds the grouped response and marks which sections still need live data.
function buildResult(
  groups: Omit<DiscoveryActivityGroups, 'mapPlaces' | 'missing' | 'source'>,
  source: DiscoveryActivityGroups['source'],
  forceComplete = false,
): DiscoveryActivityGroups {
  const mapPlaces = [
    ...groups.attractions,
    ...groups.restaurants,
    ...groups.events,
    ...groups.hotels,
  ].map(toMapPlace).filter((place): place is MapPlace => place !== null);

  return {
    ...groups,
    mapPlaces,
    source,
    missing: {
      attractions: forceComplete ? false : groups.attractions.length < MIN_SECTION_RESULTS,
      restaurants: forceComplete ? false : groups.restaurants.length < MIN_SECTION_RESULTS,
      events: forceComplete ? false : groups.events.length < MIN_SECTION_RESULTS,
      hotels: forceComplete ? false : groups.hotels.length < MIN_SECTION_RESULTS,
    },
  };
}

// Returns DB-first discovery data, seeding defaults in mock mode when needed.
export async function getDiscoveryActivityGroups(city: string): Promise<DiscoveryActivityGroups> {
  await ensureDbSchema();

  const cityKey = normalizeCity(city);
  const cachedRows = await db
    .select()
    .from(activities)
    .where(and(
      sql`lower(${activities.city}) like ${`%${cityKey}%`}`,
      inArray(activities.category, ['attraction', 'restaurant', 'culture', 'event', 'hotel']),
    ));

  const cachedGroups = groupActivities(cachedRows);
  const mockMode = shouldUseMockPlaces();

  if (!mockMode) {
    return buildResult(
      cachedGroups,
      cachedRows.length > 0 ? 'db' : 'empty',
    );
  }

  const [mockAttractions, mockRestaurants, mockEvents] = await Promise.all([
    cachedGroups.attractions.length >= MIN_SECTION_RESULTS
      ? Promise.resolve(cachedGroups.attractions)
      : seedDefaultSection(DEFAULT_ATTRACTIONS as DefaultPlace[], city, 'attraction'),
    cachedGroups.restaurants.length >= MIN_SECTION_RESULTS
      ? Promise.resolve(cachedGroups.restaurants)
      : seedDefaultSection(DEFAULT_RESTAURANTS as DefaultPlace[], city, 'restaurant'),
    cachedGroups.events.length >= MIN_SECTION_RESULTS
      ? Promise.resolve(cachedGroups.events)
      : seedDefaultSection(DEFAULT_EVENT as DefaultPlace[], city, 'culture'),
  ]);

  return buildResult(
    {
      attractions: mockAttractions,
      restaurants: mockRestaurants,
      events: mockEvents,
      hotels: cachedGroups.hotels,
    },
    'mock',
    true,
  );
}
