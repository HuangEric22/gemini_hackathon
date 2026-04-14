'use server'

import type { LegTransport, TransportOption } from '@/shared';

interface DirectionsLeg {
  originTitle: string;
  destTitle: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
}

type RouteMode = 'WALK' | 'TRANSIT' | 'DRIVE';

function formatDuration(seconds: number): string {
  if (seconds < 60) return '1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs} hr ${rem} min` : `${hrs} hr`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function toTransportMode(mode: RouteMode): TransportOption['mode'] {
  switch (mode) {
    case 'WALK': return 'walking';
    case 'TRANSIT': return 'transit';
    default: return 'driving';
  }
}

async function fetchRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: RouteMode,
  apiKey: string,
): Promise<TransportOption | null> {
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: mode,
        ...(mode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route?.duration) return null;

    const seconds = parseInt(route.duration.replace('s', ''), 10);
    const meters = route.distanceMeters ?? 0;

    return {
      mode: toTransportMode(mode),
      duration: formatDuration(seconds),
      durationSeconds: seconds,
      distance: formatDistance(meters),
      encodedPolyline: route.polyline?.encodedPolyline ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Computes walking / transit / driving directions for consecutive itinerary legs
 * using the Routes API (v2). Replaces the legacy google.maps.DirectionsService.
 */
export async function computeDirectionsAction(
  legs: DirectionsLeg[],
): Promise<LegTransport[]> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!apiKey) throw new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_KEY');

  const MODES: RouteMode[] = ['WALK', 'TRANSIT', 'DRIVE'];

  const results = await Promise.all(
    legs.map(async (leg) => {
      const modeResults = await Promise.allSettled(
        MODES.map(mode => fetchRoute(leg.origin, leg.destination, mode, apiKey)),
      );

      const transport: LegTransport = {
        originTitle: leg.originTitle,
        destinationTitle: leg.destTitle,
      };

      for (const result of modeResults) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        const opt = result.value;
        transport[opt.mode] = opt;
      }

      return transport;
    }),
  );

  return results;
}
