import { useState, useEffect, useRef, useCallback } from 'react';
import { LoadPlacesLibrary } from "@/lib/google-maps";
import { calculateRadiusFromViewport } from '@/utils/calculate_radius';

export function usePlacesNearbySearch() {
    const [results, setResults] = useState<google.maps.places.Place[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const placesLib = useRef<google.maps.PlacesLibrary | null>(null);

    useEffect(() => {
        LoadPlacesLibrary().then((lib) => {
            placesLib.current = lib;
        });
    }, [])

    const searchNearby = useCallback(async (
        location: { lat: number, lng: number },
        categories: string[],
        numResults: number,
        viewport?: google.maps.LatLngBounds | null) => {

        if (!placesLib.current) return;

        setIsLoading(true)
        const radius = viewport ? calculateRadiusFromViewport(viewport) : 500.0;

        try {
            const { Place, SearchNearbyRankPreference } = placesLib.current;

            const request: google.maps.places.SearchNearbyRequest = {
                locationRestriction: {
                    center: location,
                    radius: radius
                },
                includedTypes: categories,
                maxResultCount: 12,
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
    return { results, isLoading, searchNearby };
}