import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2, MapPin, Plus, Sparkles, Star, X } from 'lucide-react';
import { MapPlace, Place } from '@/shared'
import { usePlacesSearch, extractSnapshot } from '@/hooks/places-search';
import { usePlacesAutocomplete } from '@/hooks/places-autocomplete';
import { shadowSaveActivities } from '@/app/actions/shadow-save-activities';
import { getRecommendedCities } from '@/app/actions/recommend-cities';
import { LoadPlacesLibrary } from '@/lib/google-maps';
import { PlaceDetailPanel } from '../map/place-detail-panel';

// ── Persistent localStorage cache ────────────────────────────────────────────
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function loadCachedPlaces(cityId: string): MapPlace[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`places:${cityId}`);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (Date.now() > expiry) { localStorage.removeItem(`places:${cityId}`); return null; }
    return data as MapPlace[];
  } catch { return null; }
}

function saveCachedPlaces(cityId: string, places: MapPlace[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`places:${cityId}`, JSON.stringify({
      data: places,
      expiry: Date.now() + CACHE_TTL,
    }));
  } catch { /* storage quota exceeded */ }
}

// ── City suggestion resolver ──────────────────────────────────────────────────
async function resolveCity(name: string): Promise<Place | null> {
  const lib = await LoadPlacesLibrary();
  const { places } = await lib.Place.searchByText({
    textQuery: name,
    fields: ['id', 'displayName', 'location', 'viewport'],
    maxResultCount: 1,
  });
  const p = places?.[0];
  if (!p?.location) return null;
  return {
    id: p.id ?? '',
    name: p.displayName ?? name,
    lat: p.location.lat(),
    lng: p.location.lng(),
    viewport: p.viewport ?? null,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface DiscoveryProps {
  cities: Place[];
  activeCityId: string;
  onAddCity: (place: Place) => void;
  onRemoveCity: (id: string) => void;
  onSelectCity: (id: string) => void;
  onPlacesChange: (places: MapPlace[]) => void;
  focusedPlaceId: string | null;
  onFocusPlace: (id: string | null) => void;
}

// ── Place extractor ───────────────────────────────────────────────────────────
function toMapPlace(p: google.maps.places.Place, category: MapPlace['category']): MapPlace {
  return {
    id: p.id!,
    name: p.displayName ?? '',
    lat: p.location!.lat(),
    lng: p.location!.lng(),
    category,
    rating: p.rating ?? null,
    address: p.formattedAddress ?? null,
    imageUrl: p.photos?.[0]?.getURI({ maxWidth: 400 }) ?? null,
    images: p.photos?.slice(0, 8).map(ph => ph.getURI({ maxWidth: 800 })) ?? [],
    type: p.primaryType ?? null,
    description: p.editorialSummary ?? null,
    websiteUrl: p.websiteURI ?? null,
    openingHoursText: p.regularOpeningHours?.weekdayDescriptions ?? null,
    reviews: p.reviews?.slice(0, 5).map(r => ({
      author: r.authorAttribution?.displayName ?? 'Anonymous',
      authorPhoto: r.authorAttribution?.photoURI ?? null,
      rating: r.rating ?? 0,
      text: r.text ?? '',
      relativeTime: r.relativePublishTimeDescription ?? '',
    })) ?? null,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DiscoveryFeed({ cities, activeCityId, onAddCity, onRemoveCity, onSelectCity, onPlacesChange, focusedPlaceId, onFocusPlace }: DiscoveryProps) {
  const location = cities.find(c => c.id === activeCityId) ?? null;
  const attractions = usePlacesSearch();
  const restaurants = usePlacesSearch();
  const events = usePlacesSearch();
  const hotels = usePlacesSearch();
  const numSearchResults = 15;

  const [mapPlaces, setMapPlaces] = useState<MapPlace[]>([]);
  const focusedPlace = mapPlaces.find((p) => p.id === focusedPlaceId) ?? null;

  // City picker
  const { searchSuggestions, loading: acLoading, fetchSuggestions, refreshSession } = usePlacesAutocomplete();
  const [cityInput, setCityInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Gemini suggestions
  const [suggestedCities, setSuggestedCities] = useState<string[]>([]);
  const [resolvingCity, setResolvingCity] = useState<string | null>(null);

  // ── Load from localStorage when city changes ────────────────────────────────
  useEffect(() => {
    if (!location) return;
    const cached = loadCachedPlaces(location.id);
    if (cached) {
      console.log(`[DiscoveryFeed] CACHE HIT — ${cached.length} places for "${location.name}" loaded from localStorage`);
      setMapPlaces(cached);
      onPlacesChange(cached);
    } else {
      console.log(`[DiscoveryFeed] CACHE MISS — no localStorage data for "${location.name}"`);
    }
    setSuggestedCities([]);
    getRecommendedCities(location.name).then(setSuggestedCities);
  }, [activeCityId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── City picker handlers ────────────────────────────────────────────────────
  const handleAddFromAutocomplete = async (s: google.maps.places.AutocompleteSuggestion) => {
    if (!s.placePrediction) return;
    setShowDropdown(false);
    setCityInput('');
    try {
      const { place } = await s.placePrediction.toPlace().fetchFields({
        fields: ['id', 'displayName', 'location', 'viewport'],
      });
      if (place.location && place.id) {
        onAddCity({ id: place.id, name: place.displayName ?? '', lat: place.location.lat(), lng: place.location.lng(), viewport: place.viewport ?? null });
      }
    } catch (e) { console.error(e); }
    refreshSession();
  };

  const handleSuggestionClick = async (name: string) => {
    setResolvingCity(name);
    const place = await resolveCity(name);
    if (place) onAddCity(place);
    setResolvingCity(null);
  };

  // ── Search nearby when location changes ────────────────────────────────────
  // loadCachedPlaces returns null when cache is missing OR expired (TTL = 24h),
  // so the API is only skipped when fresh data exists in localStorage.
  useEffect(() => {
    if (!location) return;
    if (loadCachedPlaces(location.id) !== null) {
      console.log(`[DiscoveryFeed] Skipping Google Places API for "${location.name}" — localStorage cache is fresh`);
      return;
    }
    console.log(`[DiscoveryFeed] Calling Google Places API for "${location.name}"`);
    const coords = { lat: location.lat, lng: location.lng };
    attractions.searchNearby(coords, ['tourist_attraction', 'museum', 'park'], numSearchResults, location.viewport);
    restaurants.searchNearby(coords, ['restaurant', 'cafe', 'bakery'], numSearchResults, location.viewport);
    events.searchNearby(coords, ['event_venue', 'movie_theater', 'art_gallery'], numSearchResults, location.viewport);
    hotels.searchNearby(coords, ['hotel', 'motel', 'resort_hotel', 'extended_stay_hotel'], numSearchResults, location.viewport);
  }, [location, attractions.isLoaded, restaurants.isLoaded, events.isLoaded, hotels.isLoaded, attractions.searchNearby, restaurants.searchNearby, events.searchNearby, hotels.searchNearby]);

  // ── When API results arrive, update state + persist to localStorage ─────────
  useEffect(() => {
    const fresh: MapPlace[] = [
      ...attractions.results.filter(p => p.id && p.location).map(p => toMapPlace(p, 'attraction')),
      ...restaurants.results.filter(p => p.id && p.location).map(p => toMapPlace(p, 'restaurant')),
      ...events.results.filter(p => p.id && p.location).map(p => toMapPlace(p, 'event')),
      ...hotels.results.filter(p => p.id && p.location).map(p => toMapPlace(p, 'hotel')),
    ];
    if (fresh.length === 0) return; // don't overwrite cache with empty results
    console.log(`[DiscoveryFeed] API returned ${fresh.length} places for "${location?.name}" — saving to localStorage`);
    setMapPlaces(fresh);
    onPlacesChange(fresh);
    if (location) saveCachedPlaces(location.id, fresh);
  }, [attractions.results, restaurants.results, events.results, hotels.results]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shadow-save to DB ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!location || !attractions.results.length) return;
    shadowSaveActivities(attractions.results.map(p => extractSnapshot(p, location.name, 'attraction')).filter(s => s.googlePlaceId)).catch(console.error);
  }, [attractions.results, location]);

  useEffect(() => {
    if (!location || !restaurants.results.length) return;
    shadowSaveActivities(restaurants.results.map(p => extractSnapshot(p, location.name, 'restaurant')).filter(s => s.googlePlaceId)).catch(console.error);
  }, [restaurants.results, location]);

  useEffect(() => {
    if (!location || !events.results.length) return;
    shadowSaveActivities(events.results.map(p => extractSnapshot(p, location.name, 'culture')).filter(s => s.googlePlaceId)).catch(console.error);
  }, [events.results, location]);

  useEffect(() => {
    if (!location || !hotels.results.length) return;
    shadowSaveActivities(hotels.results.map(p => extractSnapshot(p, location.name, 'hotel')).filter(s => s.googlePlaceId)).catch(console.error);
  }, [hotels.results, location]);

  // ── Derive per-section data ────────────────────────────────────────────────
  const attractionPlaces = mapPlaces.filter(p => p.category === 'attraction');
  const restaurantPlaces = mapPlaces.filter(p => p.category === 'restaurant');
  const eventPlaces      = mapPlaces.filter(p => p.category === 'event');
  const hotelPlaces      = mapPlaces.filter(p => p.category === 'hotel');

  return (
    <div className="relative flex-1 w-full h-screen overflow-hidden bg-white">
      <main className="h-full overflow-y-auto p-10">
        <div className="w-fill mx-auto space-y-10">

          {/* Header */}
          <header className="space-y-4">
            {/* City tabs + inline picker */}
            <div className="flex items-center gap-2 flex-wrap">
              {cities.map(city => (
                <button
                  key={city.id}
                  onClick={() => onSelectCity(city.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
                    city.id === activeCityId ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {city.name}
                  <span role="button" onClick={(e) => { e.stopPropagation(); onRemoveCity(city.id); }} className="ml-0.5 opacity-60 hover:opacity-100">
                    <X size={12} />
                  </span>
                </button>
              ))}

              <div className="relative">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full">
                  <Plus size={13} className="text-slate-400 shrink-0" />
                  <input
                    value={cityInput}
                    onChange={(e) => { setCityInput(e.target.value); fetchSuggestions(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder="Add a city…"
                    className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none w-28"
                  />
                  {acLoading && <Loader2 size={12} className="animate-spin text-slate-400 shrink-0" />}
                </div>
                {showDropdown && searchSuggestions.length > 0 && cityInput.length > 0 && (
                  <ul className="absolute left-0 top-full mt-1 z-50 w-60 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    {searchSuggestions.map((s, i) => (
                      <li key={i} onMouseDown={() => handleAddFromAutocomplete(s)} className="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 flex items-center gap-2">
                        <MapPin size={12} className="text-indigo-400 shrink-0" />
                        {s.placePrediction?.text.toString()}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Gemini suggestions */}
            {suggestedCities.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1"><Sparkles size={11} /> You might also like:</span>
                {suggestedCities.map(name => (
                  <button key={name} onClick={() => handleSuggestionClick(name)} disabled={resolvingCity === name}
                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-medium hover:bg-indigo-100 transition-colors disabled:opacity-50">
                    {resolvingCity === name ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                    {name}
                  </button>
                ))}
              </div>
            )}
          </header>

          {/* Sections */}
          <Section
            title="Things to do"
            data={attractionPlaces}
            isLoading={attractionPlaces.length === 0 && (attractions.isLoading || !attractions.isLoaded)}
            focusedPlaceId={focusedPlaceId}
            onFocusPlace={onFocusPlace}
          />
          <Section
            title="Restaurants"
            data={restaurantPlaces}
            isLoading={restaurantPlaces.length === 0 && (restaurants.isLoading || !restaurants.isLoaded)}
            focusedPlaceId={focusedPlaceId}
            onFocusPlace={onFocusPlace}
          />
          <Section
            title="Events & Culture"
            data={eventPlaces}
            isLoading={eventPlaces.length === 0 && (events.isLoading || !events.isLoaded)}
            focusedPlaceId={focusedPlaceId}
            onFocusPlace={onFocusPlace}
          />
          <Section
            title="Hotels"
            data={hotelPlaces}
            isLoading={hotelPlaces.length === 0 && (hotels.isLoading || !hotels.isLoaded)}
            focusedPlaceId={focusedPlaceId}
            onFocusPlace={onFocusPlace}
          />
        </div>
      </main>

      {/* Detail panel */}
      <AnimatePresence>
        {focusedPlace && (
          <>
            <motion.div className="absolute inset-0 z-10 bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onFocusPlace(null)} />
            <motion.div className="absolute inset-y-0 right-0 z-20" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 250 }}>
              <PlaceDetailPanel place={focusedPlace} onClose={() => onFocusPlace(null)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({ title, data, isLoading, focusedPlaceId, onFocusPlace }: {
  title: string;
  data: MapPlace[];
  isLoading: boolean;
  focusedPlaceId: string | null;
  onFocusPlace: (id: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -1040 : 1040, behavior: 'smooth' });
  };

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center text-zinc-800">
        <h2 className="text-xl font-bold">{title}</h2>
        <div className="flex gap-1">
          <button onClick={() => scroll('left')} className="p-1 rounded-full hover:bg-zinc-100 transition-colors">
            <ChevronLeft size={20} className="text-zinc-400" />
          </button>
          <button onClick={() => scroll('right')} className="p-1 rounded-full hover:bg-zinc-100 transition-colors">
            <ChevronRight size={20} className="text-zinc-400" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
        {isLoading ? (
          [1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="min-w-[240px] h-60 bg-slate-100 animate-pulse rounded-3xl" />
          ))
        ) : (
          data.map((place) => (
            <div
              key={place.id}
              className={`min-w-[240px] group cursor-pointer snap-start ${focusedPlaceId === place.id ? 'ring-2 ring-indigo-500 rounded-3xl' : ''}`}
              onClick={() => onFocusPlace(place.id)}
            >
              <div className="relative h-60 bg-slate-100 rounded-3xl mb-3 overflow-hidden shadow-sm transition-transform duration-300 group-hover:scale-[0.98]">
                {place.imageUrl ? (
                  <img src={place.imageUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <MapPin size={32} />
                  </div>
                )}
                {place.rating != null && (
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 text-xs font-bold shadow-sm text-gray-500">
                    <Star size={12} className="fill-yellow-400 stroke-yellow-400" />
                    {place.rating}
                  </div>
                )}
              </div>
              <h4 className="font-bold text-slate-900 px-1 truncate">{place.name}</h4>
              <p className="text-xs text-slate-500 px-1">{place.type?.replace(/_/g, ' ')}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
