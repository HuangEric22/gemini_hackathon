import { GoogleGenAI } from '@google/genai';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { name, type, address, reviews } = await req.json();

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const reviewBlock = reviews?.length
      ? reviews.slice(0, 3).map((r: any) => `${r.author} (${r.rating}/5): "${r.text}"`).join(' | ')
      : '';

    const prompt = `Write 1-2 sentences about ${name}${type ? ` (${type.replace(/_/g, ' ')})` : ''}${address ? ` at ${address}` : ''} for a traveler. Be specific and engaging. Don't start with the place name.${reviewBlock ? ` Context from reviews: ${reviewBlock}` : ''} Only write the description.`;

    const stream = await ai.models.generateContentStream({
      model: 'gemini-3.1-flash-lite-preview',
      contents: prompt,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    console.error('[generate-place-summary] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
