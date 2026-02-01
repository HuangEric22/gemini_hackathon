import { useState, useEffect, useRef } from 'react';
import { LoadPlacesLibrary } from "@/lib/google-maps";

export function usePlacesAutocomplete(query: string, type: string) {
// Define the state as an array of AutocompleteSuggestion
    const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
    const [loading, setLoading] = useState(false);

    const placesLib = useRef<google.maps.PlacesLibrary | null>(null);
    const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

    useEffect(() =>{
        LoadPlacesLibrary().then((lib) => {
            placesLib.current = lib;
            sessionToken.current = new placesLib.current.AutocompleteSessionToken();
        });
    }, [])


    const fetchSuggestions = async (input: string) => {
        if (!input || !placesLib.current) {
            setSuggestions([]);
            return;
        }

        setLoading(true);
        try {
            const request = {
                input,
                sessionToken: sessionToken.current!,
                includedPrimaryTypes: ['locality'], // Limits results to cities
                language: 'en-US',
            };

            // Use aliasing 'suggestions: data' to avoid naming conflicts with state
            const { suggestions: data } = 
                await placesLib.current.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

            setSuggestions(data);
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

    return { suggestions, loading, fetchSuggestions, refreshSession };
    
}