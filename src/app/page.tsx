'use client'

import { useState, useEffect } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { DiscoveryFeed } from '@/components/features/discovery/discovery-feed';
import { MapArea } from '@/components/features/map/map';
import { ResizeSeparator } from '@/components/layout/resizeable-separator';
import { Place } from '@/shared'

export default function Home() {
  const [isSearching, setIsSearching] = useState(false);
  // const DEFAULT_PLACE: Place = {
  //   name: "Los Angeles",
  //   lat: 34.0522,
  //   lng: -118.2437,
  //   id: "ChIJE9on3F3HwoAR9AhGJW_fL-I"
  // };

  // set default to Kyoto but can change to later get dynamically
  const DEFAULT_PLACE: Place = {
    name: "Kyoto",
    lat: 35.0116,
    lng: 135.7681,
    id: "ChIJL6_q594_AWAR3Y3YpvVq9Jk",
  }

  const [destination, setDestination] = useState<Place | null>(DEFAULT_PLACE);
  const cityName = destination?.name || "Select a City";

  const handleSearch = async (destination: Place) => {
    setIsSearching(true);
    setDestination(destination);
    setIsSearching(false);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Group orientation='horizontal' className='w-full'>

        <Panel minSize="30%" defaultSize="60%"><DiscoveryFeed
          onSearch={handleSearch}
          isSearching={isSearching}
          cityName={cityName}
          location={destination} /></Panel>
        <ResizeSeparator />
        <Panel minSize="20%" defaultSize="30%" ><MapArea /></Panel>

      </Group>
    </div>
  );
};
