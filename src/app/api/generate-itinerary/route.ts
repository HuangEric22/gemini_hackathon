import { auth } from '@clerk/nextjs/server';
import { getOptionalGeminiApiKey } from '@/lib/env';
import { generateItineraryWorkflow, type GenerateItineraryInput } from '@/lib/itinerary/workflow';

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const apiKey = getOptionalGeminiApiKey();
  if (!apiKey) return new Response('Missing required environment variable: GEMINI_API_KEY', { status: 500 });

  const input: GenerateItineraryInput = await request.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Sends newline-delimited JSON events that the client can read incrementally.
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      try {
        const itinerary = await generateItineraryWorkflow(input, {
          apiKey,
          onProgress: event => emit({ type: 'progress', ...event }),
        });

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
