/**
 * Phase-1 planning loop for itinerary generation.
 *
 * Runs a multi-turn Gemini conversation with function calling enabled.
 * Gemini can invoke tools (travel time, visit duration, weather) to gather
 * real data before we run Phase 2 (structured JSON generation).
 *
 * Returns a plain-text "planning notes" string that gets injected into
 * the Phase-2 prompt to produce a better itinerary.
 */

import { GoogleGenAI } from '@google/genai';
import type { FunctionDeclaration } from '@google/genai';
import type { OpeningPeriod } from '@/db/schema';
import { PLANNING_TOOL_DECLARATIONS, executePlanningTool, formatOpeningHours } from './trip-planning-tools';

// Models to try in order (no structured output here, so all are valid)
const PLANNING_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

const MAX_TOOL_ROUNDS = 6; // prevent infinite loops

interface ActivitySummary {
  name: string;
  lat: number;
  lng: number;
  category?: string | null;
  openingHours?: OpeningPeriod[] | null;
}

const HIKE_KEYWORDS = /hike|hiking|trail|trek|trekking|walk|waterfall|falls|summit|climb|peak|canyon|gorge/i;

function buildPlanningPrompt(activities: ActivitySummary[], numDays: number): string {
  const hikeActivities = activities.filter(a => HIKE_KEYWORDS.test(a.name));

  const list = activities
    .map(a => {
      const tag = HIKE_KEYWORDS.test(a.name) ? '🥾 HIKE' : (a.category ?? 'activity');
      return `- ${a.name} [${tag}] at [${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}]`;
    })
    .join('\n');

  const hikeSection = hikeActivities.length > 0
    ? `\nACTIVITIES REQUIRING estimate_hike_duration (MANDATORY tool call for each):
${hikeActivities.map(a => `  • ${a.name}`).join('\n')}\n`
    : '';

  const hoursLines = activities
    .filter(a => a.openingHours?.length)
    .map(a => `  ${a.name}: ${formatOpeningHours(a.openingHours!)}`);
  const hoursSection = hoursLines.length > 0
    ? `\nOpening Hours:\n${hoursLines.join('\n')}\n`
    : '';

  const hotel = activities.find(a => a.category === 'hotel');
  const hotelSection = hotel
    ? `\nHome Base / Hotel: "${hotel.name}" — each day starts and ends here.\n`
    : '';

  return `You are a travel planning expert. A user has selected the following activities for a ${numDays}-day trip:

${list}
${hotelSection}${hoursSection}${hikeSection}
IMPORTANT TOOL RULES — follow these exactly:
- For every activity marked [🥾 HIKE]: you MUST call estimate_hike_duration. Do NOT estimate hike time from your own knowledge. Use your knowledge of the trail to provide distance_km and elevation_gain_m.
- For non-hiking activities with non-obvious visit lengths: call estimate_visit_duration.
- Call get_weather_forecast for the destination.
- Call get_travel_time only for activity pairs that are geographically far apart.
- Call find_nearby_restaurants for each day where no restaurant was selected by the user, to suggest a real meal option near that day's activities.

After all tool calls, write "Planning Notes" summarizing:
- Weather highlights and which days suit outdoor vs indoor activities
- Exact hike durations from the tool results (cite the numbers)
- Visit time recommendations for other activities
- Geographic clustering advice
- Any opening hours constraints worth flagging (e.g. closed on certain days, limited hours)

Do not write the actual itinerary. Do not skip tool calls — always call estimate_hike_duration for hikes.`;
}

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; message?: string };
  if (e.status === 503 || e.status === 429) return true;
  const msg = e.message ?? '';
  return msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('high demand');
}

export async function runPlanningPhase(
  activities: ActivitySummary[],
  numDays: number,
  apiKey: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const systemPrompt = buildPlanningPrompt(activities, numDays);

  const config = {
    tools: [{ functionDeclarations: PLANNING_TOOL_DECLARATIONS as unknown as FunctionDeclaration[] }],
  };

  let lastError: unknown;

  for (const model of PLANNING_MODELS) {
    // Reset conversation history for each model attempt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contents: any[] = [
      { role: 'user', parts: [{ text: systemPrompt }] },
    ];

    try {
      console.log(`  [Phase 1] Trying model: ${model}`);
      let planningNotes = '';

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        console.log(`  [Phase 1] Round ${round + 1}/${MAX_TOOL_ROUNDS} — sending to Gemini...`);
        const response = await ai.models.generateContent({ model, contents, config });

        const candidate = response.candidates?.[0];
        if (!candidate?.content) {
          console.log('  [Phase 1] No content in response, stopping.');
          break;
        }

        // Push the full model Content object directly (matches the docs pattern)
        contents.push(candidate.content);

        // Extract any text the model produced
        const modelParts = candidate.content.parts ?? [];
        const textParts = modelParts
          .filter((p: { text?: string }) => typeof p.text === 'string')
          .map((p: { text?: string }) => p.text!)
          .join('');
        if (textParts) planningNotes += textParts;

        // Check for function calls
        const functionCalls = response.functionCalls ?? [];
        if (functionCalls.length === 0) {
          console.log('  [Phase 1] No tool calls — Gemini is done.');
          break;
        }

        console.log(`  [Phase 1] Gemini requested ${functionCalls.length} tool call(s):`);

        // Execute each tool and collect results, preserving the call `id` so
        // Gemini can match each response to its corresponding call
        const resultParts = [];
        for (const call of functionCalls) {
          console.log(`    → ${call.name}(`, JSON.stringify(call.args), ')');
          const result = await executePlanningTool(
            call.name ?? '',
            (call.args ?? {}) as Record<string, unknown>,
          );
          console.log(`    ← ${call.name} result:`, JSON.stringify(result, null, 2));
          resultParts.push({
            functionResponse: {
              name: call.name,
              id: call.id,      // required: links the response to the specific call
              response: result,
            },
          });
        }

        // Send tool results back to the model
        contents.push({ role: 'user', parts: resultParts });
      }

      return planningNotes.trim() || '[No planning notes generated]';
    } catch (err) {
      if (isRateLimitError(err)) {
        lastError = err;
        continue; // try next model
      }
      // Non-rate-limit error — log and return empty notes (don't block itinerary generation)
      console.error('[PlanningPhase] Error:', err);
      return '';
    }
  }

  console.warn('[PlanningPhase] All models rate-limited:', lastError);
  return ''; // Return empty rather than failing the whole itinerary
}
