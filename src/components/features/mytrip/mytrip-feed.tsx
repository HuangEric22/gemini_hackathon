import React, { useEffect, useMemo, useState } from 'react'
import { type Trip, Activity } from '@/db/schema'
import { Search, ChevronRight, Edit3, Calendar, MapPin, ListPlus } from 'lucide-react';
import { SearchCard } from '../search/search-card';
import { TripActivityCard } from './trip-browsing-card';
import { MOCK_ACTIVITIES } from '@/db/mock-activities';

interface TripFeedProps {
    trip: Trip;
    onHover: (id: number | null) => void;
    onAdd: (id: number) => void;
    wantToGoCount: number;
}

export const MyTripFeed = ( {trip, onHover, onAdd, wantToGoCount} : TripFeedProps) => {
  const [selectedActivity, setSelectedActivity] = useState<number|null>(null);
  const [searching, setSearching] = useState('');
  const placeholderWords = [
    "Sightseeing",
    "Walking tours",
    "Day trips",
    "Museums",
    "Art galleries",
    "Historical landmarks",
    "Architecture",
    "Scenic views",
    "Photo spots",
    "Sunset spots",
    "Sunrise spots",
]
  const [wordIndex, setWordIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'activity' | 'restaurant'>('activity'); // Tab State

  useEffect(() => {
    if (searching !== '') return;

    const interval = setInterval(() => {
        setWordIndex((prev)=>(prev+1)%placeholderWords.length);
    }, 1500); //change every 1.5 seconds

    return ()=>clearInterval(interval);
  }, [searching === '']);

  //TODO: query activities table/call api
  const filteredActivities = useMemo(() => {
    return MOCK_ACTIVITIES.filter(act => act.category === activeTab);
  }, [activeTab]);

  return (
    <main className="h-full overflow-y-auto bg-white p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Trip Header */}
        <header className="space-y-6">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
                Trip - {trip.tripName}
              </h1>
              <div className="flex items-center gap-4 text-slate-500 text-sm font-medium">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {trip.startDate} - {trip.endDate}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {trip.destination}
                </span>
              </div>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-full text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm">
              <Edit3 className="w-4 h-4" />
              Edit Trip
            </button>
          </div>

        {/* Search Field */}
        <SearchCard onChange={(val)=>setSearching(val)} variant={'inline'} placeholder={`e.g. ${placeholderWords[wordIndex]}`}/>

        </header>

        {/* Floating Indicator for 'Want to Go' */}
        {wantToGoCount > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-bounce">
            <ListPlus className="w-5 h-5" />
            <span className="font-bold">{wantToGoCount} places added to 'Want to Go'</span>
          </div>
        )}

        <div className="pt-8 border-t border-slate-300 space-y-6"> 
            {/* Activities */}
            {/* --- MULTI-TAB SWITCHER --- */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl w-fit">
            <button
                onClick={() => setActiveTab('activity')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'activity' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
            >
                Things to Do
            </button>
            <button
                onClick={() => setActiveTab('restaurant')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'restaurant' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
            >
                Restaurants
            </button>
            </div>
            
            {/* Card List Area */}
            <div className="space-y-4 pb-20">
            <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {filteredActivities.map((activity) => (
            <TripActivityCard 
                key={activity.id}
                activity={activity}
                onHover={onHover}
                onAdd={onAdd}
                onClick={() => setSelectedActivity(activity.id)}
            />
            ))}
            </div>
            </div>
        </div>
      </div>

      {/* {selectedActivity && (
        <ActivityModal 
          activity={selectedActivity} 
          onClose={() => setSelectedActivity(null)} 
          onAdd={onAdd}
        />
      )} */}
    </main>
  )
};
