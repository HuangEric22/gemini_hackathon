'use client'

import React, { useEffect, useState } from 'react'
import { type Trip, Activity } from '@/db/schema'
import { Map, X, Calendar, Loader2, Sparkles, UtensilsCrossed, PartyPopper, Lightbulb, ArrowLeft, ChevronRight, ListPlus } from 'lucide-react';
import { SearchCard } from '../search/search-card';
import { HighlightActivityCard, HighlightSkeletons } from './highligh-activity-card';
import { OverlayMyList } from './overlay-mytrip';
import { usePlacesSearch, extractSnapshot } from '@/hooks/places-search';
import { shadowSaveActivities } from '@/app/actions/shadow-save-activities';
import { Place } from '@/shared';
import { CATEGORY_KEYWORDS, KeywordCategory, PROMPT_SUGGESTIONS } from '@/shared/activity-keywords';
import { TripActivityCard } from './trip-activity-card';

interface TripFeedProps {
    trip: Trip;
    onHover: (id: number | null) => void;
    onGenerate: (activities: Activity[], preference?: string) => void;
    onViewItinerary: (activities: Activity[]) => void;
    onToggle: (activity: Activity) => void;
}

const CHIPS: KeywordCategory[] = ['All', 'Outdoor', 'Food', 'Culture', 'Nightlife'];

const SEARCH_FIELDS = [
    'id', 'displayName', 'location', 'formattedAddress',
    'types', 'rating', 'priceLevel', 'websiteURI',
    'photos', 'regularOpeningHours', 'editorialSummary',
];

const placeholderWords = [
    'Photo spots', 'Local food', 'Sunset views', 'Hidden gems',
    'Day trips', 'Museums', 'Night markets', 'Hiking trails',
];

// ─── Main component ────────────────────────────────────────────────────────────
export const MyTripFeed = ({ trip, onHover, onGenerate, onViewItinerary, onToggle }: TripFeedProps) => {
    const [searching, setSearching] = useState('');
    const [wordIndex, setWordIndex] = useState(0);
    const [selectedChip, setSelectedChip] = useState<KeywordCategory>('All');
    const [wantToGoActivities, setWantToGoActivities] = useState<Activity[]>([]);
    const [isListOpen, setIsListOpen] = useState(false);
    const [animateBadge, setAnimateBadge] = useState(false);

    // DB-backed activity arrays (with integer IDs) for each section
    const [attractionActivities, setAttractionActivities] = useState<Activity[]>([]);
    const [restaurantActivities, setRestaurantActivities] = useState<Activity[]>([]);
    const [eventActivities, setEventActivities] = useState<Activity[]>([]);
    const [searchActivities, setSearchActivities] = useState<Activity[]>([]);

    const attractions = usePlacesSearch();
    const restaurants = usePlacesSearch();
    const events = usePlacesSearch();
    const textSearch = usePlacesSearch();

    // Trigger nearby searches once all hooks are ready
    useEffect(() => {
        if (!trip.lat || !trip.lng) return;
        if (!attractions.isLoaded || !restaurants.isLoaded || !events.isLoaded) return;

        const coords = { lat: trip.lat, lng: trip.lng };
        attractions.searchNearby(coords, ['tourist_attraction', 'museum', 'park'], 10);
        restaurants.searchNearby(coords, ['restaurant', 'cafe', 'bakery'], 10);
        events.searchNearby(coords, ['event_venue', 'movie_theater', 'art_gallery'], 10);
    }, [
        trip.lat, trip.lng,
        attractions.isLoaded, restaurants.isLoaded, events.isLoaded,
        attractions.searchNearby, restaurants.searchNearby, events.searchNearby,
    ]);

    // Shadow-save each section → Activity[] with integer IDs for the add button
    useEffect(() => {
        if (!attractions.results.length) return;
        shadowSaveActivities(
            attractions.results.map(p => extractSnapshot(p, trip.destination, 'attraction'))
        ).then(setAttractionActivities).catch(console.error);
    }, [attractions.results]);

    useEffect(() => {
        if (!restaurants.results.length) return;
        shadowSaveActivities(
            restaurants.results.map(p => extractSnapshot(p, trip.destination, 'restaurant'))
        ).then(setRestaurantActivities).catch(console.error);
    }, [restaurants.results]);

    useEffect(() => {
        if (!events.results.length) return;
        shadowSaveActivities(
            events.results.map(p => extractSnapshot(p, trip.destination, 'culture'))
        ).then(setEventActivities).catch(console.error);
    }, [events.results]);

    // Shadow-save text search results
    useEffect(() => {
        if (!textSearch.results.length) return;
        shadowSaveActivities(
            textSearch.results.map(p => extractSnapshot(p, trip.destination, 'activity'))
        ).then(setSearchActivities).catch(console.error);
    }, [textSearch.results]);

    // Clear search when input emptied
    useEffect(() => {
        if (!searching) {
            setSearchActivities([]);
            textSearch.setResults([]);
        }
    }, [searching]);

    // Rotate placeholder while idle
    useEffect(() => {
        if (searching) return;
        const interval = setInterval(() => {
            setWordIndex(prev => (prev + 1) % placeholderWords.length);
        }, 1500);
        return () => clearInterval(interval);
    }, [searching]);

    const handleSearchSubmit = async (data: Place | string) => {
        const keyword = typeof data === 'string' ? data : data.name;
        setSearching(keyword);
        if (trip.lat && trip.lng) {
            await textSearch.searchByText(keyword, SEARCH_FIELDS, { lat: trip.lat, lng: trip.lng }, 10);
        }
    };

    const handleChipClick = (chip: KeywordCategory) => {
        setSelectedChip(chip);
        if (chip === 'All') {
            setSearching('');
        } else {
            handleSearchSubmit(chip);
        }
    };

    const toggleWantToGo = (activity: Activity) => {
        setWantToGoActivities(prev => {
            const already = prev.some(a => a.id === activity.id);
            if (already) return prev.filter(a => a.id !== activity.id);
            setAnimateBadge(true);
            setTimeout(() => setAnimateBadge(false), 300);
            return [...prev, activity];
        });
    };

    const isAdded = (id: number) => wantToGoActivities.some(a => a.id === id);
    const isSearchLoading = searching !== '' && (textSearch.isLoading || searchActivities.length === 0);
    const prompts = PROMPT_SUGGESTIONS(trip.dayCount ?? 3);

    return (
        <main className="h-full overflow-y-auto bg-white">
            {/* ── Header ── */}
            <div className="p-10 space-y-4">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <h1 className="text-4xl text-zinc-600 font-bold font-sans">{trip.destination}</h1>
                        <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium flex-wrap">
                            <span>{trip.tripName}</span>
                            {(trip.startDate || trip.endDate) && (
                                <>
                                    <span className="text-slate-300">|</span>
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                        {trip.startDate ?? '?'} – {trip.endDate ?? '?'}
                                    </span>
                                </>
                            )}
                            {trip.dayCount && (
                                <>
                                    <span className="text-slate-300">|</span>
                                    <span>{trip.dayCount} days</span>
                                </>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => onViewItinerary(wantToGoActivities)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm"
                    >
                        <Map className="w-4 h-4" /> View Itinerary
                    </button>
                </div>

                <SearchCard
                    onSearch={handleSearchSubmit}
                    onChange={setSearching}
                    variant="inline"
                    mode="activity"
                    locationContext={trip.lat && trip.lng ? { lat: trip.lat, lng: trip.lng } : undefined}
                    placeholder={placeholderWords[wordIndex]}
                    keywords={CATEGORY_KEYWORDS[selectedChip]}
                />

                {/* Category chips — clicking fires a search */}
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                    {CHIPS.map(chip => (
                        <button
                            key={chip}
                            onClick={() => handleChipClick(chip)}
                            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                                selectedChip === chip
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                            }`}
                        >
                            {chip}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Content ── */}
            <div className="px-10 pb-10 space-y-10">
                {searching ? (
                    /* Search results */
                    <section className="space-y-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setSearching('')}
                                className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4 text-slate-500" />
                            </button>
                            <h2 className="text-lg font-bold text-slate-800">
                                Results for <span className="text-indigo-600">"{searching}"</span>
                                <span className="text-slate-400 font-normal"> near {trip.destination}</span>
                            </h2>
                        </div>

                        {isSearchLoading ? (
                            <div className="flex flex-col items-center py-16 text-slate-400">
                                <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-500" />
                                <p className="text-sm animate-pulse">Searching near {trip.destination}…</p>
                            </div>
                        ) : searchActivities.length === 0 ? (
                            <p className="text-slate-400 text-sm py-10 text-center">No results found. Try a different keyword.</p>
                        ) : (
                            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                                {searchActivities.map(activity => (
                                    <TripActivityCard
                                      key={activity.id}
                                      activity={activity}
                                      isAdded={isAdded(activity.id)}
                                      onToggle={() => onToggle(activity)}
                                  />
                                ))}
                            </div>
                        )}
                    </section>
                ) : (
                    /* Discovery mode */
                    <>
                        <DiscoverySection
                            icon={<Sparkles className="w-5 h-5 text-amber-500" />}
                            title="Top Experiences"
                            activities={attractionActivities}
                            isLoading={attractions.isLoading || !attractions.isLoaded}
                            isAdded={isAdded}
                            onToggle={toggleWantToGo}
                        />

                        <DiscoverySection
                            icon={<UtensilsCrossed className="w-5 h-5 text-rose-500" />}
                            title="Must-Try Restaurants"
                            activities={restaurantActivities}
                            isLoading={restaurants.isLoading || !restaurants.isLoaded}
                            isAdded={isAdded}
                            onToggle={toggleWantToGo}
                        />

                        <DiscoverySection
                            icon={<PartyPopper className="w-5 h-5 text-violet-500" />}
                            title="Events During Your Trip"
                            activities={eventActivities}
                            isLoading={events.isLoading || !events.isLoaded}
                            isAdded={isAdded}
                            onToggle={toggleWantToGo}
                        />

                        {/* Prompt suggestions */}
                        <section className="space-y-4 pb-4">
                            <div className="flex items-center gap-2">
                                <Lightbulb className="w-5 h-5 text-slate-400" />
                                <h2 className="text-xl font-bold text-zinc-800">Not sure what to do?</h2>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {prompts.map(prompt => (
                                    <button
                                        key={prompt}
                                        onClick={() => onGenerate(wantToGoActivities, prompt)}
                                        className="px-4 py-2 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-full text-sm font-medium text-slate-600 transition-all"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </section>
                    </>
                )}
            </div>

            {/* ── Floating want-to-go button ── */}
            {wantToGoActivities.length > 0 && (
                <button
                    onClick={() => setIsListOpen(!isListOpen)}
                    className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-8 py-4 rounded-full shadow-2xl flex items-center gap-3 transition-all active:scale-95 ${
                        isListOpen ? 'bg-slate-800 text-white' : 'bg-indigo-600 text-white'
                    } ${animateBadge ? 'scale-110' : ''}`}
                >
                    {isListOpen ? <X className="w-5 h-5" /> : <ListPlus className="w-5 h-5" />}
                    <span className="font-bold">
                        {isListOpen ? 'Close List' : `Review List (${wantToGoActivities.length})`}
                    </span>
                    {animateBadge && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500" />
                        </span>
                    )}
                </button>
            )}

            <OverlayMyList
                isOpen={isListOpen}
                onClose={() => setIsListOpen(false)}
                addedPlaces={wantToGoActivities}
                onRemove={(id: number) => {
                    const act = wantToGoActivities.find(a => a.id === id);
                    if (act) toggleWantToGo(act);
                }}
                onGenerate={() => onGenerate(wantToGoActivities)}
            />
        </main>
    );
};

// ─── Discovery section ─────────────────────────────────────────────────────────
function DiscoverySection({
    icon, title, activities, isLoading, isAdded, onToggle,
}: {
    icon: React.ReactNode;
    title: string;
    activities: Activity[];
    isLoading: boolean;
    isAdded: (id: number) => boolean;
    onToggle: (activity: Activity) => void;
}) {
    return (
        <section className="space-y-4">
            <div className="flex justify-between items-center text-zinc-800">
                <div className="flex items-center gap-2">
                    {icon}
                    <h2 className="text-xl font-bold">{title}</h2>
                </div>
                <ChevronRight className="text-zinc-300" />
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                {isLoading || activities.length === 0
                    ? <HighlightSkeletons />
                    : activities.map(activity => (
                        <HighlightActivityCard
                            key={activity.id}
                            activity={activity}
                            isAdded={isAdded(activity.id)}
                            onToggle={() => onToggle(activity)}
                        />
                    ))
                }
            </div>
        </section>
    );
}
