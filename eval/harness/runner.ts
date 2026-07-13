/**
 * Per-scenario driver: registers eval hooks, runs the real
 * generateItineraryAction against a timeout, then grades the result.
 *
 * Scenarios must run sequentially — hooks live in a single global registry,
 * so parallel scenarios would trample each other's interceptors (and hammer
 * Gemini rate limits).
 */

import { setEvalHooks, clearEvalHooks } from '@/lib/eval-hooks';
import { generateItineraryAction } from '@/app/actions/generate-itinerary';
import type { ItineraryGenerationResponse } from '@/shared';
import { createScenarioHooks, saveFixture, type PlanningState } from './fixtures';
import { gradePhase1 } from '../graders/phase1-tool-calls';
import { gradePhase2 } from '../graders/phase2-hard-checks';
import { runJudge } from '../graders/phase2-llm-judge';
import type { EvalScenario, ScenarioResult, ToolTraceEntry } from './types';

// Generation legitimately takes minutes (planning rounds + model fallbacks).
const DEFAULT_TIMEOUT_MS = 240_000;

export interface RunScenarioOptions {
  mode: 'record' | 'replay';
  judge: boolean;
  apiKey: string;
  timeoutMs?: number;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`generation timed out after ${ms / 1000}s`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runScenario(
  scenario: EvalScenario,
  opts: RunScenarioOptions,
): Promise<ScenarioResult> {
  const trace: ToolTraceEntry[] = [];
  const state: PlanningState = { rounds: 0, lastRoundToolCalls: 0 };
  const { hooks, getRecordedFixture } = createScenarioHooks({
    scenarioId: scenario.id,
    mode: opts.mode,
    trace,
    state,
  });

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let itinerary: ItineraryGenerationResponse | null = null;
  let error: string | null = null;

  setEvalHooks(hooks);
  try {
    itinerary = await withTimeout(
      generateItineraryAction(scenario.input),
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    // Always unregister, even on crash/timeout, so hooks can't leak into the
    // next scenario. (A timed-out call may still be running detached; it can
    // no longer see any hooks after this.)
    clearEvalHooks();
  }
  const durationMs = Date.now() - t0;

  // Save the recording only after a fully successful generation, so
  // half-recorded fixtures never land on disk.
  if (itinerary && opts.mode === 'record') {
    saveFixture(getRecordedFixture());
  }

  // Phase-1 grading always runs: a tool trace exists even when Phase 2 died,
  // and it is the most useful diagnostic in that case.
  const phase1 = gradePhase1(scenario, trace, state);
  const phase2 = itinerary ? gradePhase2(scenario, itinerary) : [];
  const judge = itinerary && opts.judge ? await runJudge(scenario, itinerary, opts.apiKey) : [];

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    startedAt,
    durationMs,
    error,
    itinerary,
    toolTrace: trace,
    planningRounds: state.rounds,
    lastRoundToolCalls: state.lastRoundToolCalls,
    phase1,
    phase2,
    judge,
  };
}
