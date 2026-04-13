import { GoogleGenAI } from '@google/genai';

const MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
];

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; message?: string };
  if (e.status === 503 || e.status === 429) return true;
  const msg = e.message ?? '';
  return msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('high demand');
}

/** Tries each model in order, falling back to the next on rate-limit/503 errors. */
export async function geminiWithFallback(apiKey: string, contents: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  let lastError: unknown;

  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({ model, contents });
      return response.text ?? '';
    } catch (err) {
      if (isRateLimitError(err)) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}
