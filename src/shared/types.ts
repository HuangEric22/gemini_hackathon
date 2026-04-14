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
    imageUrl?: string;
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
      commute_seconds?: number;
      is_suggested?: boolean;
      lat?: number;
      lng?: number;
    }[];
  }[];
}

// Transport types for the transport comparison UI
export interface TransportOption {
  mode: 'walking' | 'transit' | 'driving';
  duration: string;       // e.g. "12 min"
  durationSeconds: number;
  distance: string;       // e.g. "1.2 km"
  encodedPolyline?: string; // encoded polyline from Routes API
}

export interface LegTransport {
  originTitle: string;
  destinationTitle: string;
  walking?: TransportOption;
  transit?: TransportOption;
  driving?: TransportOption;
}

// Itinerary marker for the map (user-chosen vs AI-suggested)
export interface ItineraryMapMarker {
  id: string;
  title: string;
  lat: number;
  lng: number;
  isSuggested: boolean;
  dayNumber: number;
  order: number; // position within the day for numbering
}

// Travel matrix passed to the generation server action
export interface TravelMatrix {
  [originName: string]: {
    [destName: string]: { duration: string; seconds: number };
  };
}