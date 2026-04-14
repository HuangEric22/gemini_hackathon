'use client'

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LoadMapsLibrary, LoadMarkerLibrary, LoadPlacesLibrary } from '@/lib/google-maps';
import { ItineraryMapMarker, LegTransport, MapPlace } from '@/shared';
import { LEG_COLORS } from '@/shared/constants';
import { PlaceDetailPanel } from './place-detail-panel';

interface MapAreaProps {
  center: { lat: number; lng: number };
  places: MapPlace[];
  focusedPlaceId: string | null;
  onPinClick: (placeId: string) => void;
  routeLegs?: LegTransport[];
  itineraryMarkers?: ItineraryMapMarker[];
  onAddToTrip?: (place: MapPlace) => void;
  addedPlaceIds?: Set<string>;
  focusedItineraryMarkerId?: string | null;
  highlightedLegIndices?: number[];
}

type MarkerEntry = {
  marker: google.maps.marker.AdvancedMarkerElement;
  pin: google.maps.marker.PinElement;
};

/** Decode a Google encoded polyline string into LatLng array */
function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export function MapArea({ center, places, focusedPlaceId, onPinClick, routeLegs = [], itineraryMarkers = [], onAddToTrip, addedPlaceIds, focusedItineraryMarkerId, highlightedLegIndices = [] }: MapAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const itinMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const [poiPlace, setPoiPlace] = useState<MapPlace | null>(null);
  const showItinerary = itineraryMarkers.length > 0;

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

  // Rebuild browsing markers — hide them when in itinerary view
  useEffect(() => {
    if (!mapRef.current) return;

    // Always clear old browsing markers first
    markersRef.current.forEach(({ marker }) => (marker.map = null));
    markersRef.current.clear();

    // Don't show browsing markers when itinerary is active
    if (showItinerary || !places.length) return;

    const build = async () => {
      const { AdvancedMarkerElement, PinElement } = await LoadMarkerLibrary() as google.maps.MarkerLibrary;

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
          setPoiPlace(null);
          onPinClick(place.id);
        });
        markersRef.current.set(place.id, { marker, pin });
      }
    };

    build();
  }, [places, onPinClick, showItinerary]);

  // Itinerary markers — shown only in itinerary view
  useEffect(() => {
    // Clear old itinerary markers
    itinMarkersRef.current.forEach(m => (m.map = null));
    itinMarkersRef.current = [];

    if (!mapRef.current || !showItinerary) return;

    const build = async () => {
      const { AdvancedMarkerElement } = await LoadMarkerLibrary() as google.maps.MarkerLibrary;

      for (const item of itineraryMarkers) {
        // Create a custom marker element with a number badge
        const el = document.createElement('div');
        el.style.cssText = `
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; border-radius: 50%;
          font-weight: 700; font-size: 13px; font-family: system-ui, sans-serif;
          cursor: pointer; transition: transform 0.15s;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          ${item.isSuggested
            ? 'background: #fef3c7; color: #92400e; border: 2.5px dashed #f59e0b;'
            : 'background: #4f46e5; color: #ffffff; border: 2.5px solid #3730a3;'
          }
        `;
        el.textContent = String(item.order);
        el.title = item.title;

        const marker = new AdvancedMarkerElement({
          map: mapRef.current!,
          position: { lat: item.lat, lng: item.lng },
          content: el,
          title: item.title,
        });

        itinMarkersRef.current.push(marker);
      }
    };

    build();

    return () => {
      itinMarkersRef.current.forEach(m => (m.map = null));
      itinMarkersRef.current = [];
    };
  }, [itineraryMarkers, showItinerary]);

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

  // Draw route polylines — one color per leg so you can see which route connects which pair
  useEffect(() => {
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    if (!mapRef.current || routeLegs.length === 0) return;

    routeLegs.forEach((leg, legIndex) => {
      const options = [leg.driving, leg.transit, leg.walking].filter(
        (o): o is NonNullable<typeof o> => !!o,
      );
      if (options.length === 0) return;

      const best = options.reduce((a, b) =>
        a.durationSeconds < b.durationSeconds ? a : b,
      );
      const encoded = best.encodedPolyline;
      if (!encoded) return;

      const path = decodePolyline(encoded);
      const polyline = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: LEG_COLORS[legIndex % LEG_COLORS.length],
        strokeOpacity: 0.85,
        strokeWeight: 4,
        map: mapRef.current!,
      });
      polylinesRef.current.push(polyline);
    });

    // Fit map bounds to show all routes + itinerary markers
    if (polylinesRef.current.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      polylinesRef.current.forEach(p => {
        p.getPath().forEach(pt => bounds.extend(pt));
      });
      itineraryMarkers.forEach(m => bounds.extend({ lat: m.lat, lng: m.lng }));
      mapRef.current.fitBounds(bounds, 60);
    }

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routeLegs, itineraryMarkers]);

  // Pan to focused itinerary marker + visually highlight it
  useEffect(() => {
    if (!focusedItineraryMarkerId || !mapRef.current) return;

    const markerData = itineraryMarkers.find(m => m.id === focusedItineraryMarkerId);
    if (!markerData) return;

    mapRef.current.panTo({ lat: markerData.lat, lng: markerData.lng });
    mapRef.current.setZoom(16);

    // Highlight the focused marker, dim others
    itinMarkersRef.current.forEach((marker, idx) => {
      const el = marker.content as HTMLElement;
      if (!el) return;
      const item = itineraryMarkers[idx];
      if (!item) return;

      if (item.id === focusedItineraryMarkerId) {
        el.style.transform = 'scale(1.5)';
        el.style.boxShadow = '0 0 12px 4px rgba(79, 70, 229, 0.5)';
        el.style.zIndex = '10';
      } else {
        el.style.transform = 'scale(0.85)';
        el.style.opacity = '0.5';
        el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        el.style.zIndex = '1';
      }
    });

    // Reset after 2.5s
    const timer = setTimeout(() => {
      itinMarkersRef.current.forEach(marker => {
        const el = marker.content as HTMLElement;
        if (!el) return;
        el.style.transform = '';
        el.style.opacity = '';
        el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        el.style.zIndex = '';
      });
    }, 2500);

    return () => clearTimeout(timer);
  }, [focusedItineraryMarkerId, itineraryMarkers]);

  // Highlight polylines connected to hovered itinerary card
  useEffect(() => {
    if (polylinesRef.current.length === 0) return;

    if (highlightedLegIndices.length === 0) {
      // Restore all polylines to normal
      polylinesRef.current.forEach(p => {
        p.setOptions({ strokeOpacity: 0.85, strokeWeight: 4 });
      });
    } else {
      // Highlight selected legs, dim the rest
      const highlighted = new Set(highlightedLegIndices);
      polylinesRef.current.forEach((p, idx) => {
        if (highlighted.has(idx)) {
          p.setOptions({ strokeOpacity: 1.0, strokeWeight: 6 });
        } else {
          p.setOptions({ strokeOpacity: 0.15, strokeWeight: 3 });
        }
      });
    }
  }, [highlightedLegIndices]);

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
                isAdded={addedPlaceIds?.has(poiPlace.id)}
                onToggle={onAddToTrip ? () => onAddToTrip(poiPlace) : undefined}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </aside>
  );
}
