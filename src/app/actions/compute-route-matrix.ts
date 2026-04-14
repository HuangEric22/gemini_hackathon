'use server'

import type { TravelMatrix } from '@/shared';

interface Activity {
  name: string;
  lat: number;
  lng: number;
}

type TravelMode = 'DRIVE' | 'TRANSIT' | 'WALK';

function formatDuration(seconds: number): string {
  if (seconds < 60) return '1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs} hr ${rem} min` : `${hrs} hr`;
}

/**
 * Computes an NxN travel-time matrix using the Routes API (v2).
 * Replaces the legacy DistanceMatrixService.
 */
export async function computeRouteMatrixAction(
  activities: Activity[],
  mode: TravelMode = 'DRIVE',
): Promise<TravelMatrix> {
  if (activities.length < 2) return {};

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!apiKey) throw new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_KEY');

  const toWaypoint = (a: Activity) => ({
    waypoint: {
      location: {
        latLng: { latitude: a.lat, longitude: a.lng },
      },
    },
  });

  const body = {
    origins: activities.map(toWaypoint),
    destinations: activities.map(toWaypoint),
    travelMode: mode,
    ...(mode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
  };

  const res = await fetch(
    'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status,condition',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Routes API error (${res.status}): ${text}`);
  }

  const elements: Array<{
    originIndex: number;
    destinationIndex: number;
    status?: { code?: number };
    condition?: string;
    duration?: string; // e.g. "567s"
    distanceMeters?: number;
  }> = await res.json();

  const matrix: TravelMatrix = {};

  for (const el of elements) {
    if (el.originIndex === el.destinationIndex) continue;
    if (el.condition !== 'ROUTE_EXISTS') continue;

    const originName = activities[el.originIndex].name;
    const destName = activities[el.destinationIndex].name;

    // Parse duration string like "567s" to seconds
    const seconds = el.duration ? parseInt(el.duration.replace('s', ''), 10) : 0;

    if (!matrix[originName]) matrix[originName] = {};
    matrix[originName][destName] = {
      duration: formatDuration(seconds),
      seconds,
    };
  }

  return matrix;
}
