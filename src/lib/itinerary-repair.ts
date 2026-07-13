/**
 * Validate-and-repair loop for itinerary generation.
 *
 * Gemini sometimes violates hard constraints (drops a user activity,
 * schedules a venue before it opens, double-books a meal slot). Rather than
 * hoping the prompt is followed, we validate the response deterministically
 * and, on violations, re-prompt once with the concrete violations attached.
 * The better of the two attempts (fewer violations) wins, so a repair pass
 * can never make the result worse.
 */

import type { ItineraryGenerationResponse } from '@/shared';
import { validateItinerary, type TripInputForValidation } from './itinerary-validation';

const MAX_REPAIR_PASSES = 1;

export interface RepairOutcome {
  itinerary: ItineraryGenerationResponse;
  /** Violations still present in the returned itinerary (empty = clean). */
  violations: string[];
  /** Number of repair prompts actually sent. */
  repairPasses: number;
}

export function buildRepairPrompt(
  basePrompt: string,
  previous: ItineraryGenerationResponse,
  violations: string[],
): string {
  return `${basePrompt}

Your previous attempt violated these hard requirements:
${violations.map(v => `- ${v}`).join('\n')}

Your previous attempt:
${JSON.stringify(previous)}

Produce a corrected itinerary that fixes EVERY violation listed above. Keep everything that was not flagged as close to the previous attempt as possible.`;
}

/**
 * Generates an itinerary via `generate`, validates it, and re-prompts with
 * the violations if any were found. Repair failures (API errors) are
 * swallowed — the original attempt is returned instead.
 */
export async function generateWithRepair(
  generate: (prompt: string) => Promise<ItineraryGenerationResponse>,
  basePrompt: string,
  input: TripInputForValidation,
): Promise<RepairOutcome> {
  let best = await generate(basePrompt);
  let bestViolations = validateItinerary(input, best);
  let repairPasses = 0;

  for (let pass = 0; pass < MAX_REPAIR_PASSES && bestViolations.length > 0; pass++) {
    console.warn(`[itinerary-repair] attempt has ${bestViolations.length} violation(s), re-prompting:\n${bestViolations.map(v => `  - ${v}`).join('\n')}`);
    repairPasses++;
    try {
      const repaired = await generate(buildRepairPrompt(basePrompt, best, bestViolations));
      const repairedViolations = validateItinerary(input, repaired);
      if (repairedViolations.length < bestViolations.length) {
        best = repaired;
        bestViolations = repairedViolations;
      } else {
        console.warn(`[itinerary-repair] repair did not improve (${repairedViolations.length} violation(s)), keeping original`);
      }
    } catch (err) {
      console.warn('[itinerary-repair] repair pass failed, keeping original attempt:', err);
      break;
    }
  }

  if (bestViolations.length > 0) {
    console.warn(`[itinerary-repair] returning itinerary with ${bestViolations.length} unresolved violation(s)`);
  }
  return { itinerary: best, violations: bestViolations, repairPasses };
}
