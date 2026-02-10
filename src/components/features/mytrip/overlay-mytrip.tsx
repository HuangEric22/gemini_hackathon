import React from 'react';
import { X, Trash2, Sparkles, MapPin, ChevronRight, Calendar } from 'lucide-react';
import { type Activity } from '@/db/schema';

interface OverlayMyListProps {
  isOpen: boolean;
  onClose: () => void;
  addedPlaces: Activity[];
  onRemove: (id: number) => void;
  onGenerate: () => void;
}

export const OverlayMyList = ({ 
  isOpen, 
  onClose, 
  addedPlaces, 
  onRemove, 
  onGenerate 
}: OverlayMyListProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end pointer-events-none h-screen">
      
      {/* Drawer Panel */}
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 pointer-events-auto">
        
        {/* Header */}
            <div className="p-6 border-b flex items-center justify-between">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">My list</h2>
                <p className="text-slate-500 text-sm font-medium">
                {addedPlaces.length} places ready for itinerary
                </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
            </button>
            </div>

            {/* List of Places */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
            {addedPlaces.length > 0 ? (
                addedPlaces.map((place) => (
                <div 
                    key={place.id} 
                    className="flex gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all hover:border-indigo-200"
                >
                    <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 shadow-inner">
                    <img src={place.imageUrl || ''} className="w-full h-full object-cover" alt={place.name} />
                    </div>
                    <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 truncate">{place.name}</h4>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 text-indigo-500" /> 
                        <span className="truncate">{place.address}</span>
                    </p>
                    
                    <button 
                        onClick={() => onRemove(place.id)}
                        className="mt-3 text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                    </div>
                </div>
                ))
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                <Calendar className="w-12 h-12 text-slate-300 mb-2" />
                <p className="text-slate-500 font-medium">No places added yet.</p>
                </div>
            )}
            </div>

            {/* Generate Action Area */}
            <div className="h-40 p-6 border-t bg-white flex flex-col shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.04)]">
                <div className="h-10 mb-4 items-center gap-3 p-3 flex bg-indigo-50 rounded-xl border border-indigo-100">
                    <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <p className="text-[12px] text-indigo-900 font-medium leading-tight">
                    Our AI will organize these spots into the best daily route for your trip.
                    </p>
                </div>

                <button 
                    disabled={addedPlaces.length === 0}
                    onClick={onGenerate}
                    className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white py-4 rounded-2xl font-extrabold flex items-center justify-center gap-2 transition-all group cursor-pointer"
                >
                    Generate Itinerary
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
    </div>
  );
};