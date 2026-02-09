import { useState, useEffect, useRef, useCallback } from 'react';
import { LoadPlacesLibrary } from "@/lib/google-maps";
import { calculateRadiusFromViewport } from '@/utils/calculate_radius';

export function usePlacesSearch() {
    const [results, setResults] = useState<google.maps.places.Place[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const placesLib = useRef<google.maps.PlacesLibrary | null>(null);

    useEffect(() => {
        LoadPlacesLibrary().then((lib) => {
            placesLib.current = lib;
            setIsLoaded(true);
        });
    }, [])

    const getSearchArea = (location: { lat: number, lng: number }, viewport?: google.maps.LatLngBounds | null) => {
        const radius = viewport ? calculateRadiusFromViewport(viewport) : 500.0;
        return {
            center: location,
            radius: radius
        }
    };

    const searchNearby = useCallback(async (
        location: { lat: number, lng: number },
        categories: string[],
        numResults: number,
        viewport?: google.maps.LatLngBounds | null) => {

        if (!placesLib.current) return;

        setIsLoading(true)

        try {
            const { Place, SearchNearbyRankPreference } = placesLib.current;

            const request: google.maps.places.SearchNearbyRequest = {
                locationRestriction: getSearchArea(location, viewport),
                includedTypes: categories,
                maxResultCount: numResults,
                rankPreference: SearchNearbyRankPreference.POPULARITY,
                fields: [
                    'id',
                    'displayName',
                    'photos',
                    'formattedAddress',
                    'location',
                    'rating',
                    'googleMapsLinks'
                ]
            };

            const { places } = await Place.searchNearby(request);
            setResults(places || []);
        } catch (error) {
            console.error("Nearby Search Error:", error);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const searchByText = useCallback(async (
        query: string,
        categories: string[],
        location: { lat: number, lng: number },
        numQueries: number,
        viewport?: google.maps.LatLngBounds | null
    ) => {
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

    return { results, isLoading, isLoaded, searchNearby, searchByText};
}