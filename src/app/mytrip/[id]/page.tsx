'use client'

import { useState, useEffect, useCallback, useMemo, use } from 'react';
import { type Trip, Activity, ItineraryItem} from "@/db/schema";
import { Panel, Group} from 'react-resizable-panels';
import { AnimatePresence, motion } from 'framer-motion';
import { MyTripFeed } from '@/components/features/mytrip/browsing-workspace'
import { ResizeSeparator } from '@/components/layout/resizeable-separator';
import { MapArea } from '@/components/features/map/map';
import { PlaceDetailPanel } from '@/components/features/map/place-detail-panel';
import { getTripById, getTripSelectionsByTripId, getItineraryItemsByTripId, saveGeneratedItinerary, saveTripSelections, updateWantToGo } from '@/app/actions/crud-trip'
import { shadowSaveActivities } from '@/app/actions/shadow-save-activities'
import { ItineraryWorkspace } from '@/components/features/mytrip/itinerary-workspace'
import { itineraryService } from '@/hooks/itinerary-generate';
import { regenerateDayAction } from '@/app/actions/regenerate-day';
import { useDirections } from '@/hooks/use-directions';
import { ItineraryGenerationResponse, ItineraryMapMarker, MapPlace } from '@/shared';

function hydrateItinerary(items: ItineraryItem[]): ItineraryGenerationResponse {
  const daysMap: Record<number, ItineraryGenerationResponse['days'][number]> = {};

  items.forEach(item => {
    if (!daysMap[item.dayNumber]) {
      daysMap[item.dayNumber] = { day_number: item.dayNumber, brief_description: "", items: [] };
    }
    daysMap[item.dayNumber].items.push({
      title: item.title ?? '',
      description: item.description ?? undefined,
      start_time: item.startTime ?? '',
      end_time: item.endTime ?? '',
      type: item.type ?? 'activity',
      commute_info: item.commuteInfo ?? undefined,
      commute_seconds: item.commuteSeconds ?? undefined,
      is_suggested: item.isSuggested ?? false,
      lat: item.lat ?? undefined,
      lng: item.lng ?? undefined,
    });
  });

  return { days: Object.values(daysMap) };
}

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [viewMode, setViewMode] = useState<'browsing' | 'itinerary'>('browsing')
  const [, setHoveredActivityId] = useState<number | null>(null);
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null);
  const [focusedItineraryMarkerId, setFocusedItineraryMarkerId] = useState<string | null>(null);
  const [highlightedLegIndices, setHighlightedLegIndices] = useState<number[]>([]);
  const [visibleDays, setVisibleDays] = useState<number[]>([1]);
  const [mapPlaces, setMapPlaces] = useState<MapPlace[]>([]);

  // Data states
  const [, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState<string>('Building your itinerary...');
  const [regeneratingDay, setRegeneratingDay] = useState<number | null>(null);
  // Trip generation preferences — shared between DayPlanner and ItineraryWorkspace
  const [pace, setPace] = useState<'relaxed' | 'moderate' | 'packed'>('moderate');
  const [budget, setBudget] = useState<'budget' | 'moderate' | 'luxury'>('moderate');
  const [startTime, setStartTime] = useState<'7:00 AM' | '9:00 AM' | '11:00 AM'>('9:00 AM');
  const [selectedActivities, setSelectedActivities] = useState<Activity[]>([]); // From want-to-go browser
  const [currentItinerary, setCurrentItinerary] = useState<ItineraryGenerationResponse | null>(null); // From DB
  const [detailPlace, setDetailPlace] = useState<MapPlace | null>(null);

  // Transport hooks
  const { legTransports, computeRoutes, isComputing: isComputingRoutes } = useDirections();

  // Define function to query trip info
  const loadTripData = useCallback(async () => {
  if (!id) return;
  
  setIsLoading(true);
  try {
    const [tripRes, selectRes, itinRes] = await Promise.all([
        getTripById(Number(id)),
        getTripSelectionsByTripId(Number(id)),
        getItineraryItemsByTripId(Number(id))
      ]);

    if (tripRes) setTrip(tripRes);
    setSelectedActivities(selectRes || []);
    if (itinRes.length > 0) {
        setCurrentItinerary(hydrateItinerary(itinRes));
    }
  } catch (err) {
    console.error(err);
  } finally {
    setIsLoading(false);
  }
}, [id]); // change the fn if 'id' changes
  
  // Trigger trip info querying fn
  useEffect(() => {
    loadTripData();
  }, [loadTripData]); // runs on mount, and when fn changes

  // Map trip commute preference to Google Maps travel mode
  const transportMode = trip?.commute === 'public' ? 'TRANSIT' : 'DRIVE';
  const [isSaved, setIsSaved] = useState(false);

  // Auto-compute routes when itinerary is loaded from DB (not freshly generated)
  useEffect(() => {
    if (!currentItinerary || isGenerating || !selectedActivities.length) return;

    const allItems = currentItinerary.days.flatMap(d =>
      d.items.filter(i => i.type !== 'commute' && i.type !== 'alternative'),
    );

    const findAct = (title: string) =>
      selectedActivities.find(a => a.name === title) ??
      selectedActivities.find(a => a.name.toLowerCase() === title.toLowerCase()) ??
      selectedActivities.find(a =>
        a.name.toLowerCase().includes(title.toLowerCase()) ||
        title.toLowerCase().includes(a.name.toLowerCase()),
      );

    const getCoords = (item: typeof allItems[0]) => {
      const act = findAct(item.title);
      if (act) return { lat: act.lat, lng: act.lng };
      if (item.lat && item.lng) return { lat: item.lat, lng: item.lng };
      return null;
    };

    const legs = [];
    for (let i = 0; i < allItems.length - 1; i++) {
      const curr = allItems[i];
      const next = allItems[i + 1];
      const currCoords = getCoords(curr);
      const nextCoords = getCoords(next);
      if (currCoords && nextCoords) {
        legs.push({
          originTitle: curr.title,
          destTitle: next.title,
          origin: currCoords,
          destination: nextCoords,
        });
      }
    }
    if (legs.length > 0 && legTransports.length === 0) {
      computeRoutes(legs);
    }
  }, [currentItinerary, selectedActivities]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reorder handler for drag-and-drop in itinerary workspace
  const handleReorder = async (updated: ItineraryGenerationResponse) => {
    setCurrentItinerary(updated);
    await saveGeneratedItinerary(Number(id), updated);

    // Recompute routes for the new order
    const allItems = updated.days.flatMap(d =>
      d.items.filter(i => i.type !== 'commute' && i.type !== 'alternative'),
    );

    const findAct = (title: string) =>
      selectedActivities.find(a => a.name === title) ??
      selectedActivities.find(a => a.name.toLowerCase() === title.toLowerCase()) ??
      selectedActivities.find(a =>
        a.name.toLowerCase().includes(title.toLowerCase()) ||
        title.toLowerCase().includes(a.name.toLowerCase()),
      );

    const getCoords = (item: typeof allItems[0]) => {
      const act = findAct(item.title);
      if (act) return { lat: act.lat, lng: act.lng };
      if (item.lat && item.lng) return { lat: item.lat, lng: item.lng };
      return null;
    };

    const legs = [];
    for (let i = 0; i < allItems.length - 1; i++) {
      const curr = allItems[i];
      const next = allItems[i + 1];
      const currCoords = getCoords(curr);
      const nextCoords = getCoords(next);
      if (currCoords && nextCoords) {
        legs.push({
          originTitle: curr.title,
          destTitle: next.title,
          origin: currCoords,
          destination: nextCoords,
        });
      }
    }
    if (legs.length > 0) computeRoutes(legs);
  };

  const handleSave = async () => {
    if (!currentItinerary) return;
    try {
      await saveGeneratedItinerary(Number(id), currentItinerary);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save itinerary:', err);
    }
  };

  const handleGenerate = async (
    activities: Activity[],
    preference?: string,
    dayAssignments?: Record<string, Activity[]>,
  ) => {
    if (activities.length === 0) {
      alert("Please select at least one activity before generating.");
      return;
    }

    setIsGenerating(true);
    setSelectedActivities(activities); // Keep in sync for regeneration
    setViewMode('itinerary');

    try {
      // 0. Persist selections so they survive page reloads
      saveTripSelections(Number(id), activities.map(a => a.id));

      // 1. Build day assignment hints for the AI
      const dayAssignmentHints = dayAssignments
        ? Object.fromEntries(
            Object.entries(dayAssignments).map(([key, acts]) => [key, acts.map(a => a.name)])
          )
        : undefined;

      // 2. Generate itinerary via server action
      // (travel matrix + planning phase now run in parallel server-side)
      const result = await itineraryService.generate(
        activities,
        trip?.dayCount || 1,
        currentItinerary,
        preference,
        transportMode,
        dayAssignmentHints,
        pace,
        budget,
        startTime,
        (msg) => setGeneratingStatus(msg),
      );
      setCurrentItinerary(result);
      await saveGeneratedItinerary(Number(id), result);

      // 3. Compute detailed directions for transport comparison UI
      // Include ALL non-commute items (user-selected + AI-suggested)
      const allItems = result.days.flatMap(d =>
        d.items.filter(i => i.type !== 'commute'),
      );

      // Fuzzy match: exact name, then case-insensitive, then includes
      const findActivity = (title: string) =>
        activities.find(a => a.name === title) ??
        activities.find(a => a.name.toLowerCase() === title.toLowerCase()) ??
        activities.find(a =>
          a.name.toLowerCase().includes(title.toLowerCase()) ||
          title.toLowerCase().includes(a.name.toLowerCase()),
        );

      // Get coordinates: use user-selected activity coords, or AI-provided lat/lng for suggestions
      const getCoords = (item: typeof allItems[0]) => {
        const act = findActivity(item.title);
        if (act) return { lat: act.lat, lng: act.lng };
        if (item.lat && item.lng) return { lat: item.lat, lng: item.lng };
        return null;
      };

      const legs = [];
      for (let i = 0; i < allItems.length - 1; i++) {
        const curr = allItems[i];
        const next = allItems[i + 1];
        const currCoords = getCoords(curr);
        const nextCoords = getCoords(next);
        if (currCoords && nextCoords) {
          legs.push({
            originTitle: curr.title,
            destTitle: next.title,
            origin: currCoords,
            destination: nextCoords,
          });
        }
      }
      if (legs.length > 0) computeRoutes(legs);

    } catch (err) {
      console.error('Generation error:', err);
      alert("Failed to generate itinerary. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateDay = async (dayNumber: number, preference?: string) => {
    if (!currentItinerary || !selectedActivities.length) return;
    setRegeneratingDay(dayNumber);
    try {
      const result = await regenerateDayAction({
        currentItinerary,
        dayNumber,
        activities: selectedActivities.map(a => ({
          name: a.name,
          lat: a.lat,
          lng: a.lng,
          category: a.category ?? null,
          openingHours: a.openingHours,
          averageDuration: a.averageDuration,
        })),
        transportMode,
        preference,
      });
      setCurrentItinerary(result);
      await saveGeneratedItinerary(Number(id), result);
    } catch (err) {
      console.error('[RegenDay] Failed:', err);
    } finally {
      setRegeneratingDay(null);
    }
  };

  // Build itinerary markers + visible leg indices for the map, filtered by expanded days
  const { filteredMarkers: itineraryMarkers, visibleLegIndices } = useMemo(() => {
    if (!currentItinerary || viewMode !== 'itinerary') return { filteredMarkers: [] as ItineraryMapMarker[], visibleLegIndices: new Set<number>() };

    const findActivity = (title: string) =>
      selectedActivities.find(a => a.name === title) ??
      selectedActivities.find(a => a.name.toLowerCase() === title.toLowerCase()) ??
      selectedActivities.find(a =>
        a.name.toLowerCase().includes(title.toLowerCase()) ||
        title.toLowerCase().includes(a.name.toLowerCase()),
      );

    const markers: ItineraryMapMarker[] = [];
    const visLegs = new Set<number>();
    let globalOrder = 0;
    let globalLegIdx = 0;

    for (let dayIndex = 0; dayIndex < currentItinerary.days.length; dayIndex++) {
      const day = currentItinerary.days[dayIndex];
      const filtered = day.items.filter(i => i.type !== 'commute' && i.type !== 'alternative');
      const isVisible = visibleDays.includes(day.day_number);

      // Cross-day leg
      const crossDayLegIdx = (dayIndex > 0 && filtered.length > 0) ? globalLegIdx++ : -1;

      let dayOrder = 0;
      for (const item of filtered) {
        dayOrder++;
        globalOrder++;

        if (isVisible) {
          const act = findActivity(item.title);
          const lat = act?.lat ?? item.lat;
          const lng = act?.lng ?? item.lng;
          if (lat != null && lng != null) {
            markers.push({
              id: `itin-${day.day_number}-${dayOrder}`,
              title: item.title,
              lat,
              lng,
              isSuggested: item.is_suggested === true,
              dayNumber: day.day_number,
              order: globalOrder,
              googlePlaceId: act?.googlePlaceId ?? null,
              imageUrl: act?.imageUrl ?? null,
              description: act?.description ?? item.description ?? null,
            });
          }
        }
      }

      // Within-day legs
      for (let i = 0; i < filtered.length - 1; i++) {
        if (isVisible) visLegs.add(globalLegIdx);
        globalLegIdx++;
      }

      // Mark cross-day arriving leg as visible if this day is visible
      if (isVisible && crossDayLegIdx >= 0) visLegs.add(crossDayLegIdx);
    }
    return { filteredMarkers: markers, visibleLegIndices: visLegs };
  }, [currentItinerary, viewMode, visibleDays, selectedActivities]);

  const mapCenter = useMemo(
    () => ({ lat: trip?.lat ?? 35.6762, lng: trip?.lng ?? 139.6503 }),
    [trip?.lat, trip?.lng],
  );

  // Track which Google Place IDs are in the selections (for the map "Add to Trip" button)
  const addedPlaceIds = new Set(
    selectedActivities.filter(a => a.googlePlaceId).map(a => a.googlePlaceId!)
  );

  // Add/remove a POI from the trip via the map panel
  const handleMapAddToTrip = async (place: MapPlace) => {
    // Check if already added
    const existing = selectedActivities.find(a => a.googlePlaceId === place.id);
    if (existing) {
      // Remove it
      setSelectedActivities(prev => prev.filter(a => a.googlePlaceId !== place.id));
      await updateWantToGo(Number(id), existing.id, false);
      return;
    }

    // Shadow-save as an Activity, then add to selections
    try {
      const saved = await shadowSaveActivities([{
        googlePlaceId: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        address: place.address ?? null,
        city: trip?.destination ?? '',
        category: place.category ?? 'activity',
        rating: place.rating ?? null,
        imageUrl: place.imageUrl ?? null,
        description: place.description ?? null,
        openingHours: null,
        priceLevel: null,
        websiteUrl: place.websiteUrl ?? null,
      }]);
      if (saved.length > 0) {
        setSelectedActivities(prev => [...prev, saved[0]]);
        await updateWantToGo(Number(id), saved[0].id, true);
      }
    } catch (err) {
      console.error('Failed to add place to trip:', err);
    }
  };

  // Remove an item from the generated itinerary (and persist)
  const handleRemoveItem = async (dayNumber: number, itemIndex: number) => {
    if (!currentItinerary) return;

    const updated: ItineraryGenerationResponse = {
      days: currentItinerary.days.map(day => {
        if (day.day_number !== dayNumber) return day;
        const nonCommute = day.items.filter(i => i.type !== 'commute');
        const targetTitle = nonCommute[itemIndex]?.title;
        if (!targetTitle) return day;
        // Remove the target item AND any adjacent commute items referencing it
        return {
          ...day,
          items: day.items.filter(i => {
            if (i.type !== 'commute' && i.title === targetTitle) return false;
            return true;
          }),
        };
      }).filter(day => day.items.some(i => i.type !== 'commute')), // drop empty days
    };

    setCurrentItinerary(updated);
    await saveGeneratedItinerary(Number(id), updated);
  };

  // Swap an alternative item into the primary slot
  const handleSwapAlternative = async (dayNumber: number, altIndex: number, primaryIndex: number) => {
    if (!currentItinerary) return;

    const updated: ItineraryGenerationResponse = {
      days: currentItinerary.days.map(day => {
        if (day.day_number !== dayNumber) return day;
        const items = [...day.items];
        const alt = items[altIndex];
        const primary = items[primaryIndex];
        if (!alt || !primary) return day;

        // Swap: primary becomes alternative, alt becomes the primary's type
        items[altIndex] = { ...primary, type: 'alternative', is_suggested: true };
        items[primaryIndex] = { ...alt, type: primary.type, is_suggested: alt.is_suggested };

        return { ...day, items };
      }),
    };

    setCurrentItinerary(updated);
    await saveGeneratedItinerary(Number(id), updated);
  };

  const handleTransitionToItinerary = (currentSelections: Activity[]) => {
    setSelectedActivities(currentSelections)
    setViewMode('itinerary');
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden">
      <Group orientation="horizontal" className="w-full">
        {/* Left Panel: Discovery Feed */}
        <Panel defaultSize={60} minSize={30}>
          <div className="relative h-full overflow-hidden">
            {trip ? (
              viewMode === 'browsing' ? (
                <MyTripFeed
                  trip={trip}
                  initialSelections={selectedActivities}
                  onHover={setHoveredActivityId}
                  onGenerate={handleGenerate}
                  onViewItinerary={handleTransitionToItinerary}
                  onPlacesChange={setMapPlaces}
                  focusedPlaceId={focusedPlaceId}
                  onFocusPlace={setFocusedPlaceId}
                  currentItinerary={currentItinerary}
                  pace={pace} onPaceChange={setPace}
                  budget={budget} onBudgetChange={setBudget}
                  startTime={startTime} onStartTimeChange={setStartTime}
                />
              ) : (
                <ItineraryWorkspace
                  trip={trip}
                  selections={selectedActivities}
                  currentItinerary={currentItinerary}
                  legTransports={legTransports}
                  isComputingRoutes={isComputingRoutes}
                  onBack={()=>setViewMode('browsing')}
                  onGenerate={handleGenerate}
                  onRefreshData={loadTripData}
                  onRemoveItem={handleRemoveItem}
                  onSwapAlternative={handleSwapAlternative}
                  onSave={handleSave}
                  isSaved={isSaved}
                  onActivityClick={setFocusedItineraryMarkerId}
                  onHoverActivity={setHighlightedLegIndices}
                  onExpandedDaysChange={setVisibleDays}
                  isGenerating={isGenerating}
                  generatingStatus={generatingStatus}
                  onRegenerateDay={handleRegenerateDay}
                  regeneratingDay={regeneratingDay}
                  pace={pace} onPaceChange={setPace}
                  budget={budget} onBudgetChange={setBudget}
                  startTime={startTime} onStartTimeChange={setStartTime}
                  onReorder={handleReorder}
                />
              )
            ) : (<div>Loading feed...</div>)}

            {/* Place detail panel — slides in from the right over the itinerary list */}
            <AnimatePresence>
              {detailPlace && (
                <>
                  <motion.div
                    className="absolute inset-0 z-10 bg-black/20"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => { setDetailPlace(null); setFocusedItineraryMarkerId(null); }}
                  />
                  <motion.div
                    className="absolute inset-y-0 right-0 z-20"
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 30, stiffness: 250 }}
                  >
                    <PlaceDetailPanel
                      place={detailPlace}
                      onClose={() => { setDetailPlace(null); setFocusedItineraryMarkerId(null); }}
                      variant="panel"
                      isAdded={addedPlaceIds.has(detailPlace.id)}
                      onToggle={() => handleMapAddToTrip(detailPlace)}
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </Panel>

        {/* Resize Handle */}
        <ResizeSeparator/>

        {/* Right Panel: Map */}
        <Panel defaultSize={40} minSize={20}>
          <MapArea
            center={mapCenter}
            places={mapPlaces}
            focusedPlaceId={focusedPlaceId}
            onPinClick={setFocusedPlaceId}
            routeLegs={viewMode === 'itinerary' ? legTransports.filter((_, i) => visibleLegIndices.has(i)) : []}
            itineraryMarkers={itineraryMarkers}
            focusedItineraryMarkerId={focusedItineraryMarkerId}
            highlightedLegIndices={highlightedLegIndices}
            onPlaceDetail={place => setDetailPlace(place)}
          />
        </Panel>
      </Group>
    </div>
  );
}
