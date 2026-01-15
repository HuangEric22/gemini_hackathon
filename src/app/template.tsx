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
  
  return (
    <div className="flex h-screen w-full overflow-hidden">
        <Sidebar 
        open={sidebarOpen} 
        toggle={() => setSidebarOpen(o => !o)}
        onNewTrip={() => setNewTripOpen(true)}
        />

        <main>
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
                            <label className="font-semibold">Trip Name</label>
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
                            <label className="font-semibold">Destination</label>
                            <SearchCard onChange={(val)=>setFormData({...formData, destination:val})} variant={'inline'}/>
                        </div>

                        {/* Dates */}

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

                        {/* Commute */}
                    </div>
                </div>
                
            </div>
        )
        }
    </div>
  )
}

export default template
