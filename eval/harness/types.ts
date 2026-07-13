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
