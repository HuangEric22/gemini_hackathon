import { useState, useEffect, useRef, useCallback } from 'react';
import { LoadPlacesLibrary } from "@/lib/google-maps";
import { calculateRadiusFromViewport } from '@/utils/calculate_radius';
import type { PlaceSnapshot } from '@/app/actions/shadow-save-activities';

// Module-level cache — survives re-renders and navigation within the session.
// Keyed by lat/lng/categories so the same city never hits Google twice in one session.
const _searchCache = new Map<string, { places: google.maps.places.Place[]; expiry: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const USE_MOCK_PLACES = process.env.NEXT_PUBLIC_USE_MOCK_PLACES === 'true';

// Builds a stable cache key for equivalent nearby searches.
function buildCacheKey(lat: number, lng: number, categories: string[], radius?: number): string {
  const base = `${lat.toFixed(3)}_${lng.toFixed(3)}_${[...categories].sort().join(',')}`;
  return radius ? `${base}_r${radius}` : base;
}

// Provides cached Google Places nearby/text search helpers for client components.
export function usePlacesSearch() {
    const [results, setResults] = useState<google.maps.places.Place[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const placesLib = useRef<google.maps.PlacesLibrary | null>(null);

    useEffect(() => {
        if (USE_MOCK_PLACES) {
            setIsLoaded(true);
            return;
        }

        LoadPlacesLibrary().then((lib) => {
            placesLib.current = lib;
            setIsLoaded(true);
        });
    }, [])

    // Builds the circular search area passed to Google Places requests.
    const getSearchArea = (location: { lat: number, lng: number }, viewport?: google.maps.LatLngBounds | null, radiusOverride?: number) => {
        const radius = radiusOverride ?? (viewport ? calculateRadiusFromViewport(viewport) : 500.0);
        return {
            center: location,
            radius: radius
        }
    };

    // Runs a nearby search with in-memory caching for repeated city/category requests.
    const searchNearby = useCallback(async (
        location: { lat: number, lng: number },
        categories: string[],
        numResults: number,
        viewport?: google.maps.LatLngBounds | null,
        radius?: number) => {

        if (USE_MOCK_PLACES) {
            setResults([]);
            return;
        }

        if (!placesLib.current) return;

        // Check in-memory cache before hitting Google
        const cacheKey = buildCacheKey(location.lat, location.lng, categories, radius);
        const cached = _searchCache.get(cacheKey);
        if (cached && Date.now() < cached.expiry) {
            console.log(`[PlacesSearch] CACHE HIT — returning ${cached.places.length} results for key: ${cacheKey}`);
            setResults(cached.places);
            return;
        }

        console.log(`[PlacesSearch] CACHE MISS — calling Google Places API for key: ${cacheKey}`);
        setIsLoading(true)

        try {
            const { Place, SearchNearbyRankPreference } = placesLib.current;

            const request: google.maps.places.SearchNearbyRequest = {
                locationRestriction: getSearchArea(location, viewport, radius),
                includedPrimaryTypes: categories,
                maxResultCount: numResults,
                rankPreference: SearchNearbyRankPreference.POPULARITY,
                fields: [
                    'id',
                    'displayName',
                    'photos',
                    'formattedAddress',
                    'location',
                    'rating',
                    'googleMapsLinks',
                    'editorialSummary',
                    'regularOpeningHours',
                    'priceLevel',
                    'websiteURI',
                    'userRatingCount',
                    'reviews',
                ]
            };

            const { places } = await Place.searchNearby(request);
            const found = places || [];
            _searchCache.set(cacheKey, { places: found, expiry: Date.now() + CACHE_TTL_MS });
            console.log(`[PlacesSearch] Stored ${found.length} results in cache for key: ${cacheKey}`);
            setResults(found);

        } catch (error) {
            console.error("Nearby Search Error:", error);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Runs a text search near a location for user-entered queries.
    const searchByText = useCallback(async (
        query: string,
        categories: string[],
        location: { lat: number, lng: number },
        numQueries: number,
        viewport?: google.maps.LatLngBounds | null
    ) => {
        if (USE_MOCK_PLACES) {
            setResults([]);
            return;
        }

        if (!placesLib.current || !query) return;
        setIsLoading(true);

        try {
            const { Place, SearchByTextRankPreference } = placesLib.current;
            const request: google.maps.places.SearchByTextRequest = {
                textQuery: query,
                locationBias: getSearchArea(location, viewport),
                maxResultCount: numQueries,
                rankPreference: SearchByTextRankPreference.RELEVANCE,
                fields: categories
            };

            const { places } = await Place.searchByText(request);
            setResults(places || []);
        } catch (error) {
            console.error("Text Search Error:", error);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    return { results, setResults, isLoading, isLoaded, searchNearby, searchByText};
}

// Exposed for tests only — clears the module-level cache between test runs
// Clears the in-memory nearby search cache for deterministic tests.
export function clearSearchCache() {
    _searchCache.clear();
}

// Extracts all storable fields from a Google Place object into our PlaceSnapshot shape.
// Lives here because it is tightly coupled to what searchNearby fetches.
// Converts a Google Place result into the DB snapshot shape.
export function extractSnapshot(
    p: google.maps.places.Place,
    city: string,
    category: string,
): PlaceSnapshot {
    return {
        googlePlaceId: p.id ?? '',
        name: p.displayName ?? '',
        lat: p.location?.lat() ?? 0,
        lng: p.location?.lng() ?? 0,
        address: p.formattedAddress ?? null,
        city,
        category,
        rating: p.rating ?? null,
        imageUrl: p.photos?.[0]?.getURI({ maxWidth: 400 }) ?? null,
        description: p.editorialSummary ?? null,
        // Store Google's period array directly — no custom conversion
        openingHours: p.regularOpeningHours?.periods?.map((period) => ({
            open: { day: period.open.day, hour: period.open.hour, minute: period.open.minute },
            close: period.close
                ? { day: period.close.day, hour: period.close.hour, minute: period.close.minute }
                : null,
        })) ?? null,
        priceLevel: p.priceLevel ?? null,
        websiteUrl: p.websiteURI ?? null,
        userRatingCount: p.userRatingCount ?? null,
    };
}
