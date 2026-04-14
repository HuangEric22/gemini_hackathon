'use server'

import { GoogleGenAI } from '@google/genai';
import type { ItineraryGenerationResponse, TravelMatrix } from '@/shared';

const MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
];

interface ActivityPick {
  name: string;
  lat: number;
  lng: number;
  category?: string | null;
  googlePlaceId?: string | null;
}

interface GenerateItineraryInput {
  activities: ActivityPick[];
  numDays: number;
  travelMatrix?: TravelMatrix;
  transportMode?: string;          // 'DRIVE' | 'TRANSIT' | 'WALK'
  currentItinerary?: ItineraryGenerationResponse | null;
  preference?: string;
  dayAssignments?: Record<string, string[]>;  // { "day-1": ["Activity A"], "unassigned": ["Activity B"] }
}

function buildTravelMatrixBlock(matrix: TravelMatrix, mode: string): string {
  const lines: string[] = [];
  for (const origin of Object.keys(matrix)) {
    for (const dest of Object.keys(matrix[origin])) {
      if (origin === dest) continue;
      const entry = matrix[origin][dest];
      lines.push(`  ${origin} → ${dest}: ${entry.duration}`);
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
      const dayNum = key.replace('day-', '');
      lines.push(`- Day ${dayNum}: ${names.join(', ')}`);
    }
  }
  if (lines.length === 0) return '';
  return `\nUser Day Preferences (respect these assignments):\n${lines.join('\n')}\n`;
}

function buildPrompt(input: GenerateItineraryInput): string {
  const activitiesJson = JSON.stringify(
    input.activities.map(a => ({
      name: a.name,
      lat: a.lat,
      lng: a.lng,
      ...(a.category ? { category: a.category } : {}),
    })),
    null,
    2,
  );

  const modeLabel =
    input.transportMode === 'TRANSIT' ? 'public transit' :
    input.transportMode === 'WALK' ? 'walking' : 'driving';

  const matrixBlock = input.travelMatrix
    ? buildTravelMatrixBlock(input.travelMatrix, input.transportMode ?? 'DRIVE')
    : '';

  const currentBlock = input.currentItinerary
    ? `\nCurrent Itinerary (refine based on user feedback):\n${JSON.stringify(input.currentItinerary, null, 2)}\n`
    : '';

  const preferenceBlock = input.preference
    ? `\nUser Feedback: "${input.preference}"\n`
    : '';

  const dayAssignmentsBlock = input.dayAssignments
    ? buildDayAssignmentsBlock(input.dayAssignments)
    : '';

  return `Role: Expert Travel Planner
Task: Create a detailed, logical itinerary for EXACTLY ${input.numDays} day(s). You MUST output exactly ${input.numDays} day objects (day_number 1 through ${input.numDays}).

User-Selected Activities:
${activitiesJson}
${matrixBlock}${dayAssignmentsBlock}${currentBlock}${preferenceBlock}
Transport Mode: The traveler prefers ${modeLabel}.

Requirements:
1. ${matrixBlock ? 'Use the PROVIDED travel times between activities. Do not estimate.' : 'Estimate reasonable travel times between activities based on their coordinates.'}
2. Follow a natural daily flow: Breakfast → Morning Activity → Lunch → Afternoon Activity → Dinner.
3. Group nearby activities on the same day to minimize travel time.
4. Include "commute" type items between activities showing the travel time.
5. Set commute_info to a short human-readable string like "12 min drive" or "8 min walk".
6. Set commute_seconds to the travel duration in seconds.
7. Ensure realistic time slots — activities should not overlap and should include buffer time.
8. ${input.currentItinerary ? 'Respect the existing itinerary structure but apply the user feedback.' : 'Create a fresh itinerary.'}
9. IMPORTANT: For user-selected activities, use the EXACT activity names provided — do not rename or paraphrase them. Set is_suggested to false for these. Copy the lat and lng from the provided coordinates.
10. If there are time gaps of 1.5 hours or more between user activities (excluding commute), suggest a popular nearby attraction, cafe, or activity to fill the gap. Set is_suggested to true for these AI-suggested items. Include a short description and realistic lat/lng coordinates for each suggestion.
11. CRITICAL: Spread activities evenly across all ${input.numDays} days. Each day should have a full schedule (morning through evening). If there are fewer user-selected activities than days, fill the extra days with AI-suggested activities and meals.
12. GEOGRAPHIC CLUSTERING: If an activity is geographically far from the rest (>30 min travel), dedicate a separate half-day or full day to that area. Group nearby activities together on the same day.
13. CONFLICT RESOLUTION: If the user selected multiple restaurants for the same meal slot (e.g., 3 dinner restaurants), pick the ONE that best fits the day's geographic cluster. Mark the remaining alternatives with is_suggested=true and type="alternative" so the user can swap them in. Add a description explaining the choice.
14. MEAL BALANCE: Each day should have at most 1 breakfast, 1 lunch, and 1 dinner from the user's selections. If the user selected more restaurants than meal slots allow, distribute them across days or mark extras as alternatives.${dayAssignmentsBlock ? '\n15. DAY ASSIGNMENTS: Place activities on their user-specified day. Place unassigned activities wherever they fit best geographically and temporally.' : ''}`;
}

// JSON schema for Gemini structured output
const ITINERARY_SCHEMA = {
  type: 'object' as const,
  properties: {
    days: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          day_number: { type: 'integer' as const },
          brief_description: { type: 'string' as const },
          items: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                title: { type: 'string' as const },
                description: { type: 'string' as const },
                start_time: { type: 'string' as const },
                end_time: { type: 'string' as const },
                type: { type: 'string' as const },
                commute_info: { type: 'string' as const },
                commute_seconds: { type: 'integer' as const },
                is_suggested: { type: 'boolean' as const },
                lat: { type: 'number' as const },
                lng: { type: 'number' as const },
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

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; message?: string };
  if (e.status === 503 || e.status === 429) return true;
  const msg = e.message ?? '';
  return msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('high demand');
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

async function tryAllModels(
  ai: InstanceType<typeof GoogleGenAI>,
  prompt: string,
): Promise<ItineraryGenerationResponse> {
  let lastError: unknown;

  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: ITINERARY_SCHEMA,
        },
      });

      const text = response.text ?? '';
      return JSON.parse(text) as ItineraryGenerationResponse;
    } catch (err) {
      if (isRetryable(err)) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

export async function generateItineraryAction(
  input: GenerateItineraryInput,
): Promise<ItineraryGenerationResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(input);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await tryAllModels(ai, prompt);
    } catch (err) {
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        console.warn(`[generateItinerary] All models busy, retrying in ${RETRY_DELAY_MS}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }

  throw new Error('All Gemini models are currently unavailable. Please try again shortly.');
}
