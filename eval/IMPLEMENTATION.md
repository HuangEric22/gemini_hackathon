# Eval Harness — Implementation Notes

Status of the work done so far implementing `plan.md`. Every change is listed below: modified production files (shown as before/after), new files (full source), and what each piece does. The last section lists what is still pending.

---

## Overview of the approach

The plan called for monkey-patching `executePlanningTool` and `computeRouteMatrixAction` from the harness. That approach is fragile here: under ESM, module exports are read-only bindings, and whether tsx runs this project as CJS or ESM depends on `package.json` `"type"`, so a require-cache patch could silently stop working. Instead, production code got a tiny **typed hook seam** (`src/lib/eval-hooks.ts`):

- Hooks are stored on `globalThis`, so they work identically under Next.js, vitest, and tsx, regardless of module format or duplicated module instances.
- In production **nothing registers hooks**, so every call site is one global lookup that finds nothing and falls through to the real implementation. Zero behavior change.
- The eval harness registers hooks per scenario run to (a) capture the Phase-1 tool trace, (b) record or replay external API results, and (c) observe planning-loop rounds.

Other deliberate deviations from the plan (all in service of "accurate and cost-effective"):

| Improvement | Why |
|---|---|
| Pure tools (`estimate_visit_duration`, `estimate_hike_duration`) always run for real | They are local deterministic math — no cost, no nondeterminism, no fixture needed. |
| Synthetic offline fallbacks for network tools | Gemini's args drift between runs (slightly different coords/phrasing), so exact fixture lookups would miss. Fuzzy match first, then a deterministic synthetic responder — replay is fully offline even **before** any fixtures are recorded. |
| `phase2_hard_checks` list dropped from scenarios | Which hard checks apply is derivable from the input itself (hotel present → `hotel_anchor`, `pace` set → `pace`, etc.). Inapplicable checks report as `skip`, keeping the scorecard shape stable. |
| Judge caching + temperature 0 + JSON-schema output | Re-judging an unchanged itinerary is free; scores are as deterministic as the API allows. |
| 9th scenario (`sf-feedback`) added | None of the plan's 8 scenarios had a `preference`, so the judge's `feedback_recovery` criterion would never run. |

---

## 1. `src/lib/eval-hooks.ts` (NEW — the instrumentation seam)

```ts
/**
 * Eval-only instrumentation seam.
 *
 * The eval harness (eval/) registers hooks here to intercept external calls
 * (planning tools, route matrix) for record/replay and to observe the
 * planning loop. In production nothing registers hooks, so the accessors
 * return an empty object and every call site is a single global lookup.
 *
 * Registered via globalThis (not module state) so it works identically under
 * Next.js, vitest, and tsx regardless of module format or duplicated module
 * instances.
 */

import type { TravelMatrix } from '@/shared';

export type PlanningToolRunner = (
  name: string,
  args: Record<string, unknown>,
) => Promise<object>;

export interface RouteMatrixActivity {
  name: string;
  lat: number;
  lng: number;
}

export type RouteMatrixMode = 'DRIVE' | 'TRANSIT' | 'WALK';

export type RouteMatrixRunner = (
  activities: RouteMatrixActivity[],
  mode: RouteMatrixMode,
) => Promise<TravelMatrix>;

export interface EvalHooks {
  /** Intercepts every Phase-1 tool execution. `runReal` invokes the real implementation. */
  interceptPlanningTool?: (
    name: string,
    args: Record<string, unknown>,
    runReal: PlanningToolRunner,
  ) => Promise<object>;
  /** Intercepts the travel-matrix computation. `runReal` invokes the real Routes API call. */
  interceptRouteMatrix?: (
    activities: RouteMatrixActivity[],
    mode: RouteMatrixMode,
    runReal: RouteMatrixRunner,
  ) => Promise<TravelMatrix>;
  /** Fires at the start of each planning round with the number of tool calls Gemini requested. */
  onPlanningRound?: (round: number, toolCallCount: number) => void;
}

const HOOKS_KEY = '__gemini_hackathon_eval_hooks__';

export function getEvalHooks(): EvalHooks {
  return ((globalThis as Record<string, unknown>)[HOOKS_KEY] as EvalHooks | undefined) ?? {};
}

export function setEvalHooks(hooks: EvalHooks): void {
  (globalThis as Record<string, unknown>)[HOOKS_KEY] = hooks;
}

export function clearEvalHooks(): void {
  delete (globalThis as Record<string, unknown>)[HOOKS_KEY];
}
```

**What it does, piece by piece:**

- `PlanningToolRunner` — the signature of the real tool dispatcher. Interceptors receive it as `runReal`, so they can *decorate* (record) or *replace* (replay) the real call.
- `RouteMatrixActivity` / `RouteMatrixMode` / `RouteMatrixRunner` — same idea for `computeRouteMatrixAction`. Types are duplicated here (rather than imported from the action file) so this file has no dependency on a `'use server'` module.
- `EvalHooks` — the three optional hooks. All optional, so registering `{}` is a no-op.
  - `interceptPlanningTool` — wraps every Phase-1 tool execution (the trace capture + record/replay point).
  - `interceptRouteMatrix` — wraps the NxN travel-matrix Routes API call.
  - `onPlanningRound(round, toolCallCount)` — fired once per Gemini planning round; lets the grader detect the "loop hit MAX_TOOL_ROUNDS while still requesting tools" failure mode without parsing logs.
- `HOOKS_KEY` — a string key on `globalThis`. A string (not a `Symbol`) keeps the TypeScript typing simple and survives multiple copies of the module being loaded.
- `getEvalHooks()` — returns the registered hooks or `{}`. This is the only thing production code calls; cost is one property read.
- `setEvalHooks()` / `clearEvalHooks()` — used only by the harness, wrapped around each scenario run (`clear` in a `finally` so a crashed scenario can't leak hooks into the next one).

---

## 2. `src/app/actions/generate-itinerary.ts` (MODIFIED — type exports only)

Two `interface` keywords gained `export`; **no runtime change**:

```diff
-interface ActivityPick {
+export interface ActivityPick {
```

```diff
-interface GenerateItineraryInput {
+export interface GenerateItineraryInput {
```

**Why:** the harness types scenarios as `GenerateItineraryInput`, so the dataset is type-checked against the exact contract the server action accepts — if the input shape changes, the eval dataset fails to compile instead of silently drifting. Type-only exports are erased at compile time, so the Next.js rule that `'use server'` files may only export async functions is not violated.

---

## 3. `src/lib/trip-planning-tools.ts` (MODIFIED — 3 edits)

**Edit 3a — import the seam:**

```diff
 import { Type } from '@google/genai';
 import type { OpeningPeriod } from '@/db/schema';
+import { getEvalHooks } from './eval-hooks';
```

**Edit 3b — rename the real dispatcher (private):**

```diff
-export async function executePlanningTool(
+async function dispatchPlanningTool(
   name: string,
   args: Record<string, unknown>,
 ): Promise<object> {
   switch (name) {
```

**Edit 3c — re-export `executePlanningTool` as the hookable wrapper (appended after the switch):**

```ts
export async function executePlanningTool(
  name: string,
  args: Record<string, unknown>,
): Promise<object> {
  const intercept = getEvalHooks().interceptPlanningTool;
  if (intercept) return intercept(name, args, dispatchPlanningTool);
  return dispatchPlanningTool(name, args);
}
```

**What it does:** the public name and signature of `executePlanningTool` are unchanged, so `gemini-planning-phase.ts` (its only caller) needed no edits. The old body lives on as the private `dispatchPlanningTool`, and it is handed to the interceptor as `runReal` — record mode calls it and captures the result; replay mode never calls it. With no hooks registered, behavior is byte-for-byte identical to before.

---

## 4. `src/app/actions/compute-route-matrix.ts` (MODIFIED — 2 edits)

**Edit 4a — import the seam:**

```diff
 import type { TravelMatrix } from '@/shared';
+import { getEvalHooks } from '@/lib/eval-hooks';
```

**Edit 4b — split the exported action into a hookable wrapper + private real implementation:**

```diff
 export async function computeRouteMatrixAction(
   activities: Activity[],
   mode: TravelMode = 'DRIVE',
 ): Promise<TravelMatrix> {
+  const intercept = getEvalHooks().interceptRouteMatrix;
+  if (intercept) return intercept(activities, mode, computeRouteMatrixReal);
+  return computeRouteMatrixReal(activities, mode);
+}
+
+async function computeRouteMatrixReal(
+  activities: Activity[],
+  mode: TravelMode = 'DRIVE',
+): Promise<TravelMatrix> {
   if (activities.length < 2) return {};
   ...rest of the original body unchanged...
```

**What it does:** same wrapper pattern as the tools file. Note this file is `'use server'`, which forbids adding *synchronous* exports (like a setter function) — that's exactly why the hook registry lives in the separate, non-server `eval-hooks.ts` module and this file only *reads* it inside an async function. `computeRouteMatrixReal` is not exported, so the server-action surface is unchanged.

---

## 5. `src/lib/gemini-planning-phase.ts` (MODIFIED — 3 edits)

**Edit 5a — import the seam:**

```diff
 import { PLANNING_TOOL_DECLARATIONS, executePlanningTool, formatOpeningHours } from './trip-planning-tools';
+import { getEvalHooks } from './eval-hooks';
```

**Edit 5b — export the round cap so the grader uses the real constant:**

```diff
-const MAX_TOOL_ROUNDS = 6; // prevent infinite loops
+export const MAX_TOOL_ROUNDS = 6; // prevent infinite loops
```

**Edit 5c — report each planning round to the (optional) hook:**

```diff
         // Check for function calls
         const functionCalls = response.functionCalls ?? [];
+        getEvalHooks().onPlanningRound?.(round + 1, functionCalls.length);
```

**What it does:** the Phase-1 loop-bound check needs to know *how many rounds ran* and *whether the final round still wanted tools* (that combination means Gemini got cut off mid-plan). The tool interceptor alone can't see round boundaries, so this one line reports `(round, requestedToolCalls)` after every Gemini response. `?.` makes it free in production. Exporting `MAX_TOOL_ROUNDS` means the grader can never drift from the real cap.

---

## 6. `eval/harness/types.ts` (NEW — shared harness types)

```ts
/**
 * Shared types for the eval harness.
 */

import type { ItineraryGenerationResponse } from '@/shared';
import type { GenerateItineraryInput } from '@/app/actions/generate-itinerary';

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

export interface RequiredToolCall {
  name: string;
  /**
   * Subset of args that must appear on at least one call to `name`.
   * Strings match case-insensitively by substring (either direction);
   * numbers match within 10%; everything else must deep-equal.
   */
  args_include?: Record<string, unknown>;
}

export interface ScenarioExpectations {
  phase1_required_tool_calls?: RequiredToolCall[];
  /** Minimum scheduled minutes for any hike-like item in the itinerary. */
  phase2_hike_duration_min_minutes?: number;
  /** Minimum number of is_suggested items across the whole itinerary (gap-fill scenarios). */
  phase2_min_suggested_items?: number;
  /** Minimum number of type="alternative" items (meal-conflict scenarios). */
  phase2_min_alternative_items?: number;
}

export interface EvalScenario {
  id: string;
  title: string;
  /** Why this scenario is in the set — shown in the scorecard. */
  notes?: string;
  input: GenerateItineraryInput;
  expectations?: ScenarioExpectations;
}

// ---------------------------------------------------------------------------
// Trace + grading
// ---------------------------------------------------------------------------

export type TraceSource = 'live' | 'fixture' | 'synthetic' | 'pure';

export interface ToolTraceEntry {
  name: string;
  args: Record<string, unknown>;
  result: object;
  /** Where the result came from: live API, recorded fixture, synthetic fallback, or a pure local tool. */
  source: TraceSource;
  /** Planning round (1-based) during which the call executed. */
  round: number;
}

export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  details: string;
}

export interface JudgeScore {
  criterion: string;
  score: number; // 1–5
  justification: string;
  model: string;
  cached: boolean;
}

export interface ScenarioResult {
  scenarioId: string;
  title: string;
  startedAt: string;
  durationMs: number;
  /** Non-null when generation itself threw or timed out. */
  error: string | null;
  itinerary: ItineraryGenerationResponse | null;
  toolTrace: ToolTraceEntry[];
  planningRounds: number;
  /** Tool calls requested in the final observed round — used for the loop-bound check. */
  lastRoundToolCalls: number;
  phase1: CheckResult[];
  phase2: CheckResult[];
  judge: JudgeScore[];
}

export interface RunOutput {
  runAt: string;
  mode: 'replay' | 'record' | 'regrade';
  judged: boolean;
  results: ScenarioResult[];
}

export function deterministicFailures(r: ScenarioResult): CheckResult[] {
  return [...r.phase1, ...r.phase2].filter(c => c.status === 'fail');
}
```

**What each type is for:**

- `RequiredToolCall` / `ScenarioExpectations` — the `expectations` block of a scenario in `scenarios.json` (same snake_case keys as the plan). Only *expectation-driven* checks appear here; structural checks are auto-derived.
- `EvalScenario` — one dataset entry: `input` is the **exact** `GenerateItineraryInput` type the server action takes.
- `ToolTraceEntry` — one captured Phase-1 tool call. `source` makes it visible in the scorecard whether a result came from a live API, a fixture, a synthetic fallback, or a pure local tool. `round` ties it to the planning round.
- `CheckResult` — a single deterministic check: `pass` / `fail` / `skip` plus a human-debuggable `details` string (every failure explains itself).
- `JudgeScore` — one criterion's LLM-judge output, with `cached` flagging cache hits and `model` recording which judge produced it.
- `ScenarioResult` / `RunOutput` — everything about one scenario / one run; this is what gets serialized to `raw.json` and is sufficient to re-grade later without re-generating (`--regrade`).
- `deterministicFailures()` — helper the runner uses for the exit code (any deterministic `fail` → exit 1).

---

## 7. `eval/harness/time-utils.ts` (NEW — time parsing)

```ts
/**
 * Time parsing for itinerary item times.
 * Gemini usually emits "9:00 AM" style, but we accept 24h too.
 */

/** Parses "9:00 AM", "9 AM", "09:00", "21:30" → minutes since midnight, or null. */
export function parseTimeToMinutes(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*$/i.exec(raw);
  if (!m) return null;

  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3]?.toLowerCase().replace(/\./g, '');

  if (minute > 59) return null;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, '0')} ${ampm}`;
}
```

**What it does:** every hard check that reasons about schedules (`no_overlap`, `opening_hours`, `hike_duration`, `meal_balance`, `start_time`) needs times as numbers. The itinerary schema stores times as free strings, so this parser accepts the formats Gemini actually emits ("9:00 AM", "9 AM", "09:00", "21:30", even "9 p.m.") and returns minutes-since-midnight, or `null` for garbage — and a dedicated `times_parseable` check fails loudly when `null` shows up, instead of every downstream check silently skipping. `12 AM` → 0 and `12 PM` → 720 are handled explicitly (the classic bug). `formatMinutes` is the inverse, for readable failure messages.

---

## 8. `eval/harness/fixtures.ts` (NEW — record / replay / synthetic layer)

Full source:

```ts
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
```

**Section-by-section:**

- **File I/O helpers** (`fixturePath` / `loadFixture` / `saveFixture`): fixtures live at `eval/datasets/fixtures/<scenario-id>.json` and are meant to be committed to git, exactly per the plan.
- **`FixtureFile`**: one file per scenario, holding every recorded `(name, args) → result` tool call plus the route matrix per transport mode.
- **`haversineKm`**: great-circle distance; the basis for all synthetic travel estimates and for fuzzy coordinate matching.
- **Synthetic travel time**: straight-line distance × 1.3 road factor, divided by a per-mode speed (45 km/h drive, 22 transit, 4.5 walk), plus fixed overhead (parking/waiting). Output shape mirrors the real `getTravelTime` result exactly (including `distance_km` as a *string*, matching prod) so Gemini can't tell the difference.
- **Synthetic weather**: pinned to a fixed base date (`2026-06-01`) and a fixed condition cycle so replay runs are identical no matter when they execute; temperature is a crude function of latitude so SF and Reykjavik at least look different.
- **Synthetic restaurants**: three plausible entries offset slightly from the queried coordinates, `(synthetic)`-suffixed so they're identifiable in itinerary output and in the judge's view.
- **`findFixtureMatch`** (the fuzzy lookup): exact args match wins; otherwise per-tool logic — travel time matches by origin/dest names then by nearest coordinates (< 5 km total error), weather by nearest coords (< 250 km — same region is the same forecast), restaurants by same meal type + nearest coords. Returning `null` falls through to synthetic.
- **`createScenarioHooks`** (the factory the runner uses): builds one `EvalHooks` object per scenario run.
  - `onPlanningRound` tracks `currentRound` (so trace entries can be tagged) and mirrors round stats into the shared `state` the Phase-1 grader reads.
  - `interceptPlanningTool` implements the 3-way policy: pure tools → always real; record → real + capture; replay → fixture, else synthetic. Every call lands in `trace` with its `source`.
  - `interceptRouteMatrix`: record → real Routes API + capture; replay → fixture matrix, else synthetic haversine matrix.
  - `getRecordedFixture()` hands the accumulated recording back to the runner, which saves it only when the scenario completed successfully.

---

## 9. `eval/graders/phase1-tool-calls.ts` (NEW — Phase-1 trace grader)

```ts
/**
 * Phase-1 grader — deterministic checks over the captured tool trace.
 */

import { MAX_TOOL_ROUNDS } from '@/lib/gemini-planning-phase';
import type { CheckResult, EvalScenario, ToolTraceEntry } from '../harness/types';
import type { PlanningState } from '../harness/fixtures';

const VALID_MODES = new Set(['DRIVE', 'TRANSIT', 'WALK']);
const VALID_DIFFICULTIES = new Set(['easy', 'moderate', 'hard', 'strenuous']);

function valueMatches(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'string' && typeof actual === 'string') {
    const e = expected.toLowerCase().trim();
    const a = actual.toLowerCase().trim();
    return a.includes(e) || e.includes(a);
  }
  if (typeof expected === 'number' && typeof actual === 'number') {
    const tolerance = Math.max(Math.abs(expected) * 0.1, 0.5);
    return Math.abs(expected - actual) <= tolerance;
  }
  return JSON.stringify(expected) === JSON.stringify(actual);
}

export function gradePhase1(
  scenario: EvalScenario,
  trace: ToolTraceEntry[],
  planning: PlanningState,
): CheckResult[] {
  const checks: CheckResult[] = [];
  const required = scenario.expectations?.phase1_required_tool_calls ?? [];

  // --- Required-tool coverage -------------------------------------------
  for (const req of required) {
    const nameMatches = trace.filter(t => t.name === req.name);
    const fullMatch = nameMatches.find(t =>
      Object.entries(req.args_include ?? {}).every(([k, v]) => valueMatches(v, t.args[k])),
    );
    const label = `required_call:${req.name}`;
    if (fullMatch) {
      checks.push({ name: label, status: 'pass', details: `called with ${JSON.stringify(fullMatch.args)}` });
    } else if (nameMatches.length > 0) {
      checks.push({
        name: label,
        status: 'fail',
        details: `called ${nameMatches.length}× but no call matched args_include ${JSON.stringify(req.args_include)}; saw ${nameMatches.map(t => JSON.stringify(t.args)).join(' | ')}`,
      });
    } else {
      checks.push({ name: label, status: 'fail', details: `never called (trace: ${trace.map(t => t.name).join(', ') || 'empty'})` });
    }
  }

  // --- Arg sanity: hikes ---------------------------------------------------
  const hikeCalls = trace.filter(t => t.name === 'estimate_hike_duration');
  if (hikeCalls.length === 0) {
    checks.push({ name: 'hike_arg_sanity', status: 'skip', details: 'no estimate_hike_duration calls' });
  } else {
    const bad = hikeCalls.filter(t =>
      !(Number(t.args.distance_km) > 0) ||
      !(Number(t.args.elevation_gain_m) > 0) ||
      !VALID_DIFFICULTIES.has(String(t.args.difficulty)),
    );
    checks.push({
      name: 'hike_arg_sanity',
      status: bad.length === 0 ? 'pass' : 'fail',
      details: bad.length === 0
        ? `${hikeCalls.length} hike call(s) with plausible distance/elevation/difficulty`
        : `implausible args: ${bad.map(t => JSON.stringify(t.args)).join(' | ')}`,
    });
  }

  // --- Arg sanity: weather ---------------------------------------------------
  const weatherCalls = trace.filter(t => t.name === 'get_weather_forecast');
  if (weatherCalls.length === 0) {
    checks.push({ name: 'weather_arg_sanity', status: 'skip', details: 'no get_weather_forecast calls' });
  } else {
    const activities = scenario.input.activities;
    const bad = weatherCalls.filter(t => {
      const lat = Number(t.args.lat);
      const lng = Number(t.args.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return true;
      // Must be near at least one scenario activity (~3° box).
      return !activities.some(a => Math.abs(a.lat - lat) < 3 && Math.abs(a.lng - lng) < 3);
    });
    checks.push({
      name: 'weather_arg_sanity',
      status: bad.length === 0 ? 'pass' : 'fail',
      details: bad.length === 0
        ? `${weatherCalls.length} weather call(s) near scenario activities`
        : `weather requested away from scenario area: ${bad.map(t => JSON.stringify(t.args)).join(' | ')}`,
    });
  }

  // --- Arg sanity: travel time ---------------------------------------------
  const travelCalls = trace.filter(t => t.name === 'get_travel_time');
  if (travelCalls.length === 0) {
    checks.push({ name: 'travel_arg_sanity', status: 'skip', details: 'no get_travel_time calls' });
  } else {
    const bad = travelCalls.filter(t => !VALID_MODES.has(String(t.args.mode)));
    checks.push({
      name: 'travel_arg_sanity',
      status: bad.length === 0 ? 'pass' : 'fail',
      details: bad.length === 0
        ? `${travelCalls.length} travel-time call(s) with valid mode`
        : `invalid mode in: ${bad.map(t => JSON.stringify(t.args)).join(' | ')}`,
    });
  }

  // --- Loop bound ------------------------------------------------------------
  const hitCap = planning.rounds >= MAX_TOOL_ROUNDS && planning.lastRoundToolCalls > 0;
  checks.push({
    name: 'loop_bound',
    status: hitCap ? 'fail' : 'pass',
    details: hitCap
      ? `hit MAX_TOOL_ROUNDS (${MAX_TOOL_ROUNDS}) with tool calls still pending — planning loop got stuck`
      : `finished in ${planning.rounds} round(s)`,
  });

  return checks;
}
```

**Checks it performs:**

| Check | Logic | Failure it catches |
|---|---|---|
| `required_call:<tool>` | Each `phase1_required_tool_calls` entry must match ≥1 trace call by name **and** all `args_include` values (`valueMatches`: strings by case-insensitive substring either direction — so `"Yosemite Falls"` matches `"Yosemite Falls Trail"`; numbers within 10%). Failure details show what *was* called, so you see near-misses. | The known bug of Gemini skipping `estimate_hike_duration` for named hikes. |
| `hike_arg_sanity` | Every hike call must have `distance_km > 0`, `elevation_gain_m > 0`, valid difficulty enum. | Gemini calling the tool with zeroed args, which yields a garbage duration. |
| `weather_arg_sanity` | Coordinates in valid ranges *and* within a ~3° box of at least one scenario activity. | Weather fetched for the wrong place entirely. |
| `travel_arg_sanity` | `mode` ∈ {DRIVE, TRANSIT, WALK}. | Invalid mode strings that make the Routes API silently default. |
| `loop_bound` | Fails only when `rounds ≥ MAX_TOOL_ROUNDS` **and** the final round still requested tools — i.e., planning was truncated mid-flight. Reaching round 6 with zero requested calls is a normal finish. | The stuck-loop failure mode. |

Sanity checks `skip` (not pass) when the tool was never called, so the scorecard distinguishes "fine" from "not exercised".

---

## 10. `eval/graders/phase2-hard-checks.ts` (NEW — hard-contract grader)

Full source is in the file; the key design points and per-check logic:

**Helpers at the top:**

```ts
const HIKE_TITLE = /hike|hiking|trail|trek|summit|falls trail|waterfall/i;

const isCommute = (item: Item) => item.type?.toLowerCase().includes('commute');
const isAlternative = (item: Item) => item.type?.toLowerCase().includes('alternative');
const norm = (s: string) => s.toLowerCase().trim();

function findUserItem(days: Day[], activityName: string): { day: Day; item: Item } | null {
  // exact-title, non-suggested, non-commute item anywhere in the itinerary
}
```

`type` is a free-form string in the schema, so commute/alternative detection is substring-based. `findUserItem` encodes the contract from prompt rule 9: user activities keep their **exact** name and `is_suggested: false`.

**Every check, in order:**

| Check | Applies when | Rule (and notable edge handling) |
|---|---|---|
| `day_count` | always | `days.length === numDays` **and** day_numbers are exactly `1..numDays` (sorted compare catches duplicates and gaps). |
| `times_parseable` | always | Every item's start/end parses and `end > start`. Failing here explains downstream oddities; other time-based checks quietly ignore unparseable items rather than double-reporting. |
| `coords_present` | always | Finite lat/lng, in-range, and not `(0, 0)` (the classic "null island" giveaway). |
| `user_activities_present` | always | Every non-hotel input activity found via `findUserItem`. Failure details include *near-misses* (case-insensitive title match that was renamed/suggested/mistyped) to make diagnosis instant. |
| `no_overlap` | always | Per day, non-commute/non-alternative items sorted by start; each must start at/after the previous end. Commutes are excluded per the plan (they legitimately abut activities). |
| `opening_hours` | activities with `openingHours` exist | The itinerary has **no calendar dates**, so day N maps to no weekday. The honest verifiable contract: the scheduled window must fit inside the venue's open window on **at least one** weekday. Open-24h (`close: null`) always passes; windows closing on a later weekday are treated as closing at midnight. This still catches "dinner-only restaurant scheduled at 11 AM" and "museum scheduled after close". |
| `hike_duration` | `phase2_hike_duration_min_minutes` set | Finds hike-like items by title regex; each must be scheduled ≥ the threshold. **Fails (not skips) if no hike-like item exists at all** — the hike vanishing is the worst regression. |
| `hotel_anchor` | hotel in input | Each day starts and ends with a commute item; hotel name never appears as a standalone non-commute item. |
| `day_assignments` | `dayAssignments` has `day-N` keys | Each pinned activity appears (exact title, non-suggested) on its assigned day; failure says where it actually landed. |
| `meal_balance` | user selected restaurants | Non-suggested user-restaurant items are bucketed by start time (<11:00 breakfast, 11:00–16:00 lunch, ≥16:00 dinner); max one per bucket per day. Alternatives are excluded — they're supposed to exist as extras. |
| `pace` | `input.pace` set | Counts "real activities" per day (not commutes, not alternatives, not meals — pace bands in the prompt describe activities *besides* meals). Bands are the prompt's (relaxed 2–3, moderate 3–4, packed 5+) with ±1 grace so a single borderline day doesn't flap the suite. |
| `start_time` | `input.startTime` set | First non-commute item of each day starts at/after the requested time (the commute from the hotel is allowed to start earlier). |
| `min_suggested_items` | expectation set | ≥ N `is_suggested` non-commute items across the itinerary (gap-fill scenario). |
| `min_alternative_items` | expectation set | ≥ N `type="alternative"` items (meal-surplus scenario). |

Every check returns `{ name, status, details }` where `details` names the exact offending items and times — per the plan's "failures are debuggable" requirement.

---

## 11. `eval/graders/phase2-llm-judge.ts` (NEW — LLM-as-judge)

Full source is in the file. Structure:

**Criteria (one Gemini call each, per the plan's confirmed decision):**

```ts
const CRITERIA: Criterion[] = [
  { id: 'geographic_clustering', rubric: `...` },
  { id: 'realistic_pacing',      rubric: `...` },
  { id: 'description_quality',   rubric: `...` },
  { id: 'feedback_recovery',     appliesTo: s => Boolean(s.input.preference), rubric: `...` },
];
```

Each rubric is single-dimension with anchored 1/3/5 descriptions (e.g. clustering: *"5 = each day forms a tight, logically-ordered cluster… 1 = itinerary zigzags across the map"*). `feedback_recovery` only runs when the scenario has a `preference`, and its prompt includes both the previous itinerary and the feedback string.

**The call itself:**

```ts
const response = await ai.models.generateContent({
  model,
  contents: prompt,
  config: {
    responseMimeType: 'application/json',
    responseSchema: JUDGE_SCHEMA,   // { score: integer, justification: string }
    temperature: 0,
  },
});
```

- Judge model: `gemini-2.5-pro` by default (different family position than the Phase-2 generator's first choice, reducing self-preference bias), overridable via `EVAL_JUDGE_MODEL` — e.g. set it to `gemini-2.5-flash` while iterating on rubrics cheaply.
- On rate-limit errors it falls back to `gemini-2.5-flash` once; a hard failure returns `score: 0` with the error in `justification` instead of crashing the run (score 0 is outside the 1–5 range, so it's visibly "judge failed", never "bad itinerary").
- Scores are clamped to 1–5 and rounded, defending against schema-violating outputs.

**Caching (the main cost lever):**

```ts
function cacheKey(model, criterion, scenario, itinerary) {
  sha256(JSON.stringify({ v: PROMPT_VERSION, model, criterion, scenarioId, itinerary }))
}
```

Cache files live in `eval/.cache/judge/<hash>.json` (gitignored). Re-running the suite over an unchanged itinerary — e.g. `--regrade`, or reruns where the generator happened to produce identical output — costs zero judge calls. `PROMPT_VERSION` is bumped manually to invalidate the cache after rubric edits.

---

## 12. Scenario dataset generator (scratchpad, **not yet run** — pending your go-ahead)

A one-off script was prepared in the session scratchpad (`build-scenarios.ts`) that emits `eval/datasets/scenarios.json`. It exists because the `OpeningPeriod` arrays (`{ open: {day, hour, minute}, close: {...} }` per weekday per venue) are extremely repetitive to hand-write; the script uses a `hours(days, openH, openM, closeH, closeM)` helper and real coordinates. Only the generated JSON would be committed — the script itself stays out of the repo.

The 9 scenarios it defines (plan's 8 + one addition):

| # | id | Covers |
|---|---|---|
| 1 | `sf-baseline` | 3-day SF, 7 activities incl. hotel (Hotel Nikko) — hotel-anchor logic, moderate pace. SFMOMA closed Wed, de Young closed Mon. |
| 2 | `yosemite-hike` | 2-day Yosemite with **Yosemite Falls Trail** — requires `estimate_hike_duration` call (`args_include: { trail_name: "Yosemite Falls" }`), hike scheduled ≥ 300 min. The hike-shortening regression. |
| 3 | `tokyo-meals` | 1 day, 6 restaurants (2 dinner-only with 17:00+ opening hours) — meal balance + ≥2 `alternative` items. |
| 4 | `iceland-clusters` | 5 days, 10 activities from Reykjavik to Jökulsárlón (~370 km apart) — geographic clustering, requires `get_travel_time`. |
| 5 | `paris-closed-days` | 2-day Paris: Orsay closed Mon, Louvre closed Tue — opening-hours enforcement. |
| 6 | `nyc-day-assignments` | 4-day NYC, Statue of Liberty pinned to day 2, the Met to day 4, six unassigned. |
| 7 | `sf-packed-luxury` | Same activities as #1 with `pace: packed`, `budget: luxury`, `startTime: 7:00 AM` — the knobs. |
| 8 | `rome-gap-fill` | 2 days, only the Colosseum selected — requires ≥4 AI-suggested items. |
| 9 | `sf-feedback` *(added)* | 2-day SF refinement with `currentItinerary` + `preference` ("less museums, more outdoors, keep Ferry Building lunch") — exercises the judge's `feedback_recovery` criterion, which no plan scenario covered. |

Every scenario requires `get_weather_forecast` in Phase 1, because the planning prompt mandates it unconditionally.

---

## 13. Still pending (not yet built)

1. **`eval/harness/runner.ts`** — per-scenario driver: set hooks → call `generateItineraryAction` with a timeout → clear hooks in `finally` → save fixture (record mode) → run all graders.
2. **`eval/harness/report.ts`** — `scorecard.md`, `raw.json`, and `diff.md` against the previous run in `eval/results/`.
3. **`eval/harness/run.ts`** — CLI entrypoint: loads `.env.local` via dotenv, flags `--scenario <id>`, `--record`, `--no-judge`, `--regrade <run-dir>`, non-zero exit on deterministic failures.
4. **Generate `eval/datasets/scenarios.json`** by running the scratchpad script (this is the step that was paused).
5. **`package.json`**: add `"eval": "tsx eval/harness/run.ts"`.
6. **`.gitignore`**: add `eval/results/` and `eval/.cache/`.
7. **`plan.md`**: fill in the §API-cost strategy section with the implemented levers.
8. **Verify**: `tsc --noEmit`, then a single-scenario smoke run (`npm run eval -- --scenario rome-gap-fill --no-judge`) — this makes live Gemini calls (a few cents).
