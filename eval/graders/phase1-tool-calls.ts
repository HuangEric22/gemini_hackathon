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
