/**
 * LLM-as-judge grader — one Gemini call per criterion (cleaner per-dimension
 * signal, no halo effect), temperature 0, JSON-schema output.
 *
 * Cost controls:
 * - Judge outputs are cached in eval/.cache/judge/ keyed by a hash of
 *   (model, prompt version, criterion, scenario id, itinerary JSON) — re-runs
 *   over unchanged itineraries are free.
 * - EVAL_JUDGE_MODEL overrides the judge model (e.g. gemini-2.5-flash for
 *   cheap draft iterations on the rubric).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import type { ItineraryGenerationResponse } from '@/shared';
import type { EvalScenario, JudgeScore } from '../harness/types';

const DEFAULT_JUDGE_MODEL = 'gemini-2.5-pro';
const FALLBACK_JUDGE_MODEL = 'gemini-2.5-flash';
const PROMPT_VERSION = 1; // bump to invalidate the judge cache after rubric edits

const CACHE_DIR = path.join(process.cwd(), 'eval', '.cache', 'judge');

interface Criterion {
  id: string;
  /** Only judge this criterion when the predicate holds for the scenario. */
  appliesTo?: (scenario: EvalScenario) => boolean;
  rubric: string;
}

const CRITERIA: Criterion[] = [
  {
    id: 'geographic_clustering',
    rubric: `Judge GEOGRAPHIC CLUSTERING only. Using the lat/lng on each item, assess whether each day's activities are grouped sensibly in space and visited in a logical order.
5 = each day forms a tight, logically-ordered cluster; far-flung activities get their own day or half-day.
3 = mostly clustered but with one or two avoidable back-and-forth trips.
1 = itinerary zigzags across the map; same areas revisited on multiple days for no reason.`,
  },
  {
    id: 'realistic_pacing',
    rubric: `Judge REALISTIC PACING only. Assess whether the schedule feels humanly doable: sensible visit lengths for each kind of place, commute buffers, meal timing, no absurdly early/late slots, and no huge dead gaps (unless the trip is explicitly relaxed).
5 = a human could follow this schedule comfortably; transitions and durations all feel right.
3 = doable but with a few rushed transitions or unrealistic visit lengths.
1 = physically implausible: overlapping or back-to-back items with no travel time, 15-minute museum visits, or 4-hour unexplained gaps.`,
  },
  {
    id: 'description_quality',
    rubric: `Judge DESCRIPTION QUALITY only. Assess brief_description on each day and the per-item descriptions.
5 = descriptions are specific to the actual places (concrete details a traveler would care about), concise, and helpful.
3 = mixed: some specific, some generic filler.
1 = generic boilerplate that could describe any city ("enjoy this wonderful attraction").`,
  },
  {
    id: 'feedback_recovery',
    appliesTo: s => Boolean(s.input.preference),
    rubric: `Judge FEEDBACK RECOVERY only. The user gave feedback on a previous itinerary (both are provided). Assess whether the new itinerary meaningfully reflects the feedback while keeping what was working.
5 = feedback clearly applied throughout; unaffected parts sensibly preserved.
3 = partially applied, or applied at the cost of unrelated regressions.
1 = feedback ignored or contradicted.`,
  },
];

const JUDGE_SCHEMA = {
  type: 'object' as const,
  properties: {
    score: { type: 'integer' as const, description: 'Integer 1-5' },
    justification: { type: 'string' as const, description: '2-3 sentences citing specific items' },
  },
  required: ['score', 'justification'],
};

function scenarioContext(scenario: EvalScenario): string {
  const input = scenario.input;
  const acts = input.activities
    .map(a => `- ${a.name}${a.category ? ` [${a.category}]` : ''} at (${a.lat.toFixed(4)}, ${a.lng.toFixed(4)})`)
    .join('\n');
  const knobs = [
    `days: ${input.numDays}`,
    input.transportMode ? `transport: ${input.transportMode}` : null,
    input.pace ? `pace: ${input.pace}` : null,
    input.budget ? `budget: ${input.budget}` : null,
    input.startTime ? `day start: ${input.startTime}` : null,
  ].filter(Boolean).join(' | ');
  const feedback = input.preference
    ? `\nUser feedback on the previous itinerary: "${input.preference}"\nPrevious itinerary:\n${JSON.stringify(input.currentItinerary ?? null)}\n`
    : '';
  return `Trip request (${knobs}):\n${acts}\n${feedback}`;
}

function cacheKey(model: string, criterion: string, scenario: EvalScenario, itinerary: ItineraryGenerationResponse): string {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify({ v: PROMPT_VERSION, model, criterion, scenarioId: scenario.id, itinerary }));
  return h.digest('hex');
}

function readCache(key: string): JudgeScore | null {
  const p = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return { ...(JSON.parse(fs.readFileSync(p, 'utf-8')) as JudgeScore), cached: true };
  } catch {
    return null;
  }
}

function writeCache(key: string, score: JudgeScore): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(score, null, 2));
}

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; message?: string };
  if (e.status === 503 || e.status === 429) return true;
  const msg = e.message ?? '';
  return msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('high demand');
}

/** Daily quotas don't reset within a run — waiting on them is pointless. */
function isDailyQuota(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('PerDay');
}

/** Honors the API's advertised retry delay ("retryDelay":"15s"), else 20s. */
function retryDelayMs(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /retryDelay["':\s]+(\d+)/.exec(msg) ?? /retry in (\d+)/i.exec(msg);
  return m ? (parseInt(m[1], 10) + 2) * 1000 : 20_000;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const RETRIES_PER_MODEL = 3;

/** Matches quota-exhaustion errors that won't recover within this run. */
export function isQuotaFailure(justification: string): boolean {
  return justification.includes('judge call failed') &&
    (justification.includes('free_tier_requests') ||
     justification.includes('exceeded your current quota') ||
     justification.includes('RESOURCE_EXHAUSTED'));
}

async function judgeOne(
  ai: GoogleGenAI,
  scenario: EvalScenario,
  itinerary: ItineraryGenerationResponse,
  criterion: Criterion,
  skipApiCalls: boolean,
): Promise<JudgeScore> {
  const preferredModel = process.env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;

  const key = cacheKey(preferredModel, criterion.id, scenario, itinerary);
  const cached = readCache(key);
  if (cached) return cached;

  // Quota already exhausted earlier in this run — don't burn time retrying.
  if (skipApiCalls) {
    return {
      criterion: criterion.id,
      score: 0,
      justification: 'judge call failed: skipped — API quota exhausted earlier in this run',
      model: preferredModel,
      cached: false,
    };
  }

  const prompt = `You are a strict evaluator of AI-generated travel itineraries. Score ONE dimension only; ignore all other qualities.

${criterion.rubric}

${scenarioContext(scenario)}
Generated itinerary to evaluate:
${JSON.stringify(itinerary, null, 2)}

Return JSON: an integer score 1-5 and a 2-3 sentence justification citing specific items.`;

  let lastErr: unknown;
  outer: for (const model of [preferredModel, FALLBACK_JUDGE_MODEL]) {
    for (let attempt = 0; attempt < RETRIES_PER_MODEL; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: JUDGE_SCHEMA,
            temperature: 0,
          },
        });
        const parsed = JSON.parse(response.text ?? '{}') as { score?: number; justification?: string };
        const score: JudgeScore = {
          criterion: criterion.id,
          score: Math.min(5, Math.max(1, Math.round(parsed.score ?? 0))),
          justification: parsed.justification ?? '(no justification returned)',
          model,
          cached: false,
        };
        writeCache(key, score);
        return score;
      } catch (err) {
        lastErr = err;
        if (!isRetryable(err)) break outer;
        // Daily quota exhausted for this model: skip straight to the fallback.
        if (isDailyQuota(err)) continue outer;
        // Per-minute rate limit: wait the API's advertised delay and retry
        // before falling back to the next model.
        await sleep(retryDelayMs(err));
      }
    }
  }
  return {
    criterion: criterion.id,
    score: 0,
    justification: `judge call failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    model: preferredModel,
    cached: false,
  };
}

export async function runJudge(
  scenario: EvalScenario,
  itinerary: ItineraryGenerationResponse,
  apiKey: string,
): Promise<JudgeScore[]> {
  const ai = new GoogleGenAI({ apiKey });
  const applicable = CRITERIA.filter(c => !c.appliesTo || c.appliesTo(scenario));
  const scores: JudgeScore[] = [];
  let quotaExhausted = false;
  for (const criterion of applicable) {
    const score = await judgeOne(ai, scenario, itinerary, criterion, quotaExhausted);
    if (score.score === 0 && isQuotaFailure(score.justification)) quotaExhausted = true;
    scores.push(score);
  }
  return scores;
}
