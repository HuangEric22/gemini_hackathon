// src/services/googlePlacesService.ts
const API_KEY = process.env.GOOGLE_MAPS_KEY;

export const fetchGooglePlaces = async (
  query: string, 
  category: string, 
  lat?: number, 
  lng?: number
) => {
  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  
  // Map your internal categories to Google types
  const typeMap: Record<string, string> = {
    visit: 'tourist_attraction',
    food: 'restaurant',
    stay: 'hotel'
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.location,places.photos'
    },
    body: JSON.stringify({
      textQuery: `${query} best ${typeMap[category] || 'places'}`,
      maxResultCount: 10,
      locationBias: lat && lng ? {
        circle: { center: { latitude: lat, longitude: lng }, radius: 5000.0 }
      } : undefined
    })
  });

  const data = await response.json();
  return data.places || [];
};