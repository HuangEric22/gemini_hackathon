import { GoogleGenAI } from '@google/genai';
import type { ItineraryGenerationResponse, TravelMatrix } from '@/shared';
import { auth } from '@clerk/nextjs/server';
import type { OpeningPeriod } from '@/db/schema';
import { runPlanningPhase } from '@/lib/gemini-planning-phase';
import { itineraryGenerationResponseSchema } from '@/lib/llm-output-schemas';
import { parseLlmJson } from '@/lib/parse-llm-json';
import { formatOpeningHours } from '@/lib/trip-planning-tools';
import { computeRouteMatrixAction } from '@/app/actions/compute-route-matrix';

const MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
];

// ─── Types (mirrors GenerateItineraryInput in the server action) ──────────────

interface ActivityPick {
  name: string;
  lat: number;
  lng: number;
  category?: string | null;
  googlePlaceId?: string | null;
  openingHours?: OpeningPeriod[] | null;
  averageDuration?: number | null;
}

interface GenerateItineraryInput {
  activities: ActivityPick[];
  numDays: number;
  transportMode?: string;
  currentItinerary?: ItineraryGenerationResponse | null;
  preference?: string;
  dayAssignments?: Record<string, string[]>;
  pace?: 'relaxed' | 'moderate' | 'packed';
  budget?: 'budget' | 'moderate' | 'luxury';
  startTime?: string;
}

// ─── Prompt builder (mirrors generate-itinerary.ts) ──────────────────────────

function buildTravelMatrixBlock(matrix: TravelMatrix, mode: string): string {
  const lines: string[] = [];
  for (const origin of Object.keys(matrix)) {
    for (const dest of Object.keys(matrix[origin])) {
      if (origin === dest) continue;
      lines.push(`  ${origin} → ${dest}: ${matrix[origin][dest].duration}`);
    }
  }
  if (lines.length === 0) return '';
  const modeLabel = mode === 'TRANSIT' ? 'public transit' : mode === 'WALK' ? 'walking' : 'driving';
  return `\nTravel Times Between Activities (real data via Google Maps, by ${modeLabel}):\n${lines.join('\n')}\n`;
}

function buildDayAssignmentsBlock(assignments: Record<string, string[]>): string {
  const lines: string[] = [];
  for (const [key, names] of Object.entries(assignments)) {
    if (names.length === 0) continue;
    if (key === 'unassigned') {
      lines.push(`- Unassigned (place wherever fits best): ${names.join(', ')}`);
    } else {
      lines.push(`- Day ${key.replace('day-', '')}: ${names.join(', ')}`);
    }
  }
  if (lines.length === 0) return '';
  return `\nUser Day Preferences (respect these assignments):\n${lines.join('\n')}\n`;
}

function buildPrompt(input: GenerateItineraryInput, travelMatrix: TravelMatrix, planningNotes?: string): string {
  const activitiesJson = JSON.stringify(
    input.activities.map(a => ({
      name: a.name,
      lat: a.lat,
      lng: a.lng,
      ...(a.category ? { category: a.category } : {}),
      ...(a.averageDuration ? { typical_visit_min: a.averageDuration } : {}),
    })),
    null, 2,
  );

  const modeLabel = input.transportMode === 'TRANSIT' ? 'public transit' : input.transportMode === 'WALK' ? 'walking' : 'driving';
  const matrixBlock = Object.keys(travelMatrix).length > 0 ? buildTravelMatrixBlock(travelMatrix, input.transportMode ?? 'DRIVE') : '';
  const currentBlock = input.currentItinerary ? `\nCurrent Itinerary (refine based on user feedback):\n${JSON.stringify(input.currentItinerary, null, 2)}\n` : '';
  const preferenceBlock = input.preference ? `\nUser Feedback: "${input.preference}"\n` : '';
  const dayAssignmentsBlock = input.dayAssignments ? buildDayAssignmentsBlock(input.dayAssignments) : '';

  const hoursLines = input.activities.filter(a => a.openingHours?.length).map(a => `  ${a.name}: ${formatOpeningHours(a.openingHours!)}`);
  const hoursBlock = hoursLines.length > 0 ? `\nOpening Hours (do NOT schedule outside these windows):\n${hoursLines.join('\n')}\n` : '';

  const hotel = input.activities.find(a => a.category === 'hotel');
  const hotelBlock = hotel ? `\nHome Base / Hotel: "${hotel.name}" at [${hotel.lat.toFixed(4)}, ${hotel.lng.toFixed(4)}]\nStart and end every day from this hotel. Add a short commute item at the beginning of each day (hotel → first activity) and at the end (last activity → hotel). Do not list the hotel as a standalone activity — only as a commute anchor.\n` : '';

  const paceDesc = { relaxed: '2–3 activities per day; generous meal breaks; no back-to-back rushing', moderate: '3–4 activities per day; balanced pace with comfortable transitions', packed: '5+ activities per day; tight schedule; maximize sightseeing' };
  const budgetDesc = { budget: 'prefer free or inexpensive options for AI-suggested gap-fillers (parks, street food, free museums)', moderate: 'mix of free and paid options for suggestions; mid-range restaurants', luxury: 'prioritize premium experiences for suggestions; upscale restaurants and venues' };
  const paceBlock = input.pace ? `\nPace: ${input.pace} — ${paceDesc[input.pace]}\n` : '';
  const budgetBlock = input.budget ? `\nBudget: ${input.budget} — ${budgetDesc[input.budget]}\n` : '';
  const startTimeBlock = input.startTime ? `\nDay Start Time: ${input.startTime} — schedule the first activity of each day at or after this time.\n` : '';

  return `Role: Expert Travel Planner
Task: Create a detailed, logical itinerary for EXACTLY ${input.numDays} day(s). You MUST output exactly ${input.numDays} day objects (day_number 1 through ${input.numDays}).

User-Selected Activities:
${activitiesJson}
${matrixBlock}${hotelBlock}${hoursBlock}${paceBlock}${budgetBlock}${startTimeBlock}${dayAssignmentsBlock}${currentBlock}${preferenceBlock}${planningNotes ? `\nPre-Trip Planning Notes (gathered via real data — use these to inform scheduling):\n${planningNotes}\n` : ''}
Transport Mode: The traveler prefers ${modeLabel}.

Requirements:
1. ${matrixBlock ? 'Use the PROVIDED travel times between activities. Do not estimate.' : 'Estimate reasonable travel times between activities based on their coordinates.'}
2. Follow a natural daily flow: Breakfast → Morning Activity → Lunch → Afternoon Activity → Dinner. Respect the Pace setting above when deciding how many activities to include per day.
3. Group nearby activities on the same day to minimize travel time.
4. Include "commute" type items between activities showing the travel time.
5. Set commute_info to a short human-readable string like "12 min drive" or "8 min walk".
6. Set commute_seconds to the travel duration in seconds.
7. Ensure realistic time slots — activities should not overlap and should include buffer time. If an activity has a typical_visit_min field, use that as the duration instead of estimating.
8. ${input.currentItinerary ? 'Respect the existing itinerary structure but apply the user feedback.' : 'Create a fresh itinerary.'}
9. IMPORTANT: For user-selected activities, use the EXACT activity names provided — do not rename or paraphrase them. Set is_suggested to false for these. Copy the lat and lng from the provided coordinates.
10. If there are time gaps of 1.5 hours or more between user activities (excluding commute), suggest a popular nearby attraction, cafe, or activity to fill the gap. Set is_suggested to true for these AI-suggested items. Include a short description and realistic lat/lng coordinates for each suggestion.
11. CRITICAL: Spread activities evenly across all ${input.numDays} days. Each day should have a full schedule (morning through evening). If there are fewer user-selected activities than days, fill the extra days with AI-suggested activities and meals.
12. GEOGRAPHIC CLUSTERING: If an activity is geographically far from the rest (>30 min travel), dedicate a separate half-day or full day to that area. Group nearby activities together on the same day.
13. CONFLICT RESOLUTION: If the user selected multiple restaurants for the same meal slot (e.g., 3 dinner restaurants), pick the ONE that best fits the day's geographic cluster. Mark the remaining alternatives with is_suggested=true and type="alternative" so the user can swap them in. Add a description explaining the choice.
14. MEAL BALANCE: Each day should have at most 1 breakfast, 1 lunch, and 1 dinner from the user's selections. If the user selected more restaurants than meal slots allow, distribute them across days or mark extras as alternatives.
15. HIKE DURATIONS: If the Planning Notes contain a scheduling_instruction for a hike, you MUST follow it exactly. The start_time and end_time for that activity must be exactly the specified number of minutes apart. Never shorten a hike to fit — instead remove or reschedule other activities around it. Hikes that start at a trailhead should have a short commute item before them (the drive to the trailhead), but the hike block itself must use the full calculated duration.
16. OPENING HOURS: Only schedule user-selected activities within their listed opening hours. Never schedule a venue before it opens or after it closes. If a venue is closed on a particular day, move it to a day when it is open. If no opening hours are provided for an activity, use common sense defaults.${dayAssignmentsBlock ? '\n17. DAY ASSIGNMENTS: Place activities on their user-specified day. Place unassigned activities wherever they fit best geographically and temporally.' : ''}`;
}

// ─── Schema (mirrors generate-itinerary.ts) ───────────────────────────────────

const ITINERARY_SCHEMA = {
  type: 'object' as const,
  properties: {
    days: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          day_number:        { type: 'integer' as const },
          brief_description: { type: 'string' as const },
          items: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                title:           { type: 'string' as const },
                description:     { type: 'string' as const },
                start_time:      { type: 'string' as const },
                end_time:        { type: 'string' as const },
                type:            { type: 'string' as const },
                commute_info:    { type: 'string' as const },
                commute_seconds: { type: 'integer' as const },
                is_suggested:    { type: 'boolean' as const },
                lat:             { type: 'number' as const },
                lng:             { type: 'number' as const },
              },
              required: ['title', 'start_time', 'end_time', 'type', 'is_suggested', 'lat', 'lng'],
            },
          },
        },
        required: ['day_number', 'brief_description', 'items'],
      },
    },
  },
  required: ['days'],
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response('GEMINI_API_KEY not set', { status: 500 });

  const input: GenerateItineraryInput = await request.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      try {
        const ai = new GoogleGenAI({ apiKey });
        const mode = (input.transportMode ?? 'DRIVE') as 'DRIVE' | 'TRANSIT' | 'WALK';

        // Phase 1 — planning + travel matrix in parallel
        emit({ type: 'progress', phase: 'planning', message: 'Analyzing your activities...' });

        const [planningNotes, travelMatrix] = await Promise.all([
          runPlanningPhase(input.activities, input.numDays, apiKey),
          computeRouteMatrixAction(
            input.activities.map(a => ({ name: a.name, lat: a.lat, lng: a.lng })),
            mode,
          ).catch(() => ({} as TravelMatrix)),
        ]);

        emit({ type: 'progress', phase: 'generating', message: 'Building your itinerary...' });

        // Phase 2 — structured output
        const prompt = buildPrompt(input, travelMatrix, planningNotes || undefined);

        let itinerary: ItineraryGenerationResponse | null = null;
        let lastModelError: unknown;
        for (const model of MODELS) {
          try {
            console.log(`[Phase 2] Trying model: ${model}`);
            const response = await ai.models.generateContent({
              model,
              contents: prompt,
              config: { responseMimeType: 'application/json', responseSchema: ITINERARY_SCHEMA },
            });
            itinerary = parseLlmJson(response.text, model, itineraryGenerationResponseSchema);
            console.log(`[Phase 2] Success with model: ${model}`);
            break;
          } catch (err) {
            lastModelError = err;
            console.warn(`[Phase 2] Model ${model} failed:`, err);
            continue;
          }
        }

        if (!itinerary) {
          throw new Error(`All models failed. Last error: ${String(lastModelError)}`);
        }

        emit({ type: 'complete', data: itinerary });
      } catch (err) {
        emit({ type: 'error', message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  });
}
