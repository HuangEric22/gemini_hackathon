import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePlacesAutocomplete } from './places-autocomplete';

type MockPlacesLibrary = {
    AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: ReturnType<typeof vi.fn>;
    };
    AutocompleteSessionToken: ReturnType<typeof vi.fn>;
};

describe('usePlacesAutocomplete', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with empty suggestions and loading false', () => {
        const { result } = renderHook(() => usePlacesAutocomplete());

        // Hook returns `searchSuggestions`, not `suggestions`
        expect(result.current.searchSuggestions).toEqual([]);
        expect(result.current.loading).toBe(false);
    });

    it('should fetch suggestions and update state', async () => {
        const mockData = [
            { placePrediction: { text: { toString: () => 'London, UK' } } },
            { placePrediction: { text: { toString: () => 'London, ON, Canada' } } }
        ];

        const { AutocompleteSuggestion } = await google.maps.importLibrary('places') as unknown as MockPlacesLibrary;
        AutocompleteSuggestion.fetchAutocompleteSuggestions.mockResolvedValue({
            suggestions: mockData
        });

        const { result } = renderHook(() => usePlacesAutocomplete());

        await waitFor(() => {
            expect(result.current.fetchSuggestions).toBeDefined();
        });

        await act(async () => {
            await result.current.fetchSuggestions('Lon');
        });

        expect(result.current.searchSuggestions).toHaveLength(2);
        expect(result.current.searchSuggestions[0].placePrediction?.text.toString()).toBe('London, UK');
        expect(result.current.loading).toBe(false);
    });

    it('should clear suggestions when input is empty', async () => {
        const { result } = renderHook(() => usePlacesAutocomplete());

        await act(async () => {
            await result.current.fetchSuggestions('');
        });

        expect(result.current.searchSuggestions).toEqual([]);
    });

    it('should refresh the session token', async () => {
        const { result } = renderHook(() => usePlacesAutocomplete());

        const { AutocompleteSessionToken } = await google.maps.importLibrary('places') as unknown as MockPlacesLibrary;

        await waitFor(() => {
            expect(AutocompleteSessionToken).toHaveBeenCalledTimes(1);
        });

        act(() => {
            result.current.refreshSession();
        });

        expect(AutocompleteSessionToken).toHaveBeenCalledTimes(2);
    });
});
