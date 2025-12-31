import React, { useState, useCallback } from 'react';
import { Search, Loader2, Plane, Sparkles, Utensils, Camera, Bed, Map, Briefcase } from 'lucide-react';
import { searchPlacesWithGemini } from './services/geminiService';
import { Place, Category, SearchParams } from './types';
import { PlaceCard } from './components/PlaceCard';
import { ItineraryList } from './components/ItineraryList';

type View = 'explore' | 'trip';

function App() {
  const [currentView, setCurrentView] = useState<View>('explore');
  const [searchParams, setSearchParams] = useState<SearchParams>({
    destination: '',
    interests: '',
    budget: 'moderate',
  });
  
  const [activeTab, setActiveTab] = useState<Category>('visit');
  const [results, setResults] = useState<Place[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<Place[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const getPlaceholderImage = (seed: string, category: Category) => {
    const seedNum = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `https://picsum.photos/seed/${seedNum}/400/300`;
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchParams.destination) return;

    // Dismiss keyboard on mobile
    (document.activeElement as HTMLElement)?.blur();

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setResults([]); 

    try {
      const rawPlaces = await searchPlacesWithGemini(
        searchParams.destination,
        activeTab,
        searchParams.interests,
        searchParams.budget
      );

      const processedPlaces: Place[] = rawPlaces.map((p) => ({
        ...p,
        id: crypto.randomUUID(),
        imageUrl: getPlaceholderImage(p.name, activeTab)
      }));

      setResults(processedPlaces);
    } catch (err) {
      setError("Failed to fetch recommendations. Please check your API key.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = useCallback((category: Category) => {
    setActiveTab(category);
    setResults([]); 
    setHasSearched(false);
  }, []);

  const addToItinerary = (place: Place) => {
    if (!itinerary.find(i => i.name === place.name)) {
      setItinerary([...itinerary, place]);
      // Optional: Add haptic feedback pattern here if using native bridge, 
      // for web we just show visual state change
    }
  };

  const removeFromItinerary = (id: string) => {
    setItinerary(itinerary.filter(i => i.id !== id));
  };

  return (
    <div className="h-screen w-full bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      
      {/* Top Navigation Bar (Mobile Header) */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 pt-safe">
        <div className="px-4 h-14 flex items-center justify-center relative">
          <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
            {currentView === 'explore' ? 'Wanderlust' : 'My Trip'}
          </h1>
          {currentView === 'trip' && itinerary.length > 0 && (
             <span className="absolute right-4 text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
               ${itinerary.reduce((acc, item) => acc + item.priceLevel.length * 25, 0)}
             </span>
          )}
        </div>
      </header>

      {/* Main Scrollable Content Area */}
      <main className="flex-1 overflow-y-auto pb-24 overscroll-none">
        <div className="px-4 py-6 max-w-2xl mx-auto">
          
          {currentView === 'explore' ? (
            <div className="flex flex-col space-y-6">
              
              {/* Search Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                <form onSubmit={handleSearch} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Destination</label>
                    <input
                      type="text"
                      placeholder="City, Country"
                      className="w-full mt-1 border-b-2 border-slate-200 py-2 text-lg font-medium text-slate-900 placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none bg-transparent transition-colors"
                      value={searchParams.destination}
                      onChange={(e) => setSearchParams(prev => ({ ...prev, destination: e.target.value }))}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">I like...</label>
                    <input
                      type="text"
                      placeholder="Museums, Tacos, Jazz..."
                      className="w-full mt-1 border-b-2 border-slate-200 py-2 text-base text-slate-900 placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none bg-transparent"
                      value={searchParams.interests}
                      onChange={(e) => setSearchParams(prev => ({ ...prev, interests: e.target.value }))}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                     <div className="flex bg-slate-100 rounded-lg p-1">
                        {['budget', 'moderate', 'luxury'].map((lvl) => (
                           <button
                             key={lvl}
                             type="button"
                             onClick={() => setSearchParams(p => ({...p, budget: lvl}))}
                             className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
                               searchParams.budget === lvl ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                             }`}
                           >
                             {lvl}
                           </button>
                        ))}
                     </div>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={isLoading || !searchParams.destination}
                    className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5 mr-2" />}
                    {isLoading ? 'Searching...' : 'Find Places'}
                  </button>
                </form>
              </div>

              {/* Pills / Tabs */}
              <div className="flex space-x-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                {[
                  { id: 'visit', icon: Camera, label: 'Sights' },
                  { id: 'food', icon: Utensils, label: 'Food' },
                  { id: 'stay', icon: Bed, label: 'Hotels' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id as Category)}
                    className={`flex items-center px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all shadow-sm ${
                      activeTab === tab.id
                        ? 'bg-slate-900 text-white transform scale-105'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    <tab.icon className="w-4 h-4 mr-2" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Results List */}
              <div className="space-y-4 min-h-[300px]">
                {error && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-xl text-center text-sm">
                    {error}
                  </div>
                )}

                {isLoading && (
                  <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500" />
                    <p className="text-sm">Curating recommendations...</p>
                  </div>
                )}

                {!isLoading && !error && results.length > 0 && (
                  results.map((place) => (
                    <PlaceCard
                      key={place.id}
                      place={place}
                      onAdd={addToItinerary}
                      isAdded={itinerary.some(i => i.name === place.name)}
                    />
                  ))
                )}

                {!isLoading && !hasSearched && (
                  <div className="py-12 text-center">
                    <Sparkles className="w-12 h-12 text-indigo-200 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">Start your search to see results</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // ITINERARY VIEW
            <div className="flex flex-col h-full">
              <ItineraryList items={itinerary} onRemove={removeFromItinerary} />
              
              {itinerary.length > 0 && (
                 <div className="mt-8 pb-4">
                    <button 
                      onClick={() => alert('Saved!')}
                      className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg active:scale-[0.98] transition-transform"
                    >
                        Save Trip
                    </button>
                    <p className="text-center text-xs text-slate-400 mt-4">
                        Total estimated cost based on price level
                    </p>
                 </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* iOS Bottom Tab Bar */}
      <nav className="bg-white/90 backdrop-blur-lg border-t border-slate-200 fixed bottom-0 w-full pb-safe z-50">
        <div className="flex justify-around items-center h-16">
          <button
            onClick={() => setCurrentView('explore')}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              currentView === 'explore' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Map className={`w-6 h-6 ${currentView === 'explore' ? 'fill-current' : ''}`} strokeWidth={currentView === 'explore' ? 2 : 1.5} />
            <span className="text-[10px] font-medium">Explore</span>
          </button>
          
          <button
            onClick={() => setCurrentView('trip')}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 relative ${
              currentView === 'trip' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className="relative">
                <Briefcase className={`w-6 h-6 ${currentView === 'trip' ? 'fill-current' : ''}`} strokeWidth={currentView === 'trip' ? 2 : 1.5} />
                {itinerary.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
                )}
            </div>
            <span className="text-[10px] font-medium">My Trip</span>
          </button>
        </div>
      </nav>
      
    </div>
  );
}

export default App;