import { useEffect } from 'react';
import { Search, ChevronRight, MapPin, Star } from 'lucide-react';
import { SearchCard } from '../search/search-card';
import { Place } from '@/shared'
import { usePlacesSearch } from '@/hooks/places-search';

interface DiscoveryProps {
  cityName: string;
  onSearch: (destination: Place) => void;
  isSearching: boolean;
  location: Place | null;
}

export function DiscoveryFeed({ cityName, onSearch, isSearching, location }: DiscoveryProps) {
  const attractions = usePlacesSearch();
  const restaurants = usePlacesSearch();
  const events = usePlacesSearch();
  const numSearchResults = 15;
  
  useEffect(() => {
    if (location) {
      const coords = { lat: location.lat, lng: location.lng };
      attractions.searchNearby(coords, ['tourist_attraction', 'museum', 'park'], numSearchResults, location.viewport);
      restaurants.searchNearby(coords, ['restaurant', 'cafe', 'bakery'], numSearchResults, location.viewport);
      events.searchNearby(coords, ['event_venue', 'movie_theater', 'art_gallery'], numSearchResults, location.viewport);
    }
  }, [location, attractions.isLoaded, restaurants.isLoaded, events.isLoaded, attractions.searchNearby, restaurants.searchNearby, events.searchNearby]);

  return (
    <main className="flex-1 w-full overflow-y-auto h-screen p-10 bg-white">
      <div className="w-fill mx-auto space-y-10">

        {/* Header Section */}
        <header className="space-y-4">
          <h1 className="text-4xl text-zinc-600 font-bold font-sans">{cityName}</h1>
          <SearchCard onSearch={onSearch} isLoading={isSearching} />
        </header>

        {/* Blueprint Section Template */}
        <Section 
          title="Things to do" 
          data={attractions.results} 
          isLoading={attractions.isLoading || !attractions.isLoaded} 
        />
        <Section 
          title="Restaurants" 
          data={restaurants.results} 
          isLoading={restaurants.isLoading || !restaurants.isLoaded} 
        />
        <Section 
          title="Events & Culture" 
          data={events.results} 
          isLoading={events.isLoading || !restaurants.isLoaded} 
        />
      </div>
    </main>
  );
}

function Section({ title, data, isLoading }: { title: string; data: any[]; isLoading: boolean }) {
  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center text-zinc-800">
        <h2 className="text-xl font-bold">{title}</h2>
        <ChevronRight className="text-zinc-300" />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
        {isLoading || data.length == 0 ? (
          [1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="min-w-[240px] h-60 bg-slate-100 animate-pulse rounded-3xl" />
          ))
        ) : (
          // REAL DATA STATE
          data.map((place) => (
            <div key={place.id} className="min-w-[240px] group cursor-pointer snap-start">
              <div className="relative h-60 bg-slate-100 rounded-3xl mb-3 overflow-hidden shadow-sm transition-transform duration-300 group-hover:scale-[0.98]">
                {/* Photo using Google's getURI method */}
                {place.photos?.[0] ? (
                  <img
                    src={place.photos[0].getURI({ maxWidth: 400 })}
                    className="w-full h-full object-cover"
                    alt=""
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <MapPin size={32} />
                  </div>
                )}

                {/* Rating Overlay */}
                {place.rating && (
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 text-xs font-bold shadow-sm">
                    <Star size={12} className="fill-yellow-400 stroke-yellow-400" />
                    {place.rating}
                  </div>
                )}
              </div>
              <h4 className="font-bold text-slate-900 px-1 truncate">{place.displayName}</h4>
              <p className="text-xs text-slate-500 px-1">
                {/* Google types are usually snake_case, let's clean it up */}
                {place.primaryType?.replace(/_/g, ' ')}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}