import { GoogleGenAI } from "@google/genai";
import { Place, Category } from "../types";

// Initialize Gemini Client
// IMPORTANT: process.env.API_KEY is automatically injected.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const searchPlacesWithGemini = async (
  destination: string,
  category: Category,
  interests: string,
  budget: string
): Promise<Omit<Place, 'id' | 'imageUrl'>[]> => {
  
  // Maps grounding requires gemini-2.5-flash
  const modelId = "gemini-2.5-flash";
  
  let categoryPrompt = "";
  switch (category) {
    case 'food':
      categoryPrompt = "restaurants, cafes, or street food stalls";
      break;
    case 'visit':
      categoryPrompt = "tourist attractions, museums, parks, or hidden gems";
      break;
    case 'stay':
      categoryPrompt = "hotels, hostels, or boutique accommodations";
      break;
  }

  // Since we cannot use responseSchema with tools, we must be very explicit in the prompt
  // about the JSON structure we expect.
  const prompt = `
    Using the Google Maps tool, find top 4 ${categoryPrompt} in ${destination}.
    Interests: ${interests || "general popular spots"}.
    Budget level: ${budget || "moderate"}.
    
    CRITICAL: You must return the results as a STRICT JSON array. 
    Do not use Markdown formatting. Do not include "\`\`\`json" at the start.
    
    Each object in the array must match this structure exactly:
    {
      "name": "Exact Name from Google Maps",
      "description": "A short, catchy description (max 20 words)",
      "rating": 4.5,
      "location": "Address or neighborhood",
      "priceLevel": "$, $$, or $$$",
      "category": "${category}",
      "googleMapsUri": "The URL to the place on Google Maps"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        // Enable Google Maps Grounding
        tools: [{ googleMaps: {} }],
        // responseSchema and responseMimeType are NOT allowed when using tools
      }
    });

    let jsonText = response.text || "[]";
    
    // Cleanup markdown if the model includes it despite instructions
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();

    // Attempt to parse
    try {
      const data = JSON.parse(jsonText);
      
      if (!Array.isArray(data)) {
        console.warn("Gemini did not return an array:", data);
        return [];
      }

      // Map and validate
      return data.map((item: any) => ({
          name: item.name || "Unknown Place",
          description: item.description || "No description available.",
          rating: Number(item.rating) || 0,
          location: item.location || "",
          priceLevel: item.priceLevel || "$$",
          category: category,
          googleMapsUri: item.googleMapsUri
      }));

    } catch (parseError) {
      console.error("Failed to parse Gemini JSON response:", jsonText);
      return [];
    }

  } catch (error) {
    console.error("Error fetching from Gemini:", error);
    throw error;
  }
};