import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePlacesAutocomplete } from './places-autocomplete';

describe('usePlacesAutocomplete', () => {

    beforeEach(() => {
        vi.clearAllMocks(); 
    });

    it('should initialize with empty suggestions and loading false', () => {
    const { result } = renderHook(() => usePlacesAutocomplete('initial', 'locality'));

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.loading).toBe(false);
    });

    it('should fetch suggestions and update state', async () => {
    const mockData = [
        { placePrediction: { text: { toString: () => 'London, UK' } } },
        { placePrediction: { text: { toString: () => 'London, ON, Canada' } } }
    ];

    const { AutocompleteSuggestion } = await google.maps.importLibrary('places') as any;
    AutocompleteSuggestion.fetchAutocompleteSuggestions.mockResolvedValue({
        suggestions: mockData
    });

    const { result } = renderHook(() => usePlacesAutocomplete('', 'locality'));

    await waitFor(() => {
        expect(result.current.fetchSuggestions).toBeDefined();
    });

    await act(async () => {
        await result.current.fetchSuggestions('Lon');
    });

    expect(result.current.suggestions).toHaveLength(2);
    expect(result.current.suggestions[0].placePrediction.text.toString()).toBe('London, UK');
    expect(result.current.loading).toBe(false);
    });

    it('should clear suggestions when input is empty', async () => {
    const { result } = renderHook(() => usePlacesAutocomplete('', 'locality'));

    // Trigger a fetch with empty string
    await act(async () => {
        await result.current.fetchSuggestions('');
    });

    expect(result.current.suggestions).toEqual([]);
    });

    it('should refresh the session token', async () => {
    const { result } = renderHook(() => usePlacesAutocomplete('', 'locality'));

    // Wait for the initial load to finish
    const { AutocompleteSessionToken } = await google.maps.importLibrary('places') as any;
    
    await waitFor(() => {
        expect(AutocompleteSessionToken).toHaveBeenCalledTimes(1);
    });

    // Trigger a refresh
    act(() => {
        result.current.refreshSession();
    });

    // The token constructor should have been called twice:
    // Once on mount, and once on our manual refresh
    expect(AutocompleteSessionToken).toHaveBeenCalledTimes(2);
    });
});