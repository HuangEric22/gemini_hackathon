'use server'

import { GoogleGenAI } from "@google/genai";

// Returns a short list of cities a traveler visiting `currentCity` might also enjoy.
export async function getRecommendedCities(currentCity: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: `A traveler is visiting ${currentCity}. Suggest 5 other cities or destinations they might also enjoy visiting nearby or in the same region. Return ONLY a JSON array of city names, no explanation. Example format: ["Lyon", "Nice", "Bordeaux", "Strasbourg", "Marseille"]`,
    });

    const text = response.text ?? "";
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) return JSON.parse(match[0]) as string[];
  } catch (err) {
    console.error("Gemini recommendation error:", err);
  }

  return [];
}
