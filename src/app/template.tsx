'use client'

import React from 'react'
import { Sidebar } from "@/components/layout/sidebar";
import { useState } from 'react'
import { SearchCard } from '@/components/features/search/search-card';

const template = ({ children }: {children:React.ReactNode}) => {

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [newTripOpen, setNewTripOpen] = useState(false);
  const [formData, setFormData] = useState({
    tripName: '',
    destination: '',
    startDate: '',
    endDate: '',
    interests: '',
    commute: ''
  });
  const [isSearching, setIsSearching] = useState(false);
  const [timing, setTiming] = useState<'flexible' | 'dates'>('flexible');
  const [budget, setBudget] = useState<number>(2); // Default to $$
  
  return (
    <div className="flex h-screen w-full overflow-hidden">
        <Sidebar 
        open={sidebarOpen} 
        toggle={() => setSidebarOpen(o => !o)}
        onNewTrip={() => setNewTripOpen(true)}
        />

        <main className="w-full">
            {children}
        </main>

        {newTripOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                {/* Blurred backdrop */}
                <div 
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    onClick={()=>setNewTripOpen(false)} //close if clicking outside the box
                />

                {/* Modal window */}
                <div className="relative z-10 w-full max-w-md scale-100 rounded-xl border bg-white p-8 animate-in fade-in zoom-in duration-200">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-xl text-gray-600 font-bold">Where To ?</h2>
                        <button
                            onClick={()=>setNewTripOpen(false)}
                            className="text-gray-400 hover:text-black">
                                x
                        </button>
                    </div>

                    {/* Model Content */}
                    <div className="space-y-4 overflow-y-auto p-6 text-gray-500">
                        {/* Trip Name */}
                        <div className='space-y-2'> 
                            <label className="font-semibold">Trip Name *</label>
                            <input
                                required
                                type="text"
                                placeholder="Summer Vacation 2026 Go!"
                                className ="w-full px-4 py-2 border rounded-lg"
                                onChange={(e) => setFormData({...formData, tripName:e.target.value})}
                            />
                        </div>

                        {/* Destination */}
                        <div className='space-y-2'>
                            <label className="font-semibold">Destination *</label>
                            <SearchCard onChange={(val)=>setFormData({...formData, destination:val})} variant={'inline'}/>
                        </div>

                        {/* Dates */}

                        <div className="space-y-3">
                            <label className="font-semibold">Dates *</label>
                            <div className="flex p-1 bg-gray-100 rounded-xl">
                            <button 
                                onClick={() => setTiming('flexible')}
                                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${timing === 'flexible' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
                            >
                                Flexible
                            </button>
                            <button 
                                onClick={() => setTiming('dates')}
                                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${timing === 'dates' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
                            >
                                Select Dates
                            </button>
                            </div>

                            {timing === 'dates' && (
                            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="space-y-1">
                                <span className="text-xs text-gray-500 ml-1">From</span>
                                <input type="date" className="w-full p-2 border rounded-lg text-sm" />
                                </div>
                                <div className="space-y-1">
                                <span className="text-xs text-gray-500 ml-1">To</span>
                                <input type="date" className="w-full p-2 border rounded-lg text-sm" />
                                </div>
                            </div>
                            )}
                        </div>

 
                        {/* Interest */}
                        <div className='space-y-2'> 
                            <label className="font-semibold">Interests</label>
                            <input
                                required
                                type="text"
                                placeholder="Hiking, Art Museums, Street Food..."
                                className ="w-full px-4 py-2 border rounded-lg"
                                onChange={(e) => setFormData({...formData, interests:e.target.value})}
                            />
                        </div>

                        {/* Budget */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700">Budget</label>
                            <div className="flex bg-gray-50 rounded-lg border p-1">
                                {[1, 2, 3, 4].map((level) => (
                                <button
                                    key={level}
                                    onClick={() => setBudget(level)}
                                    className={`flex-1 py-1 rounded-md text-sm transition-all ${budget === level ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    {"$".repeat(level)}
                                </button>
                                ))}
                            </div>
                            </div>

                        {/* Commute */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700">Commute</label>
                            <select 
                                className="w-full px-3 py-2 border rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.commute}
                                onChange={(e) => setFormData({...formData, commute: e.target.value})}
                            >
                                <option value="roadtrip">Road Trip</option>
                                <option value="public">Public Transit</option>
                            </select>
                        </div>
                    </div>
                </div>
                
            </div>
        )
        }
    </div>
  )
}

export default template
