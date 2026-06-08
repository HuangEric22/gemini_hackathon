import { GoogleGenAI } from '@google/genai';
import type { ItineraryGenerationResponse, TravelMatrix } from '@/shared';
import { computeRouteMatrixAction } from '@/app/actions/compute-route-matrix';
import { runPlanningPhase } from '@/lib/gemini-planning-phase';
import { isRetryableLlmError } from '@/lib/llm-errors';
import { itineraryGenerationResponseSchema } from '@/lib/llm-output-schemas';
import { isLlmJsonResponseError, parseLlmJson } from '@/lib/parse-llm-json';
import { buildItineraryPrompt } from './prompt';
import { repairItineraryStructure } from './repair';
import { ITINERARY_SCHEMA } from './output-schema';
import { validateItinerary } from './validate';
import type { GenerateItineraryInput, ItineraryProgressCallback } from './types';

const MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
];

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Tries structured-output models in order and falls back on transient or JSON issues.
async function tryAllModels(
  ai: InstanceType<typeof GoogleGenAI>,
  prompt: string,
): Promise<ItineraryGenerationResponse> {
  let lastError: unknown;

  for (const model of MODELS) {
    try {
      console.log(`[ItineraryWorkflow] Trying model: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: ITINERARY_SCHEMA,
        },
      });

      return parseLlmJson(response.text, model, itineraryGenerationResponseSchema);
    } catch (err) {
      if (isRetryableLlmError(err) || isLlmJsonResponseError(err)) {
        lastError = err;
        console.warn(`[ItineraryWorkflow] Model ${model} failed, trying next:`, err);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

// Collects tool-backed planning notes and route data before final generation.
async function gatherItineraryContext(input: GenerateItineraryInput, apiKey: string): Promise<{
  planningNotes: string;
  travelMatrix: TravelMatrix;
}> {
  const mode = (input.transportMode ?? 'DRIVE') as 'DRIVE' | 'TRANSIT' | 'WALK';

  console.log('\n━━━ [Phase 1] Planning phase + travel matrix starting in parallel ━━━');
  console.log(`  Activities (${input.activities.length}):`, input.activities.map(a => a.name).join(', '));
  console.log(`  Days: ${input.numDays}`);

  const t0 = Date.now();
  const [planningNotes, travelMatrix] = await Promise.all([
    runPlanningPhase(input.activities, input.numDays, apiKey),
    computeRouteMatrixAction(
      input.activities.map(a => ({ name: a.name, lat: a.lat, lng: a.lng })),
      mode,
    ).catch(err => {
      console.warn('[ItineraryWorkflow] Travel matrix failed, AI will estimate:', err);
      return {} as TravelMatrix;
    }),
  ]);

  console.log(`  Parallel phase done in ${Date.now() - t0}ms`);
  if (planningNotes) {
    console.log('\n━━━ [Phase 1] Planning notes ━━━\n', planningNotes);
  } else {
    console.log('[Phase 1] No planning notes returned (rate-limited or skipped)');
  }

  return { planningNotes, travelMatrix };
}

// Runs the full server-side itinerary generation pipeline.
export async function generateItineraryWorkflow(
  input: GenerateItineraryInput,
  options: {
    apiKey: string;
    onProgress?: ItineraryProgressCallback;
  },
): Promise<ItineraryGenerationResponse> {
  const ai = new GoogleGenAI({ apiKey: options.apiKey });

  options.onProgress?.({ phase: 'planning', message: 'Analyzing your activities...' });
  const { planningNotes, travelMatrix } = await gatherItineraryContext(input, options.apiKey);

  options.onProgress?.({ phase: 'generating', message: 'Building your itinerary...' });
  const prompt = buildItineraryPrompt(input, travelMatrix, planningNotes || undefined);
  console.log('[Phase 2] Prompt length:', prompt.length, 'chars | Planning notes injected:', !!planningNotes);

  let draft: ItineraryGenerationResponse | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      draft = await tryAllModels(ai, prompt);
      break;
    } catch (err) {
      if (attempt < MAX_RETRIES && isRetryableLlmError(err)) {
        console.warn(`[ItineraryWorkflow] All models busy, retrying in ${RETRY_DELAY_MS}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await wait(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }

  if (!draft) {
    throw new Error('All Gemini models are currently unavailable. Please try again shortly.');
  }

  options.onProgress?.({ phase: 'validating', message: 'Checking itinerary details...' });
  const issues = validateItinerary(draft, input);
  if (issues.length === 0) return draft;

  options.onProgress?.({ phase: 'repairing', message: 'Cleaning up itinerary structure...' });
  console.warn('[ItineraryWorkflow] Validation issues:', issues);
  const repaired = repairItineraryStructure(draft, input);
  const remainingIssues = validateItinerary(repaired, input);
  if (remainingIssues.length > 0) {
    console.warn('[ItineraryWorkflow] Remaining validation issues after repair:', remainingIssues);
  }

  return repaired;
}

export type { GenerateItineraryInput } from './types';
