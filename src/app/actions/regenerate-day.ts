'use server'

import { GoogleGenAI } from '@google/genai';
import type { ItineraryGenerationResponse } from '@/shared';
import type { OpeningPeriod } from '@/db/schema';
import { formatOpeningHours } from '@/lib/trip-planning-tools';

// Re-use the same fast-model list for single-day regeneration
const REGEN_MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
];

interface RegenerateDayInput {
  currentItinerary: ItineraryGenerationResponse;
  dayNumber: number;
  activities: Array<{
    name: string;
    lat: number;
    lng: number;
    category?: string | null;
    openingHours?: OpeningPeriod[] | null;
    averageDuration?: number | null;
  }>;
  pace?: 'relaxed' | 'moderate' | 'packed';
  budget?: 'budget' | 'moderate' | 'luxury';
  startTime?: string;
  transportMode?: string;
  preference?: string;
}

const DAY_SCHEMA = {
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
};

function buildDayPrompt(input: RegenerateDayInput): string {
  const day = input.currentItinerary.days.find(d => d.day_number === input.dayNumber);
  if (!day) throw new Error(`Day ${input.dayNumber} not found in itinerary`);

  const prevDay = input.currentItinerary.days.find(d => d.day_number === input.dayNumber - 1);
  const nextDay = input.currentItinerary.days.find(d => d.day_number === input.dayNumber + 1);

  // Activities already assigned to other days — don't duplicate them
  const otherDayItems = input.currentItinerary.days
    .filter(d => d.day_number !== input.dayNumber)
    .flatMap(d => d.items.filter(i => !i.is_suggested && i.type !== 'commute').map(i => i.title));

  const availableActivities = input.activities.filter(a => !otherDayItems.includes(a.name));

  const modeLabel =
    input.transportMode === 'TRANSIT' ? 'public transit' :
    input.transportMode === 'WALK' ? 'walking' : 'driving';

  const hoursLines = availableActivities
    .filter(a => a.openingHours?.length)
    .map(a => `  ${a.name}: ${formatOpeningHours(a.openingHours!)}`);

  const paceDesc: Record<string, string> = {
    relaxed: '2–3 activities; generous breaks',
    moderate: '3–4 activities; comfortable pace',
    packed: '5+ activities; tight schedule',
  };

  return `You are a travel planner regenerating a single day of an existing itinerary.

Current Day ${input.dayNumber} schedule (replace this entirely):
${JSON.stringify(day, null, 2)}

${prevDay ? `Previous day (Day ${input.dayNumber - 1}) ends with: "${prevDay.items.at(-1)?.title}" — avoid duplicating it.` : ''}
${nextDay ? `Next day (Day ${input.dayNumber + 1}) starts with: "${nextDay.items[0]?.title}" — avoid duplicating it.` : ''}

Available activities for this day (not used on other days):
${availableActivities.map(a => `- ${a.name} [${a.category ?? 'activity'}]${a.averageDuration ? ` (~${a.averageDuration} min)` : ''}`).join('\n')}

${hoursLines.length > 0 ? `Opening Hours:\n${hoursLines.join('\n')}\n` : ''}
Transport: ${modeLabel}
${input.pace ? `Pace: ${input.pace} — ${paceDesc[input.pace]}` : ''}
${input.budget ? `Budget: ${input.budget}` : ''}
${input.startTime ? `Day starts at: ${input.startTime}` : ''}
${input.preference ? `User request: "${input.preference}"` : ''}

Requirements:
1. Return ONLY day ${input.dayNumber} — do not include other days.
2. Keep day_number as ${input.dayNumber}.
3. Use EXACT names from the available activities list — do not rename them.
4. Include commute items between activities.
5. Fill meal gaps with AI-suggested restaurants (is_suggested: true).
6. Respect opening hours — do not schedule venues outside their hours.
7. Do not include activities already used on other days.`;
}

export async function regenerateDayAction(
  input: RegenerateDayInput,
): Promise<ItineraryGenerationResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildDayPrompt(input);

  console.log(`\n━━━ [RegenDay] Regenerating day ${input.dayNumber} ━━━`);

  let lastError: unknown;
  for (const model of REGEN_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: DAY_SCHEMA,
        },
      });

      const text = response.text ?? '';
      const newDay = JSON.parse(text) as ItineraryGenerationResponse['days'][0];

      console.log(`[RegenDay] Day ${input.dayNumber} regenerated with ${newDay.items.length} items`);

      // Splice the new day back into the full itinerary
      return {
        days: input.currentItinerary.days.map(d =>
          d.day_number === input.dayNumber ? newDay : d
        ),
      };
    } catch (err) {
      lastError = err;
      console.warn(`[RegenDay] Model ${model} failed:`, err);
    }
  }

  throw lastError;
}
