import React, { useEffect, useRef } from 'react';
import { importLibrary } from '@googlemaps/js-api-loader';

export const AutocompleteInput = ({ onPlaceSelect, placeholder }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const onPlaceSelectRef = useRef(onPlaceSelect);

  useEffect(() => {
    onPlaceSelectRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

  useEffect(() => {
    // 1. If already initialized, do nothing
    if (initializedRef.current) return;
    
    // 2. Set to true IMMEDIATELY before the async call to prevent race conditions
    initializedRef.current = true;

    let autocomplete: any = null;

    const init = async () => {
      try {
        const { PlaceAutocompleteElement } = await importLibrary('places', {
          apiKey: process.env.GOOGLE_MAPS_KEY,
          version: 'weekly',
        }) as google.maps.PlacesLibrary;

        autocomplete = new PlaceAutocompleteElement();
        autocomplete.setAttribute('placeholder', placeholder || 'Search city...');

        autocomplete.addEventListener('gmp-select', async (event: any) => {
          const selection = event.placePrediction;
          if (selection) {
            const place = selection.toPlace();
            await place.fetchFields({ 
              fields: ['displayName', 'formattedAddress', 'location'] 
            });

            onPlaceSelectRef.current(
              place.formattedAddress || '',
              place.location?.lat() || 0,
              place.location?.lng() || 0
            );
          }
        });

        if (containerRef.current) {
          // Clear any existing content just in case of HMR (Hot Module Replacement)
          containerRef.current.innerHTML = ''; 
          containerRef.current.appendChild(autocomplete);
        }
      } catch (e) {
        console.error("Google Maps failed to load.", e);
        initializedRef.current = false; // Reset on failure
      }
    };

    init();

    // 3. CLEANUP FUNCTION: This is the most important part for React
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      initializedRef.current = false;
    };
  }, [placeholder]); 

  return (
    <div className="w-full mt-1">
      <div ref={containerRef} className="google-autocomplete-container" />
    </div>
  );
};