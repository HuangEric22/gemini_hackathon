'use server'

import { geminiWithFallback } from '@/lib/gemini-with-fallback';

interface ReviewInput {
  author: string;
  rating: number;
  text: string;
}

export async function getTopMenuItems(input: {
  name: string;
  reviews: ReviewInput[];
}): Promise<string[]> {
  if (!input.reviews.length || !process.env.GEMINI_API_KEY) return [];

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

  const text = await geminiWithFallback(process.env.GEMINI_API_KEY, prompt);
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]) as string[];
  } catch {
    return [];
  }
}
