export type Category = 'food' | 'visit' | 'stay';

export interface Place {
  id: string; // Generated on client side for list management
  name: string;
  description: string;
  rating: number;
  location: string;
  priceLevel: string; // e.g., "$", "$$", "$$$"
  category: Category;
  imageUrl?: string;
  googleMapsUri?: string;
}

export interface ItineraryItem extends Place {
  notes?: string;
  time?: string;
}

export interface SearchParams {
  destination: string;
  interests: string;
  budget: string;
  lat?: number;
  lng?: number;
}