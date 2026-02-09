'use client'

import { useState, useEffect, useCallback, use } from 'react';
import { type Trip, Activity, ItineraryItem} from "@/db/schema";
import { Panel, Group} from 'react-resizable-panels';
import { MyTripFeed } from '@/components/features/mytrip/browsing-workspace'
import { ResizeSeparator } from '@/components/layout/resizeable-separator';
import { MapArea } from '@/components/features/map/map';
import { getTripById, getTripSelectionsByTripId, getItineraryItemsByTripId, saveGeneratedItinerary } from '@/app/actions/crud-trip'
import { ItineraryWorkspace } from '@/components/features/mytrip/itinerary-workspace'
import { itineraryService } from '@/hooks/itinerary-generate';
import { ItineraryGenerationResponse } from '@/shared';

function hydrateItinerary(items: ItineraryItem[]): ItineraryGenerationResponse {
  const daysMap: Record<number, any> = {};
  
  items.forEach(item => {
    if (!daysMap[item.dayNumber]) {
      daysMap[item.dayNumber] = { day_number: item.dayNumber, brief_description: "", items: [] };
    }
    daysMap[item.dayNumber].items.push({
      title: item.title,
      start_time: item.startTime,
      end_time: item.endTime,
      type: item.type
    });
  });

  return { days: Object.values(daysMap) };
}

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [viewMode, setViewMode] = useState<'browsing' | 'itinerary'>('browsing')
  const [hoveredActivityId, setHoveredActivityId] = useState<number | null>(null);

  // Data states
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedActivities, setSelectedActivities] = useState<Activity[]>([]); // From want-to-go browser
  const [currentItinerary, setCurrentItinerary] = useState<ItineraryGenerationResponse | null>(null); // From DB

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

  const handleGenerate = async (activities: Activity[], preference?: string) => {
    setIsGenerating(true);
    setViewMode('itinerary'); // Switch view immediately to show loading
    
    try {
      const result = await itineraryService.generate(
        activities,
        trip?.dayCount || 1,
        currentItinerary, // Pass current plan for refinement
        preference
      );
      setCurrentItinerary(result);
      saveGeneratedItinerary(Number(id), result);

    } catch (err) {
      alert("Failed to generate itinerary. Is the Python server running?");
    } finally {
      setIsGenerating(false);
    }
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
          {trip ? (
            viewMode === 'browsing' ? (
              <MyTripFeed 
              trip={trip} 
              onHover={setHoveredActivityId}
              onGenerate={handleGenerate}
              onViewItinerary={handleTransitionToItinerary}
          />
            ) : (
              <ItineraryWorkspace
                trip={trip}
                selections={selectedActivities}
                currentItinerary={currentItinerary}
                onBack={()=>setViewMode('browsing')}
                onGenerate={handleGenerate}
                onRefreshData={loadTripData}
              />
            )
          ) : (<div>Loading feed...</div>)}
        </Panel>

        {/* Resize Handle */}
        <ResizeSeparator/>

        {/* Right Panel: Map */}
        <Panel defaultSize={40} minSize={20}>
          <MapArea/>
        </Panel>
      </Group>
    </div>
  );
}
