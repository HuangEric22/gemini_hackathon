'use client'

import { useState } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { DiscoveryFeed } from '@/components/features/discovery/discovery-feed';
import { MapArea } from '@/components/features/map/map';
import { ResizeSeparator } from '@/components/layout/resizeable-separator';
import { Place } from '@/shared'

export default function Home() {

  const [isSearching, setIsSearching] = useState(false);
  const [cityName, setCityName] = useState("Los Angeles");

  const [destination, setDestination] = useState<Place | null>(null);

  const handleSearch = async (destination: Place) => {
    setIsSearching(true);
    setCityName(destination.name);
    setDestination(destination);
    setIsSearching(false);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Group orientation='horizontal' className='w-full'>

        <Panel minSize="30%" defaultSize="60%"><DiscoveryFeed onSearch={handleSearch} isSearching={isSearching} cityName={cityName} location={destination} /></Panel>
        <ResizeSeparator />
        <Panel minSize="20%" ><MapArea /></Panel>

      </Group>
    </div>
  );
}
