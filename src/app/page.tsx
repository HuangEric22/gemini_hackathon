'use client'

import { useState } from 'react';
import { Panel, Group, Separator} from 'react-resizable-panels';
import { Sidebar } from '@/components/layout/sidebar';
import { DiscoveryFeed } from '@/components/features/discovery/discovery-feed';
import { MapArea } from '@/components/features/map/map';
import { ResizeSeparator } from '@/components/layout/resizeable-separator';

export default function Home() {

  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (destination: string) => {
    setIsSearching(true);
    
    // Simulate an API call delay so you can see the loading state
    console.log("User searched for:", destination);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    alert(`Searching for ${destination}... (API would run here)`);
    setIsSearching(false);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Group orientation='horizontal' className='w-full'>

      <Panel minSize="10%" maxSize="20%" defaultSize="10%"><Sidebar/></Panel>
      <ResizeSeparator/>
      <Panel minSize="30%" defaultSize="60%"><DiscoveryFeed onSearch={handleSearch} isSearching={isSearching} cityName='Los Angeles'/></Panel>
      <ResizeSeparator/>
      <Panel minSize="20%" ><MapArea/></Panel>

    </Group>
    </div>
  );
}
