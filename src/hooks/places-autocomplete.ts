import { useState, useEffect, useRef } from 'react';
import { LoadPlacesLibrary } from "@/lib/google-maps";

interface AutocompleteOptions {
    includedPrimaryTypes?: string[];
    locationBias?: { lat: number; lng: number };
}

export function usePlacesAutocomplete(options?: AutocompleteOptions) {

    const [searchSuggestions, setSearchSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
    const [loading, setLoading] = useState(false);

    const placesLib = useRef<google.maps.PlacesLibrary | null>(null);
    const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

    useEffect(() => {
        LoadPlacesLibrary().then((lib) => {
            placesLib.current = lib;
            sessionToken.current = new placesLib.current.AutocompleteSessionToken();
        });
    }, [])


    const fetchSuggestions = async (input: string) => {
        if (!input || !placesLib.current) {
            setSearchSuggestions([]);
            return;
        }

        setLoading(true);
        try {
            const request = {
                input,
                sessionToken: sessionToken.current!,
                ...(options?.includedPrimaryTypes
                    ? { includedPrimaryTypes: options.includedPrimaryTypes }
                    : { includedPrimaryTypes: ['locality'] }),
                language: 'en-US',
                ...(options?.locationBias && { locationBias: options.locationBias }),
            };

            // Use aliasing 'suggestions: data' to avoid naming conflicts with state
            const { suggestions } =
                await placesLib.current.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

            setSearchSuggestions(suggestions);
        } catch (error) {
            console.error("Autocomplete Error:", error);
        } finally {
            setLoading(false);
        }
    };

    const refreshSession = () => {
        if (placesLib.current) {
            sessionToken.current = new placesLib.current.AutocompleteSessionToken();
        }
    };

    return { searchSuggestions, loading, fetchSuggestions, refreshSession };

}