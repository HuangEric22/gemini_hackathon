'use server'

import { GoogleGenAI } from '@google/genai';

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
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const reviewBlock = input.reviews.length
    ? input.reviews
        .map((r) => `- ${r.author} (${r.rating}/5): "${r.text}"`)
        .join('\n')
    : 'No reviews available.';

  const prompt = `You are a travel guide writer. Write a concise 2-3 sentence description of the following place for a traveler. Be informative and engaging. Do not start with the place name. Do not use phrases like "This place" or "This establishment".

Place: ${input.name}
Type: ${input.type?.replace(/_/g, ' ') ?? 'unknown'}
Address: ${input.address ?? 'unknown'}
Reviews:
${reviewBlock}

Write only the description, nothing else.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: prompt,
  });

  return response.text?.trim() ?? '';
}
