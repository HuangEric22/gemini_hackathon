/**
 * Tool declarations and implementations for Gemini trip-planning function calling.
 *
 * Each tool has:
 *  - A JSON schema declaration (passed to Gemini)
 *  - An async implementation (called when Gemini invokes the tool)
 */

import { Type } from '@google/genai';
import type { OpeningPeriod } from '@/db/schema';

// ---------------------------------------------------------------------------
// Opening hours formatter (shared with generate-itinerary and planning phase)
// ---------------------------------------------------------------------------

export function formatOpeningHours(periods: OpeningPeriod[]): string {
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fmt = (h: number, m: number) => {
    const ampm = h < 12 ? 'AM' : 'PM';
    const hour = h % 12 || 12;
    return m === 0 ? `${hour}${ampm}` : `${hour}:${m.toString().padStart(2, '0')}${ampm}`;
  };

  const byDay = new Map<number, string[]>();
  for (const p of periods) {
    const windows = byDay.get(p.open.day) ?? [];
    windows.push(p.close === null ? 'Open 24h' : `${fmt(p.open.hour, p.open.minute)}–${fmt(p.close.hour, p.close.minute)}`);
    byDay.set(p.open.day, windows);
  }

  return DAY.map((name, d) => {
    const w = byDay.get(d);
    return w ? `${name}: ${w.join(', ')}` : `${name}: Closed`;
  }).join('; ');
}

// ---------------------------------------------------------------------------
// Tool declarations (Gemini function-calling schemas)
// ---------------------------------------------------------------------------

export const PLANNING_TOOL_DECLARATIONS = [
  {
    name: 'get_travel_time',
    description:
      'Returns the estimated travel time between two geographic coordinates using the Google Routes API. ' +
      'Use this for AI-suggested activities whose travel time is not already in the travel matrix.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        origin_name:  { type: Type.STRING, description: 'Human-readable name of the origin location' },
        origin_lat:   { type: Type.NUMBER, description: 'Latitude of the origin' },
        origin_lng:   { type: Type.NUMBER, description: 'Longitude of the origin' },
        dest_name:    { type: Type.STRING, description: 'Human-readable name of the destination' },
        dest_lat:     { type: Type.NUMBER, description: 'Latitude of the destination' },
        dest_lng:     { type: Type.NUMBER, description: 'Longitude of the destination' },
        mode:         { type: Type.STRING, description: 'Travel mode: DRIVE, TRANSIT, or WALK', enum: ['DRIVE', 'TRANSIT', 'WALK'] },
      },
      required: ['origin_name', 'origin_lat', 'origin_lng', 'dest_name', 'dest_lat', 'dest_lng', 'mode'],
    },
  },
  {
    name: 'estimate_visit_duration',
    description:
      'Estimates the typical amount of time a visitor spends at a place based on its type and name. ' +
      'Use this to fill in realistic start/end times for activities in the itinerary.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        place_name: { type: Type.STRING, description: 'Name of the place' },
        place_type: { type: Type.STRING, description: 'Type or category of the place (e.g. museum, restaurant, park, beach, shopping_mall)' },
      },
      required: ['place_name', 'place_type'],
    },
  },
  {
    name: 'get_weather_forecast',
    description:
      'Returns the 7-day weather forecast for a location (temperature range, precipitation probability, weather code). ' +
      'Use this to flag days that may need indoor alternatives or rain-gear.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        lat:           { type: Type.NUMBER, description: 'Latitude of the location' },
        lng:           { type: Type.NUMBER, description: 'Longitude of the location' },
        location_name: { type: Type.STRING, description: 'Human-readable name of the location (for context)' },
      },
      required: ['lat', 'lng', 'location_name'],
    },
  },
  {
    name: 'estimate_hike_duration',
    description:
      'Calculates realistic hiking time using Naismith\'s Rule — the standard mountaineering formula. ' +
      'Use this for ANY trail, hike, or trek instead of estimate_visit_duration. ' +
      'Fill in distance_km and elevation_gain_m using your knowledge of the specific trail ' +
      '(e.g. Yosemite Falls Trail is 11.4 km round trip with 671 m elevation gain).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        trail_name:       { type: Type.STRING, description: 'Name of the trail or hike' },
        distance_km:      { type: Type.NUMBER, description: 'Total round-trip distance in kilometers' },
        elevation_gain_m: { type: Type.NUMBER, description: 'Total elevation gain in meters (uphill only, one-way)' },
        difficulty:       {
          type: Type.STRING,
          description: 'Trail difficulty level',
          enum: ['easy', 'moderate', 'hard', 'strenuous'],
        },
        include_breaks:   { type: Type.BOOLEAN, description: 'Add buffer time for rest stops and photos (recommended: true for most hikes)' },
      },
      required: ['trail_name', 'distance_km', 'elevation_gain_m', 'difficulty'],
    },
  },
  {
    name: 'find_nearby_restaurants',
    description:
      'Searches for real restaurants near a given location using Google Places. ' +
      'Use this when there is a meal gap in the schedule and no restaurant has been selected by the user nearby.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        lat:       { type: Type.NUMBER, description: 'Latitude of the location to search near' },
        lng:       { type: Type.NUMBER, description: 'Longitude of the location to search near' },
        meal_type: { type: Type.STRING, description: 'Type of meal', enum: ['breakfast', 'lunch', 'dinner'] },
        budget:    { type: Type.STRING, description: 'Budget preference', enum: ['budget', 'moderate', 'luxury'] },
      },
      required: ['lat', 'lng', 'meal_type'],
    },
  },
];

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  if (seconds < 60) return '1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs} hr ${rem} min` : `${hrs} hr`;
}

async function getTravelTime(args: {
  origin_name: string;
  origin_lat: number;
  origin_lng: number;
  dest_name: string;
  dest_lat: number;
  dest_lng: number;
  mode: string;
}): Promise<object> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!apiKey) {
    return { error: 'Google Maps API key not configured' };
  }

  const mode = (['DRIVE', 'TRANSIT', 'WALK'].includes(args.mode) ? args.mode : 'DRIVE') as 'DRIVE' | 'TRANSIT' | 'WALK';

  try {
    const body = {
      origin: {
        location: { latLng: { latitude: args.origin_lat, longitude: args.origin_lng } },
      },
      destination: {
        location: { latLng: { latitude: args.dest_lat, longitude: args.dest_lng } },
      },
      travelMode: mode,
      ...(mode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
    };

    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return { error: `Routes API error: ${res.status}` };
    }

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return { error: 'No route found' };

    const seconds = parseInt((route.duration ?? '0s').replace('s', ''), 10);
    const distanceKm = ((route.distanceMeters ?? 0) / 1000).toFixed(1);

    return {
      origin: args.origin_name,
      destination: args.dest_name,
      mode,
      duration: formatDuration(seconds),
      duration_seconds: seconds,
      distance_km: distanceKm,
    };
  } catch (err) {
    return { error: String(err) };
  }
}

// Lookup table: place type keyword → typical visit duration in minutes (min, typical, max)
const DURATION_TABLE: Record<string, { min: number; typical: number; max: number }> = {
  museum:          { min: 60,  typical: 120, max: 240 },
  art_gallery:     { min: 45,  typical: 90,  max: 150 },
  aquarium:        { min: 60,  typical: 90,  max: 150 },
  zoo:             { min: 120, typical: 180, max: 300 },
  amusement_park:  { min: 180, typical: 360, max: 480 },
  theme_park:      { min: 180, typical: 360, max: 480 },
  national_park:   { min: 120, typical: 240, max: 480 },
  park:            { min: 30,  typical: 60,  max: 120 },
  beach:           { min: 60,  typical: 180, max: 360 },
  hiking:          { min: 90,  typical: 180, max: 360 },
  trail:           { min: 60,  typical: 150, max: 300 },
  restaurant:      { min: 45,  typical: 75,  max: 120 },
  cafe:            { min: 20,  typical: 45,  max: 90  },
  bar:             { min: 60,  typical: 90,  max: 180 },
  shopping_mall:   { min: 60,  typical: 120, max: 240 },
  market:          { min: 30,  typical: 60,  max: 120 },
  church:          { min: 20,  typical: 45,  max: 90  },
  cathedral:       { min: 30,  typical: 60,  max: 120 },
  temple:          { min: 20,  typical: 45,  max: 90  },
  castle:          { min: 60,  typical: 120, max: 180 },
  palace:          { min: 60,  typical: 120, max: 180 },
  monument:        { min: 15,  typical: 30,  max: 60  },
  landmark:        { min: 15,  typical: 30,  max: 60  },
  viewpoint:       { min: 15,  typical: 30,  max: 60  },
  stadium:         { min: 120, typical: 180, max: 240 },
  theater:         { min: 120, typical: 150, max: 180 },
  spa:             { min: 60,  typical: 120, max: 180 },
  waterpark:       { min: 180, typical: 300, max: 420 },
  boat_tour:       { min: 60,  typical: 90,  max: 180 },
  food_tour:       { min: 120, typical: 180, max: 240 },
};

function estimateVisitDuration(args: { place_name: string; place_type: string }): object {
  const typeKey = args.place_type.toLowerCase().replace(/\s+/g, '_');

  // Find matching entry (substring match)
  let match = DURATION_TABLE[typeKey];
  if (!match) {
    for (const key of Object.keys(DURATION_TABLE)) {
      if (typeKey.includes(key) || key.includes(typeKey)) {
        match = DURATION_TABLE[key];
        break;
      }
    }
  }

  // Also check place name for clues
  if (!match) {
    const nameLower = args.place_name.toLowerCase();
    for (const key of Object.keys(DURATION_TABLE)) {
      if (nameLower.includes(key)) {
        match = DURATION_TABLE[key];
        break;
      }
    }
  }

  if (!match) {
    // Generic fallback
    match = { min: 30, typical: 60, max: 120 };
  }

  return {
    place: args.place_name,
    type: args.place_type,
    min_minutes: match.min,
    typical_minutes: match.typical,
    max_minutes: match.max,
    recommendation: `Plan approximately ${match.typical} minutes (${match.min}–${match.max} min range).`,
  };
}

// WMO weather code descriptions (subset)
const WMO_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Heavy showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

async function getWeatherForecast(args: { lat: number; lng: number; location_name: string }): Promise<object> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${args.lat}&longitude=${args.lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_mean,weathercode&timezone=auto&forecast_days=7`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { error: `Weather API error: ${res.status}` };

    const data = await res.json();
    const daily = data.daily;
    if (!daily) return { error: 'No weather data returned' };

    const days: object[] = [];
    for (let i = 0; i < (daily.time?.length ?? 0); i++) {
      const code = daily.weathercode?.[i] ?? 0;
      days.push({
        date: daily.time[i],
        condition: WMO_CODES[code] ?? `Weather code ${code}`,
        temp_max_c: daily.temperature_2m_max?.[i],
        temp_min_c: daily.temperature_2m_min?.[i],
        precipitation_probability_pct: daily.precipitation_probability_mean?.[i],
      });
    }

    return { location: args.location_name, forecast: days };
  } catch (err) {
    return { error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Naismith's Rule hike duration estimator
// ---------------------------------------------------------------------------
// Formula: 1 hour per 5 km + 1 hour per 600 m elevation gain
// Adjusted by difficulty (slower pace for harder trails) + optional break buffer

const DIFFICULTY_SPEED_KMH: Record<string, number> = {
  easy:      4.0,  // flat, well-maintained path
  moderate:  3.5,  // some elevation, uneven terrain
  hard:      3.0,  // significant elevation, rough terrain
  strenuous: 2.5,  // steep, scrambling, or very long
};

function estimateHikeDuration(args: {
  trail_name: string;
  distance_km: number;
  elevation_gain_m: number;
  difficulty: string;
  include_breaks?: boolean;
}): object {
  const speed = DIFFICULTY_SPEED_KMH[args.difficulty] ?? 3.5;

  // Naismith's base time
  const walkingHours = args.distance_km / speed;
  const climbingHours = args.elevation_gain_m / 600;
  let totalHours = walkingHours + climbingHours;

  // Break buffer: ~10 min per hour of hiking for easy/moderate, ~15 min for hard/strenuous
  if (args.include_breaks !== false) {
    const breakFactor = (args.difficulty === 'hard' || args.difficulty === 'strenuous') ? 0.25 : 0.15;
    totalHours += totalHours * breakFactor;
  }

  const totalMinutes = Math.round(totalHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const humanReadable = mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;

  return {
    trail: args.trail_name,
    difficulty: args.difficulty,
    distance_km: args.distance_km,
    elevation_gain_m: args.elevation_gain_m,
    estimated_duration_minutes: totalMinutes,
    estimated_duration_human: humanReadable,
    breakdown: {
      walking_minutes: Math.round(walkingHours * 60),
      climbing_minutes: Math.round(climbingHours * 60),
      break_buffer_minutes: Math.round(totalMinutes - (walkingHours + climbingHours) * 60),
    },
    scheduling_instruction:
      `MANDATORY: Schedule "${args.trail_name}" as a ${totalMinutes}-minute block (${humanReadable}). ` +
      `The start_time and end_time in the itinerary MUST be exactly ${totalMinutes} minutes apart. ` +
      `Do not shorten this — the duration is calculated from real trail distance and elevation data. ` +
      `Recommend starting at 7:00 AM or 8:00 AM to allow enough daylight.`,
  };
}

// ---------------------------------------------------------------------------
// Google Places Nearby Search — real restaurant lookup
// ---------------------------------------------------------------------------

async function findNearbyRestaurants(args: {
  lat: number;
  lng: number;
  meal_type: string;
  budget?: string;
}): Promise<object> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!apiKey) return { error: 'Google Maps API key not configured' };

  // Map budget to max price level (1=free, 2=inexpensive, 3=moderate, 4=expensive)
  const maxPriceLevel = args.budget === 'budget' ? 2 : args.budget === 'luxury' ? 4 : 3;

  // Breakfast spots: cafes/bakeries; lunch/dinner: restaurants
  const includedTypes = args.meal_type === 'breakfast'
    ? ['cafe', 'bakery', 'breakfast_restaurant']
    : ['restaurant'];

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.location,places.primaryTypeDisplayName',
      },
      body: JSON.stringify({
        includedTypes,
        locationRestriction: {
          circle: { center: { latitude: args.lat, longitude: args.lng }, radius: 600 },
        },
        maxResultCount: 5,
        rankPreference: 'RATING',
      }),
    });

    if (!res.ok) return { error: `Places API error: ${res.status}` };

    const data = await res.json() as {
      places?: Array<{
        displayName?: { text?: string };
        formattedAddress?: string;
        rating?: number;
        priceLevel?: string;
        location?: { latitude?: number; longitude?: number };
        primaryTypeDisplayName?: { text?: string };
      }>;
    };

    const restaurants = (data.places ?? [])
      .filter(p => {
        const lvl = p.priceLevel;
        if (!lvl) return true;
        const map: Record<string, number> = { PRICE_LEVEL_FREE: 1, PRICE_LEVEL_INEXPENSIVE: 2, PRICE_LEVEL_MODERATE: 3, PRICE_LEVEL_EXPENSIVE: 4, PRICE_LEVEL_VERY_EXPENSIVE: 4 };
        return (map[lvl] ?? 3) <= maxPriceLevel;
      })
      .map(p => ({
        name: p.displayName?.text,
        type: p.primaryTypeDisplayName?.text,
        address: p.formattedAddress,
        rating: p.rating,
        lat: p.location?.latitude,
        lng: p.location?.longitude,
      }));

    return { meal_type: args.meal_type, restaurants };
  } catch (err) {
    return { error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Dispatcher — called by the planning loop
// ---------------------------------------------------------------------------

export async function executePlanningTool(
  name: string,
  args: Record<string, unknown>,
): Promise<object> {
  switch (name) {
    case 'get_travel_time':
      return getTravelTime(args as Parameters<typeof getTravelTime>[0]);
    case 'estimate_visit_duration':
      return estimateVisitDuration(args as Parameters<typeof estimateVisitDuration>[0]);
    case 'get_weather_forecast':
      return getWeatherForecast(args as Parameters<typeof getWeatherForecast>[0]);
    case 'estimate_hike_duration':
      return estimateHikeDuration(args as Parameters<typeof estimateHikeDuration>[0]);
    case 'find_nearby_restaurants':
      return findNearbyRestaurants(args as Parameters<typeof findNearbyRestaurants>[0]);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
