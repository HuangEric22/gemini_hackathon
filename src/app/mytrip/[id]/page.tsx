'use client'

import { useState, useEffect, useCallback, use } from 'react';
import { db } from "@/db";
import { type Trip, trips} from "@/db/schema";
import { eq } from "drizzle-orm";
import { Panel, Group, Separator} from 'react-resizable-panels';
import { MyTripFeed } from '@/components/features/mytrip/mytrip-feed'
import { ResizeSeparator } from '@/components/layout/resizeable-separator';
import { MapArea } from '@/components/features/map/map';
import { getTripById } from '@/app/actions/crud-trip'

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredActivityId, setHoveredActivityId] = useState<string | null>(null);
  const [wantToGoList, setWantToGoList] = useState<string[]>([]);

  const handleAddToWantToGo = (activityId: string) => {
    setWantToGoList(prev => [...prev, activityId]);
  };

  // Define function to query trip info
  const loadTripData = useCallback(async () => {
  if (!id) return;
  
  setIsLoading(true);
  try {
    const result = await getTripById(Number(id));
    if (result) setTrip(result);
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

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden">
      <Group orientation="horizontal" className="w-full">
        {/* Left Panel: Discovery Feed */}
        <Panel defaultSize={60} minSize={30}>
          {trip ? (
          <MyTripFeed 
            trip={trip} 
            onHover={setHoveredActivityId}
            onAdd={handleAddToWantToGo}
            wantToGoCount={wantToGoList.length}
          />
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
