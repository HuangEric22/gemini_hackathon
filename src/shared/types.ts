export interface PlaceReview {
  author: string;
  authorPhoto: string | null;
  rating: number;
  text: string;
  relativeTime: string;
}

export interface MapPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: 'attraction' | 'restaurant' | 'event' | 'hotel';
  rating?: number | null;
  address?: string | null;
  imageUrl?: string | null;
  images?: string[];
  type?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  openingHoursText?: string[] | null;
  reviews?: PlaceReview[] | null;
}

export interface Place {
    name: string;
    lat: number;
    lng: number;
    id: string;
    viewport?: google.maps.LatLngBounds | null; 
}   

export interface ItineraryGenerationResponse {
  days: {
    day_number: number;
    brief_description: string;
    items: {
      title: string;
      description?: string;
      start_time: string;
      end_time: string;
      type: string;
      commute_info?: string;
    }[];
  }[];
}