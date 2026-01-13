import { Search, ChevronRight } from 'lucide-react';
import { SearchCard } from '../search/search-card';

interface DiscoveryProps {
  cityName: string;
  onSearch: (val: string) => void;
  isSearching: boolean;
}

export function DiscoveryFeed({ cityName, onSearch, isSearching } : DiscoveryProps) {
  return (
    <main className="flex-1 w-full overflow-y-auto h-screen p-10 bg-white">
      <div className="max-w-2xl mx-auto space-y-10">
        
        {/* Header Section */}
        <header className="space-y-4">
          <h1 className="text-4xl font-bold font-sans">{cityName}</h1>
            <SearchCard onSearch={onSearch} isLoading={isSearching} />
        </header>

        {/* Blueprint Section Template */}
        <Section title="Things to do" />
        <Section title="Restaurants" />
        <Section title="Events" />

      </div>
    </main>
  );
}

function Section({ title }: { title: string }) {
  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center text-zinc-800">
        <h2 className="text-xl font-bold">{title}</h2>
        <ChevronRight className="text-zinc-300" />
      </div>
      {/* Horizontal Scroll Area */}
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="min-w-[200px] h-56 bg-zinc-100 rounded-3xl shrink-0" />
        ))}
      </div>
    </section>
  );
}