/**
 * Record / replay layer for external tool calls.
 *
 * - Pure tools (estimate_visit_duration, estimate_hike_duration) are local
 *   deterministic computations — they always run for real, in every mode.
 * - Network tools (get_travel_time, get_weather_forecast,
 *   find_nearby_restaurants) and the route matrix are recorded to
 *   eval/datasets/fixtures/<scenario-id>.json in --record mode and served
 *   from there in replay mode.
 * - Gemini's args drift between runs (slightly different coords, phrasing),
 *   so replay lookup is fuzzy (name + nearest-arg match). When no fixture
 *   matches, a deterministic synthetic responder answers instead, so replay
 *   runs are always fully offline — even before fixtures are recorded.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TravelMatrix } from '@/shared';
import type { EvalHooks, RouteMatrixActivity, RouteMatrixMode } from '@/lib/eval-hooks';
import type { ToolTraceEntry } from './types';

export const FIXTURES_DIR = path.join(process.cwd(), 'eval', 'datasets', 'fixtures');

const PURE_TOOLS = new Set(['estimate_visit_duration', 'estimate_hike_duration']);

interface RecordedToolCall {
  name: string;
  args: Record<string, unknown>;
  result: object;
}

export interface FixtureFile {
  scenarioId: string;
  recordedAt: string;
  toolCalls: RecordedToolCall[];
  routeMatrices: Partial<Record<RouteMatrixMode, TravelMatrix>>;
}

export function fixturePath(scenarioId: string): string {
  return path.join(FIXTURES_DIR, `${scenarioId}.json`);
}

export function loadFixture(scenarioId: string): FixtureFile | null {
  const p = fixturePath(scenarioId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as FixtureFile;
}

export function saveFixture(fixture: FixtureFile): void {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  fs.writeFileSync(fixturePath(fixture.scenarioId), JSON.stringify(fixture, null, 2));
}

// ---------------------------------------------------------------------------
// Synthetic fallbacks (deterministic, offline)
// ---------------------------------------------------------------------------

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return '1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs} hr ${rem} min` : `${hrs} hr`;
}

const MODE_SPEED_KMH: Record<string, number> = { DRIVE: 45, TRANSIT: 22, WALK: 4.5 };
const MODE_OVERHEAD_S: Record<string, number> = { DRIVE: 300, TRANSIT: 600, WALK: 60 };
const ROAD_FACTOR = 1.3; // straight-line → road distance

function syntheticTravelSeconds(km: number, mode: string): number {
  const speed = MODE_SPEED_KMH[mode] ?? 45;
  const overhead = MODE_OVERHEAD_S[mode] ?? 300;
  return Math.round(((km * ROAD_FACTOR) / speed) * 3600 + overhead);
}

function syntheticTravelTime(args: Record<string, unknown>): object {
  const mode = typeof args.mode === 'string' && args.mode in MODE_SPEED_KMH ? args.mode : 'DRIVE';
  const km = haversineKm(
    Number(args.origin_lat), Number(args.origin_lng),
    Number(args.dest_lat), Number(args.dest_lng),
  );
  const seconds = syntheticTravelSeconds(km, mode);
  return {
    origin: args.origin_name,
    destination: args.dest_name,
    mode,
    duration: formatDuration(seconds),
    duration_seconds: seconds,
    distance_km: (km * ROAD_FACTOR).toFixed(1),
  };
}

// Fixed base date so replay runs are identical regardless of when they execute.
const SYNTH_BASE_DATE = new Date('2026-06-01T00:00:00Z');
const SYNTH_CONDITIONS = [
  'Clear sky', 'Partly cloudy', 'Clear sky', 'Slight rain',
  'Partly cloudy', 'Clear sky', 'Overcast',
];

function syntheticWeather(args: Record<string, unknown>): object {
  const lat = Number(args.lat) || 0;
  // Crude latitude-based temperature so SF and Reykjavik at least differ.
  const tempMax = Math.max(8, Math.min(33, Math.round(34 - Math.abs(lat) * 0.35)));
  const forecast = SYNTH_CONDITIONS.map((condition, i) => {
    const d = new Date(SYNTH_BASE_DATE.getTime() + i * 86_400_000);
    return {
      date: d.toISOString().slice(0, 10),
      condition,
      temp_max_c: tempMax - (i % 3),
      temp_min_c: tempMax - 9 - (i % 3),
      precipitation_probability_pct: condition.includes('rain') ? 55 : 10,
    };
  });
  return { location: args.location_name ?? 'destination', forecast };
}

function syntheticRestaurants(args: Record<string, unknown>): object {
  const lat = Number(args.lat) || 0;
  const lng = Number(args.lng) || 0;
  const meal = String(args.meal_type ?? 'lunch');
  const names =
    meal === 'breakfast'
      ? ['Morning Bean Cafe', 'The Corner Bakery', 'Sunrise Espresso Bar']
      : ['The Local Table', 'Marketside Kitchen', 'Old Town Bistro'];
  return {
    meal_type: meal,
    restaurants: names.map((name, i) => ({
      name: `${name} (synthetic)`,
      type: meal === 'breakfast' ? 'Cafe' : 'Restaurant',
      address: 'Near requested location',
      rating: 4.6 - i * 0.1,
      lat: lat + 0.001 * (i + 1),
      lng: lng + 0.001 * (i + 1),
    })),
  };
}

export function syntheticToolResult(name: string, args: Record<string, unknown>): object {
  switch (name) {
    case 'get_travel_time': return syntheticTravelTime(args);
    case 'get_weather_forecast': return syntheticWeather(args);
    case 'find_nearby_restaurants': return syntheticRestaurants(args);
    default: return { error: `No synthetic responder for tool: ${name}` };
  }
}

export function syntheticRouteMatrix(
  activities: RouteMatrixActivity[],
  mode: RouteMatrixMode,
): TravelMatrix {
  const matrix: TravelMatrix = {};
  for (const origin of activities) {
    for (const dest of activities) {
      if (origin.name === dest.name) continue;
      const km = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
      const seconds = syntheticTravelSeconds(km, mode);
      if (!matrix[origin.name]) matrix[origin.name] = {};
      matrix[origin.name][dest.name] = { duration: formatDuration(seconds), seconds };
    }
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// Fuzzy fixture lookup
// ---------------------------------------------------------------------------

function coordDistance(a: Record<string, unknown>, b: Record<string, unknown>, latKey: string, lngKey: string): number {
  const aLat = Number(a[latKey]); const aLng = Number(a[lngKey]);
  const bLat = Number(b[latKey]); const bLng = Number(b[lngKey]);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return Infinity;
  return haversineKm(aLat, aLng, bLat, bLng);
}

function findFixtureMatch(
  fixture: FixtureFile | null,
  name: string,
  args: Record<string, unknown>,
): object | null {
  if (!fixture) return null;
  const candidates = fixture.toolCalls.filter(c => c.name === name);
  if (candidates.length === 0) return null;

  // Exact-args match wins immediately.
  const argsJson = JSON.stringify(args, Object.keys(args).sort());
  for (const c of candidates) {
    if (JSON.stringify(c.args, Object.keys(c.args).sort()) === argsJson) return c.result;
  }

  if (name === 'get_travel_time') {
    const norm = (v: unknown) => String(v ?? '').toLowerCase().trim();
    const byName = candidates.find(c =>
      norm(c.args.origin_name) === norm(args.origin_name) &&
      norm(c.args.dest_name) === norm(args.dest_name) &&
      c.args.mode === args.mode,
    );
    if (byName) return byName.result;
    let best: RecordedToolCall | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = coordDistance(c.args, args, 'origin_lat', 'origin_lng') +
                coordDistance(c.args, args, 'dest_lat', 'dest_lng');
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best && bestDist < 5 ? best.result : null;
  }

  if (name === 'get_weather_forecast') {
    let best: RecordedToolCall | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = coordDistance(c.args, args, 'lat', 'lng');
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best && bestDist < 250 ? best.result : null; // same region is close enough for weather
  }

  if (name === 'find_nearby_restaurants') {
    let best: RecordedToolCall | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      if (c.args.meal_type !== args.meal_type) continue;
      const d = coordDistance(c.args, args, 'lat', 'lng');
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best && bestDist < 5 ? best.result : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Hook factory — one per scenario run
// ---------------------------------------------------------------------------

export interface PlanningState {
  rounds: number;
  lastRoundToolCalls: number;
}

export function createScenarioHooks(opts: {
  scenarioId: string;
  mode: 'record' | 'replay';
  trace: ToolTraceEntry[];
  state: PlanningState;
}): { hooks: EvalHooks; getRecordedFixture: () => FixtureFile } {
  const { scenarioId, mode, trace, state } = opts;
  const fixture = mode === 'replay' ? loadFixture(scenarioId) : null;
  const recorded: FixtureFile = {
    scenarioId,
    recordedAt: new Date().toISOString(),
    toolCalls: [],
    routeMatrices: {},
  };
  let currentRound = 0;

  const hooks: EvalHooks = {
    onPlanningRound(round, toolCallCount) {
      currentRound = round;
      state.rounds = Math.max(state.rounds, round);
      state.lastRoundToolCalls = toolCallCount;
    },

    async interceptPlanningTool(name, args, runReal) {
      let result: object;
      let source: ToolTraceEntry['source'];

      if (PURE_TOOLS.has(name)) {
        result = await runReal(name, args);
        source = 'pure';
      } else if (mode === 'record') {
        result = await runReal(name, args);
        source = 'live';
        recorded.toolCalls.push({ name, args, result });
      } else {
        const match = findFixtureMatch(fixture, name, args);
        if (match) {
          result = match;
          source = 'fixture';
        } else {
          result = syntheticToolResult(name, args);
          source = 'synthetic';
        }
      }

      trace.push({ name, args, result, source, round: currentRound });
      return result;
    },

    async interceptRouteMatrix(activities, matrixMode, runReal) {
      if (mode === 'record') {
        const matrix = await runReal(activities, matrixMode);
        recorded.routeMatrices[matrixMode] = matrix;
        return matrix;
      }
      const fixed = fixture?.routeMatrices?.[matrixMode];
      if (fixed) return fixed;
      return syntheticRouteMatrix(activities, matrixMode);
    },
  };

  return { hooks, getRecordedFixture: () => recorded };
}
