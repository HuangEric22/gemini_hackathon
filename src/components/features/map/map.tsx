'use client'

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LoadMapsLibrary, LoadMarkerLibrary, LoadPlacesLibrary } from '@/lib/google-maps';
import { MapPlace } from '@/shared';
import { PlaceDetailPanel } from './place-detail-panel';

interface MapAreaProps {
  center: { lat: number; lng: number };
  places: MapPlace[];
  focusedPlaceId: string | null;
  onPinClick: (placeId: string) => void;
}

type MarkerEntry = {
  marker: google.maps.marker.AdvancedMarkerElement;
  pin: google.maps.marker.PinElement;
};

export function MapArea({ center, places, focusedPlaceId, onPinClick }: MapAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const [poiPlace, setPoiPlace] = useState<MapPlace | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current) return;
    LoadMapsLibrary().then(({ Map }) => {
      mapRef.current = new Map(containerRef.current!, {
        center,
        zoom: 13,
        mapId: 'DEMO_MAP_ID',
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: true,
      });

      // Handle clicks on Google's built-in POI icons
      mapRef.current.addListener('click', async (event: any) => {
        if (!event.placeId) {
          setPoiPlace(null); // clicked empty space — close card
          return;
        }
        event.stop(); // suppress Google's default info window

        try {
          const lib = await LoadPlacesLibrary();
          const place = new lib.Place({ id: event.placeId });
          await place.fetchFields({
            fields: [
              'id', 'displayName', 'photos', 'formattedAddress', 'location',
              'rating', 'editorialSummary', 'regularOpeningHours',
              'websiteURI', 'reviews', 'primaryType',
            ],
          });

          setPoiPlace({
            id: place.id ?? event.placeId,
            name: place.displayName ?? '',
            lat: place.location?.lat() ?? event.latLng?.lat() ?? 0,
            lng: place.location?.lng() ?? event.latLng?.lng() ?? 0,
            rating: place.rating ?? null,
            address: place.formattedAddress ?? null,
            imageUrl: place.photos?.[0]?.getURI({ maxWidth: 400 }) ?? null,
            images: place.photos?.slice(0, 8).map((ph: any) => ph.getURI({ maxWidth: 800 })) ?? [],
            type: place.primaryType ?? null,
            description: place.editorialSummary ?? null,
            websiteUrl: place.websiteURI ?? null,
            openingHoursText: place.regularOpeningHours?.weekdayDescriptions ?? null,
            reviews: place.reviews?.slice(0, 5).map((r: any) => ({
              author: r.authorAttribution?.displayName ?? 'Anonymous',
              authorPhoto: r.authorAttribution?.photoURI ?? null,
              rating: r.rating ?? 0,
              text: r.text ?? '',
              relativeTime: r.relativePublishTimeDescription ?? '',
            })) ?? null,
          });
        } catch (err) {
          console.error('Failed to fetch POI details:', err);
        }
      });
    });

    return () => {
      markersRef.current.forEach(({ marker }) => (marker.map = null));
      markersRef.current.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-center when destination changes
  useEffect(() => {
    mapRef.current?.setCenter(center);
  }, [center]);

  // Rebuild markers only when places list changes
  useEffect(() => {
    if (!mapRef.current || !places.length) return;

    const build = async () => {
      const { AdvancedMarkerElement, PinElement } = await LoadMarkerLibrary() as google.maps.MarkerLibrary;

      markersRef.current.forEach(({ marker }) => (marker.map = null));
      markersRef.current.clear();

      for (const place of places) {
        const pin = new PinElement({
          background: '#ffffff',
          borderColor: '#4f46e5',
          glyphColor: '#4f46e5',
          scale: 1,
        });

        const marker = new AdvancedMarkerElement({
          map: mapRef.current!,
          position: { lat: place.lat, lng: place.lng },
          content: pin.element,
          title: place.name,
        });

        marker.addListener('click', () => {
          setPoiPlace(null); // close any open POI card when a pin is clicked
          onPinClick(place.id);
        });
        markersRef.current.set(place.id, { marker, pin });
      }
    };

    build();
  }, [places, onPinClick]);

  // Update pin styles + pan when focus changes
  useEffect(() => {
    markersRef.current.forEach(({ pin }, id) => {
      const isFocused = id === focusedPlaceId;
      pin.background = isFocused ? '#4f46e5' : '#ffffff';
      pin.glyphColor = isFocused ? '#ffffff' : '#4f46e5';
      pin.scale = isFocused ? 1.3 : 1;
    });

    if (!focusedPlaceId || !mapRef.current) return;

    const place = places.find((p) => p.id === focusedPlaceId);
    if (!place) return;

    mapRef.current.panTo({ lat: place.lat, lng: place.lng });
    mapRef.current.setZoom(18);
  }, [focusedPlaceId, places]);

  return (
    <aside className="relative w-full h-screen hidden lg:block">
      <div ref={containerRef} className="w-full h-full" />

      {/* POI detail panel — slides in from the right, same style as discovery feed */}
      <AnimatePresence>
        {poiPlace && (
          <>
            <motion.div
              className="absolute inset-0 z-10 bg-black/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPoiPlace(null)}
            />
            <motion.div
              className="absolute inset-y-0 left-0 z-20"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 250 }}
            >
              <PlaceDetailPanel
                place={poiPlace}
                onClose={() => setPoiPlace(null)}
                variant="panel"
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </aside>
  );
}
