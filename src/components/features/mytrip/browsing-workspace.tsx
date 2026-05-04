'use client'

import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion';
import { type Trip, Activity } from '@/db/schema'
import { Map as MapIcon, X, Calendar, Loader2, Sparkles, UtensilsCrossed, PartyPopper, Lightbulb, ArrowLeft, ChevronLeft, ChevronRight, ListPlus } from 'lucide-react';
import { SearchCard } from '../search/search-card';
import { HighlightActivityCard, HighlightSkeletons } from './highligh-activity-card';
import { DayPlanner, type DayAssignments } from './day-planner';
import { usePlacesSearch, extractSnapshot } from '@/hooks/places-search';
import { shadowSaveActivities } from '@/app/actions/shadow-save-activities';
import { updateWantToGo } from '@/app/actions/crud-trip';
import { ItineraryGenerationResponse, MapPlace, Place } from '@/shared';
import { CATEGORY_KEYWORDS, KeywordCategory, PROMPT_SUGGESTIONS } from '@/shared/activity-keywords';
import { TripActivityCard } from './trip-activity-card';
import { PlaceDetailPanel } from '../map/place-detail-panel';

interface TripFeedProps {
    trip: Trip;
    initialSelections?: Activity[];
    onHover: (id: number | null) => void;
    onGenerate: (activities: Activity[], preference?: string, dayAssignments?: DayAssignments) => void;
    pace?: 'relaxed' | 'moderate' | 'packed';
    onPaceChange?: (v: 'relaxed' | 'moderate' | 'packed') => void;
    budget?: 'budget' | 'moderate' | 'luxury';
    onBudgetChange?: (v: 'budget' | 'moderate' | 'luxury') => void;
    startTime?: '7:00 AM' | '9:00 AM' | '11:00 AM';
    onStartTimeChange?: (v: '7:00 AM' | '9:00 AM' | '11:00 AM') => void;
    onViewItinerary: (activities: Activity[]) => void;
    onPlacesChange?: (places: MapPlace[]) => void;
    focusedPlaceId?: string | null;
    onFocusPlace?: (id: string | null) => void;
    currentItinerary?: ItineraryGenerationResponse | null;
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

function getSearchParams(dayCount: number) {
    if (dayCount <= 1) return { radius: 2000, count: 10 };
    if (dayCount <= 2) return { radius: 5000, count: 12 };
    if (dayCount <= 3) return { radius: 8000, count: 15 };
    if (dayCount <= 5) return { radius: 15000, count: 18 };
    return { radius: 25000, count: 20 }; // 7+ days
}

// ─── Main component ────────────────────────────────────────────────────────────
export const MyTripFeed = ({ trip, initialSelections = [], onGenerate, onViewItinerary, onPlacesChange, focusedPlaceId, onFocusPlace, currentItinerary, pace, onPaceChange, budget, onBudgetChange, startTime, onStartTimeChange }: TripFeedProps) => {
    const [searching, setSearching] = useState('');
    const [wordIndex, setWordIndex] = useState(0);
    const [selectedChip, setSelectedChip] = useState<KeywordCategory>('All');
    const [wantToGoActivities, setWantToGoActivities] = useState<Activity[]>(initialSelections);
    const [isListOpen, setIsListOpen] = useState(false);
    const [animateBadge, setAnimateBadge] = useState(false);
    const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null);
    const mapPlacesRef = useRef<MapPlace[]>([]);
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    // Sync local selections when parent loads from DB
    useEffect(() => {
        if (initialSelections.length === 0) return;
        setWantToGoActivities(prev => {
            const existingIds = new Set(prev.map(a => a.id));
            const newOnes = initialSelections.filter(a => !existingIds.has(a.id));
            return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
    }, [initialSelections]);

    // DB-backed activity arrays (with integer IDs) for each section
    const [attractionActivities, setAttractionActivities] = useState<Activity[]>([]);
    const [restaurantActivities, setRestaurantActivities] = useState<Activity[]>([]);
    const [eventActivities, setEventActivities] = useState<Activity[]>([]);
    const [searchActivities, setSearchActivities] = useState<Activity[]>([]);
    const [hasLoadedMore, setHasLoadedMore] = useState(false);

    const attractions = usePlacesSearch();
    const restaurants = usePlacesSearch();
    const events = usePlacesSearch();
    const textSearch = usePlacesSearch();

    // Trigger nearby searches once all hooks are ready
    useEffect(() => {
        if (!trip.lat || !trip.lng) return;
        if (!attractions.isLoaded || !restaurants.isLoaded || !events.isLoaded) return;

        const coords = { lat: trip.lat, lng: trip.lng };
        const { radius, count } = getSearchParams(trip.dayCount ?? 1);
        attractions.searchNearby(coords, ['tourist_attraction', 'museum', 'park'], count, null, radius);
        restaurants.searchNearby(coords, [
            'restaurant', 'cafe', 'bakery',
            'chinese_restaurant', 'japanese_restaurant', 'korean_restaurant',
            'indian_restaurant', 'thai_restaurant', 'vietnamese_restaurant',
            'italian_restaurant', 'mexican_restaurant', 'american_restaurant',
            'mediterranean_restaurant', 'french_restaurant', 'asian_restaurant',
            'seafood_restaurant', 'pizza_restaurant', 'steak_house',
            'sushi_restaurant', 'ramen_restaurant', 'fast_food_restaurant',
            'breakfast_restaurant', 'brunch_restaurant', 'hamburger_restaurant',
            'sandwich_shop', 'ice_cream_shop',
        ], count, null, radius);
        events.searchNearby(coords, ['event_venue', 'movie_theater', 'art_gallery'], count, null, radius);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        trip.lat, trip.lng,
        attractions.isLoaded, restaurants.isLoaded, events.isLoaded,
        attractions.searchNearby, restaurants.searchNearby, events.searchNearby,
        trip.dayCount,
    ]);

    // Shadow-save each section → Activity[] with integer IDs for the add button
    useEffect(() => {
        if (!attractions.results.length) return;
        shadowSaveActivities(
            attractions.results.map(p => extractSnapshot(p, trip.destination, 'attraction'))
        ).then(setAttractionActivities).catch(console.error);
    }, [attractions.results, trip.destination]);

    useEffect(() => {
        if (!restaurants.results.length) return;
        shadowSaveActivities(
            restaurants.results.map(p => extractSnapshot(p, trip.destination, 'restaurant'))
        ).then(setRestaurantActivities).catch(console.error);
    }, [restaurants.results, trip.destination]);

    useEffect(() => {
        if (!events.results.length) return;
        shadowSaveActivities(
            events.results.map(p => extractSnapshot(p, trip.destination, 'culture'))
        ).then(setEventActivities).catch(console.error);
    }, [events.results, trip.destination]);

    // Shadow-save text search results
    useEffect(() => {
        if (!textSearch.results.length) return;
        shadowSaveActivities(
            textSearch.results.map(p => extractSnapshot(p, trip.destination, 'activity'))
        ).then(setSearchActivities).catch(console.error);
    }, [textSearch.results, trip.destination]);

    // Emit all discovered places to parent (for map pins)
    useEffect(() => {
        const allResults = [...attractions.results, ...restaurants.results, ...events.results];
        if (!allResults.length) { onPlacesChange?.([]); return; }
        const mapPlaces: MapPlace[] = allResults
            .filter(p => p.id && p.location)
            .map(p => ({
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
        mapPlacesRef.current = mapPlaces;
        onPlacesChange?.(mapPlaces);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attractions.results, restaurants.results, events.results]);

    const handleActivitySelect = (activity: Activity) => {
        const place = mapPlacesRef.current.find(p => p.id === activity.googlePlaceId);
        if (place) {
            setSelectedPlace(place);
            onFocusPlace?.(place.id);
            return;
        }
        // For search results not in mapPlacesRef, build a MapPlace from Activity fields
        if (!activity.googlePlaceId) return;
        setSelectedPlace({
            id: activity.googlePlaceId,
            name: activity.name,
            lat: activity.lat,
            lng: activity.lng,
            rating: activity.rating ?? null,
            address: activity.address ?? null,
            imageUrl: activity.imageUrl ?? null,
            images: activity.imageUrl ? [activity.imageUrl] : [],
            type: activity.category ?? null,
            description: activity.description ?? null,
            websiteUrl: activity.websiteUrl ?? null,
            openingHoursText: null,
            reviews: null,
        });
    };

    // Scroll focused activity card into view when a map pin is clicked
    useEffect(() => {
        if (!focusedPlaceId) return;
        const el = cardRefs.current.get(focusedPlaceId);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [focusedPlaceId]);

    // Clear search when input emptied; reset load-more when keyword changes
    useEffect(() => {
        setHasLoadedMore(false);
        if (!searching) {
            setSearchActivities([]);
            textSearch.setResults([]);
        }
    }, [searching, textSearch]);

    const handleLoadMore = async () => {
        if (trip.lat && trip.lng) {
            await textSearch.searchByText(searching, SEARCH_FIELDS, { lat: trip.lat, lng: trip.lng }, 20);
            setHasLoadedMore(true);
        }
    };

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
        const already = wantToGoActivities.some(a => a.id === activity.id);

        // Update local state (pure updater — no side effects inside)
        setWantToGoActivities(prev =>
            already ? prev.filter(a => a.id !== activity.id) : [...prev, activity]
        );

        // Side effects outside the updater
        updateWantToGo(trip.id, activity.id, !already);
        if (!already) {
            setAnimateBadge(true);
            setTimeout(() => setAnimateBadge(false), 300);
        }
    };

    const isAdded = (id: number) => wantToGoActivities.some(a => a.id === id);
    const isSearchLoading = searching !== '' && (textSearch.isLoading || searchActivities.length === 0);
    const prompts = PROMPT_SUGGESTIONS(trip.dayCount ?? 3);

    return (
        <main className="relative h-full overflow-hidden bg-white">
        <div className="h-full overflow-y-auto">
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
                        <MapIcon className="w-4 h-4" /> View Itinerary
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
                                Results for <span className="text-indigo-600">&quot;{searching}&quot;</span>
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
                            <>
                                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                                    {searchActivities.map(activity => (
                                        <div key={activity.id} className="cursor-pointer" onClick={() => handleActivitySelect(activity)}>
                                            <TripActivityCard
                                                activity={activity}
                                                isAdded={isAdded(activity.id)}
                                                onToggle={() => toggleWantToGo(activity)}
                                            />
                                        </div>
                                    ))}
                                </div>
                                {!hasLoadedMore && (
                                    <div className="flex justify-center pt-2">
                                        <button
                                            onClick={handleLoadMore}
                                            disabled={textSearch.isLoading}
                                            className="flex items-center gap-2 px-6 py-2.5 rounded-full border border-slate-200 text-sm font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-all disabled:opacity-50"
                                        >
                                            {textSearch.isLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                                            {textSearch.isLoading ? 'Loading…' : 'Load more'}
                                        </button>
                                    </div>
                                )}
                            </>
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
                            onSelect={handleActivitySelect}
                        />

                        <DiscoverySection
                            icon={<UtensilsCrossed className="w-5 h-5 text-rose-500" />}
                            title="Must-Try Restaurants"
                            activities={restaurantActivities}
                            isLoading={restaurants.isLoading || !restaurants.isLoaded}
                            isAdded={isAdded}
                            onToggle={toggleWantToGo}
                            onSelect={handleActivitySelect}
                        />

                        <DiscoverySection
                            icon={<PartyPopper className="w-5 h-5 text-violet-500" />}
                            title="Events During Your Trip"
                            activities={eventActivities}
                            isLoading={events.isLoading || !events.isLoaded}
                            isAdded={isAdded}
                            onToggle={toggleWantToGo}
                            onSelect={handleActivitySelect}
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

            <DayPlanner
                isOpen={isListOpen}
                onClose={() => setIsListOpen(false)}
                activities={wantToGoActivities}
                dayCount={trip.dayCount ?? 1}
                onRemove={(id: number) => {
                    const act = wantToGoActivities.find(a => a.id === id);
                    if (act) toggleWantToGo(act);
                }}
                onGenerate={(acts, dayAssignments) => onGenerate(acts, undefined, dayAssignments)}
                pace={pace} onPaceChange={onPaceChange}
                budget={budget} onBudgetChange={onBudgetChange}
                startTime={startTime} onStartTimeChange={onStartTimeChange}
                currentItinerary={currentItinerary}
            />

        </div>

            {/* Place detail panel — slides in from the right, anchored to the visible panel */}
            <AnimatePresence>
                {selectedPlace && (
                    <>
                        <motion.div
                            className="absolute inset-0 z-10 bg-black/20"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => { setSelectedPlace(null); onFocusPlace?.(null); }}
                        />
                        <motion.div
                            className="absolute inset-y-0 right-0 z-20"
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 250 }}
                        >
                            <PlaceDetailPanel
                                place={selectedPlace}
                                onClose={() => { setSelectedPlace(null); onFocusPlace?.(null); }}
                                isAdded={[...attractionActivities, ...restaurantActivities, ...eventActivities, ...searchActivities]
                                  .some(a => a.googlePlaceId === selectedPlace.id && isAdded(a.id))}
                                onToggle={() => {
                                  const activity = [...attractionActivities, ...restaurantActivities, ...eventActivities, ...searchActivities]
                                    .find(a => a.googlePlaceId === selectedPlace.id);
                                  if (activity) toggleWantToGo(activity);
                                }}
                            />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </main>
    );
};

// ─── Discovery section ─────────────────────────────────────────────────────────
function DiscoverySection({
    icon, title, activities, isLoading, isAdded, onToggle, onSelect,
}: {
    icon: React.ReactNode;
    title: string;
    activities: Activity[];
    isLoading: boolean;
    isAdded: (id: number) => boolean;
    onToggle: (activity: Activity) => void;
    onSelect: (activity: Activity) => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const scroll = (dir: 'left' | 'right') => {
        scrollRef.current?.scrollBy({ left: dir === 'left' ? -1040 : 1040, behavior: 'smooth' });
    };

    return (
        <section className="space-y-4">
            <div className="flex justify-between items-center text-zinc-800">
                <div className="flex items-center gap-2">
                    {icon}
                    <h2 className="text-xl font-bold">{title}</h2>
                </div>
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
                {isLoading || activities.length === 0
                    ? <HighlightSkeletons />
                    : activities.map(activity => (
                        <div key={activity.id} onClick={() => onSelect(activity)}>
                            <HighlightActivityCard
                                activity={activity}
                                isAdded={isAdded(activity.id)}
                                onToggle={() => onToggle(activity)}
                            />
                        </div>
                    ))
                }
            </div>
        </section>
    );
}
