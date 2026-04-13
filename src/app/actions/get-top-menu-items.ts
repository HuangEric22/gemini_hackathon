'use server'

import { GoogleGenAI } from '@google/genai';

interface ReviewInput {
  author: string;
  rating: number;
  text: string;
}

export async function getTopMenuItems(input: {
  name: string;
  reviews: ReviewInput[];
}): Promise<string[]> {
  if (!input.reviews.length) return [];

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const reviewBlock = input.reviews
    .map(r => `- ${r.author} (${r.rating}/5): "${r.text}"`)
    .join('\n');

  const prompt = `You are analyzing customer reviews for the restaurant "${input.name}".
Extract the top 4-6 specific menu items, dishes, or drinks that customers mention enjoying.
Only include items explicitly praised — do not invent or guess items not mentioned.
Return ONLY a JSON array of short item names, e.g. ["Tonkotsu Ramen", "Gyoza", "Matcha Latte"].
If no specific items are mentioned, return an empty array [].

Reviews:
${reviewBlock}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: prompt,
  });

  const text = response.text ?? '';
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]) as string[];
  } catch {
    return [];
  }
}
