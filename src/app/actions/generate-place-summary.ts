'use server'

import { geminiWithFallback } from '@/lib/gemini-with-fallback';

interface ReviewInput {
  author: string;
  rating: number;
  text: string;
}

interface GeneratePlaceSummaryInput {
  name: string;
  type: string | null;
  address: string | null;
  reviews: ReviewInput[];
}

export async function generatePlaceSummary(input: GeneratePlaceSummaryInput): Promise<string> {
  if (!process.env.GEMINI_API_KEY) return '';

  const reviewBlock = input.reviews.length
    ? input.reviews
        .map((r) => `- ${r.author} (${r.rating}/5): "${r.text}"`)
        .join('\n')
    : 'No reviews available.';

  const prompt = `You are a travel guide writer. Write a concise 1-2 sentence description of the following place for a traveler. Be informative and engaging. Do not start with the place name. Do not use phrases like "This place" or "This establishment".

Place: ${input.name}
Type: ${input.type?.replace(/_/g, ' ') ?? 'unknown'}
Address: ${input.address ?? 'unknown'}
Reviews:
${reviewBlock}

Write only the description, nothing else.`;

  const text = await geminiWithFallback(process.env.GEMINI_API_KEY, prompt);
  return text.trim();
}
