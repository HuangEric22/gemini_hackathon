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
