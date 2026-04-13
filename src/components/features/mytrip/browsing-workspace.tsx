import React, { useEffect, useMemo, useRef, useState } from 'react'
import { type Trip, Activity } from '@/db/schema'
import { Map as MapIcon, X, Calendar, MapPin, ListPlus, Loader2 } from 'lucide-react';
import { SearchCard } from '../search/search-card';
import { TripActivityCard } from './trip-browsing-card';
import { MOCK_ACTIVITIES } from '@/db/mock-activities';
import { OverlayMyList } from './overlay-mytrip';
import { usePlacesSearch } from '@/hooks/places-search';
import { MapPlace, Place } from '@/shared';

interface TripFeedProps {
    trip: Trip;
    onSearch: (keyword: string) => void;
    onHover: (id: number | null) => void;
    onGenerate: (activities: Activity[]) => void;
    onViewItinerary: (activities: Activity[]) => void;
    onPlacesChange: (places: MapPlace[]) => void;
    focusedPlaceId: string | null;
    onFocusPlace: (id: string | null) => void;
}

export const MyTripFeed = ({ trip, onSearch, onHover, onGenerate, onViewItinerary, onPlacesChange, focusedPlaceId, onFocusPlace }: TripFeedProps) => {
  const [searching, setSearching] = useState('');
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const placeholderWords = [
    "Sightseeing",
    "Walking tours",
    "Day trips",
    "Museums",
    "Art galleries",
    "Historical landmarks",
    "Architecture",
    "Scenic views",
    "Photo spots",
    "Sunset spots",
    "Sunrise spots",
]
  const [wordIndex, setWordIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'activity' | 'restaurant'>('activity'); // Tab State
  const [wantToGoActivities, setWantToGoActivities] = useState<Activity[]>([]);
  const [isListOpen, setIsListOpen] = useState(false);
  const [animateBadge, setAnimateBadge] = useState(false);
  const [clickedActivity, setClickedActivity] = useState<number|null>(null);
  const suggestions = usePlacesSearch();
  const searchField = [
                    'id',
                    'displayName',
                    'location',
                    'formattedAddress',
                    'addressComponents',
                    'types',
                    'rating',
                    'priceLevel',
                    'websiteUri',
                    'photos',
                    'regularOpeningHours',
                    'editorialSummary',
                    'reviews',
                ];

  const handleSearchSubmit = async (data: Place | string) => {
    const keyword = typeof data === 'string' ? data: data.name;
    setSearching(keyword)
    if (trip.lat && trip.lng) {
      await suggestions.searchByText(keyword, searchField, { lat: trip.lat, lng: trip.lng }, 10);
    } else {
      // Fallback if trip has no coordinates
      await suggestions.searchByText(keyword, searchField, { lat: 0, lng: 0 }, 10);
    }
  }

  useEffect(() => {
    if (searching !== '') return;

    const interval = setInterval(() => {
        setWordIndex((prev)=>(prev+1)%placeholderWords.length);
    }, 1500); //change every 1.5 seconds

    return ()=>clearInterval(interval);
  }, [searching === '']);

  // Emit place locations to parent so the map can show pins
  useEffect(() => {
    if (!suggestions.results.length) {
      onPlacesChange([]);
      return;
    }
    const mapPlaces: MapPlace[] = suggestions.results
      .filter((p) => p.id && p.location)
      .map((p) => ({
        id: p.id!,
        name: p.displayName ?? '',
        lat: p.location!.lat(),
        lng: p.location!.lng(),
        rating: p.rating ?? null,
        address: p.formattedAddress ?? null,
        imageUrl: p.photos?.[0]?.getURI({ maxWidth: 400 }) ?? null,
        images: p.photos?.slice(0, 8).map(ph => ph.getURI({ maxWidth: 800 })) ?? [],
        type: p.primaryType ?? null,
        description: p.editorialSummary ?? null,
        websiteUrl: p.websiteURI ?? null,
        openingHoursText: p.regularOpeningHours?.weekdayDescriptions ?? null,
        reviews: p.reviews?.slice(0, 5).map((r) => ({
          author: r.authorAttribution?.displayName ?? 'Anonymous',
          authorPhoto: r.authorAttribution?.photoURI ?? null,
          rating: r.rating ?? 0,
          text: r.text ?? '',
          relativeTime: r.relativePublishTimeDescription ?? '',
        })) ?? null,
      }));
    onPlacesChange(mapPlaces);
  }, [suggestions.results, onPlacesChange]);

  // Scroll focused card into view when a pin is clicked on the map
  useEffect(() => {
    if (!focusedPlaceId) return;
    const el = cardRefs.current.get(focusedPlaceId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusedPlaceId]);

  const displayActivities = useMemo(() => {
    // If we have search results from Google, show those
    if (suggestions.results.length > 0) {
      return suggestions.results;
    }
    // Otherwise, show the mock data based on active tab
    // TODO: ensure this is no longer needed
    return MOCK_ACTIVITIES.filter(act => act.category === activeTab);
  }, [suggestions.results, activeTab]);

  const toggleWantToGo = (activity: Activity) => {
    setWantToGoActivities((prev) => {
      const isAlreadyAdded = prev.some(a => a.id === activity.id);
      
      if (isAlreadyAdded) {
        return prev.filter((a) => a.id !== activity.id);
      } else {
        setAnimateBadge(true);
        setTimeout(() => setAnimateBadge(false), 300);
        return [...prev, activity];
      }
    });
  };

  const isAdded = (id: number | string) => wantToGoActivities.some(a => a.id === id);

  return (
    <main className="h-full overflow-y-auto bg-white p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Trip Header */}
        <header className="space-y-6">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
                Trip - {trip.tripName}
              </h1>
              <div className="flex items-center gap-4 text-slate-500 text-sm font-medium">
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{trip.startDate} - {trip.endDate}</span>
                <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{trip.destination}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => onViewItinerary(wantToGoActivities)} 
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm"
              >
                <MapIcon className="w-4 h-4" /> View Itinerary
              </button>
            </div>
          </div>

          <SearchCard onSearch={handleSearchSubmit} onChange={setSearching} variant='inline' />
        </header>

        <div className="pt-8 border-t border-slate-300 space-y-6"> 
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl w-fit">
              <button
                  onClick={() => { setActiveTab('activity'); suggestions.setResults([]); }}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'activity' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
              >
                  Things to Do
              </button>
              <button
                  onClick={() => { setActiveTab('restaurant'); suggestions.setResults([]); }}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'restaurant' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
              >
                  Restaurants
              </button>
            </div>
            
            <div className="space-y-4 pb-20">
              {suggestions.isLoading ? (
                <div className="flex flex-col items-center py-20 text-slate-400">
                  <Loader2 className="w-10 h-10 animate-spin mb-4 text-indigo-500" />
                  <p className="font-medium animate-pulse">Searching near {trip.destination}...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {displayActivities.map((activity) => (
                    <div
                      key={activity.id}
                      ref={(el) => { if (el) cardRefs.current.set(String(activity.id), el); }}
                      className={focusedPlaceId === String(activity.id) ? 'ring-2 ring-indigo-500 rounded-2xl' : ''}
                    >
                      <TripActivityCard
                        tripId={trip.id}
                        activity={activity as Activity}
                        isAdded={isAdded(activity.id)}
                        onHover={onHover}
                        onToggle={() => toggleWantToGo(activity as Activity)}
                        onClick={() => onFocusPlace(String(activity.id))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>
      </div>

      {/* Floating Indicator */}
      {wantToGoActivities.length > 0 && (
        <button 
          onClick={() => setIsListOpen(!isListOpen)}
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-8 py-4 rounded-full shadow-2xl flex items-center gap-3 transition-all active:scale-95 ${
            isListOpen ? 'bg-slate-800 text-white' : 'bg-indigo-600 text-white'
          } ${animateBadge ? 'scale-110' : ''}`}
        >
          {isListOpen ? <X className="w-5 h-5" /> : <ListPlus className="w-5 h-5" />}
          <span className="font-bold">{isListOpen ? 'Close List' : `Review List (${wantToGoActivities.length})`}</span>
          {animateBadge && <span className="absolute -top-1 -right-1 flex h-4 w-4"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span></span>}
        </button>
      )}

      <OverlayMyList 
        isOpen={isListOpen}
        onClose={() => setIsListOpen(false)}
        addedPlaces={wantToGoActivities}
        onRemove={(id) => {
           const act = wantToGoActivities.find(a => a.id === id);
           if (act) toggleWantToGo(act);
        }}
        onGenerate={() => onGenerate(wantToGoActivities)}
      />
    </main>
  )
};