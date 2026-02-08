export interface Place {
    name: string;
    lat: number;
    lng: number;
    id: string;
    viewport?: google.maps.LatLngBounds | null; 
}   