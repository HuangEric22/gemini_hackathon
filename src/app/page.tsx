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
    // <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
    //   <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
    //     <SearchCard onSearch={handleSearch} isLoading={isSearching} />
    //   </main>
    // </div>
    <div className="flex h-screen w-full overflow-hidden">
      <Group orientation='horizontal' className='w-full'>

      <Panel><Sidebar/></Panel>
      <ResizeSeparator/>
      <Panel><DiscoveryFeed onSearch={handleSearch} isSearching={isSearching} cityName='Los Angeles'/></Panel>
      <ResizeSeparator/>
      <Panel><MapArea/></Panel>

    </Group>
    </div>
  );
}
