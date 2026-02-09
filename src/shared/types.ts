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