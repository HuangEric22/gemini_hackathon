import React, { useState } from 'react';
import { Trip, Activity } from '@/db/schema';
import { 
  ArrowLeft, Save, RefreshCw, Clock, Trash2, 
  MapPin, Sparkles, AlertCircle, ChevronDown, ChevronRight 
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ItineraryGenerationResponse } from '@/shared';

interface ItineraryProps {
  trip: Trip;
  selections: Activity[];
  currentItinerary: ItineraryGenerationResponse | null;
  onBack: () => void;
  onGenerate: (activities: Activity[], preference?: string) => void;
  onRefreshData: () => void;
}

export const ItineraryWorkspace = ({ 
  trip, 
  selections, 
  currentItinerary, 
  onBack, 
  onGenerate, 
  onRefreshData 
}: ItineraryProps) => {
  const [isDirty, setIsDirty] = useState(false);
  const [expandedDays, setExpandedDays] = useState<number[]>([1]);
  const [preference, setPreference] = useState("");

  // EMPTY STATE: If nothing is generated and no selections exist
  if (!currentItinerary && selections.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-white">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-slate-300" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">Nothing generated yet</h3>
        <p className="text-slate-500 mt-2 max-w-xs">Select places in the browsing view, then click Generate.</p>
        <button onClick={onBack} className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-full font-bold">Go to Browsing</button>
      </div>
    );
  }

  return (
    <main className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h2 className="font-bold text-slate-900">Itinerary Preview</h2>
            <p className="text-xs text-slate-500 font-medium italic">Adjusting route for {trip.destination}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isDirty ? (
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 text-slate-400 rounded-lg text-sm font-bold cursor-default">
              <AlertCircle className="w-4 h-4" /> Unsaved Changes
            </button>
          ) : (
            <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-md transition-all active:scale-95">
              <Save className="w-4 h-4" /> Save Itinerary
            </button>
          )}
        </div>
      </header>

      {/* Regeneration Input Box */}
      <div className="p-6 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto relative">
          <input 
            type="text"
            value={preference}
            onChange={(e) => setPreference(e.target.value)}
            placeholder="Change preference (e.g. 'Add more museums' or 'Start later')"
            className="w-full pl-4 pr-32 py-3 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
          <button 
            onClick={() => onGenerate(selections, preference)}
            className="absolute right-2 top-1.5 bottom-1.5 px-4 bg-white text-indigo-600 border border-indigo-100 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-50 transition-colors">
            <RefreshCw className="w-3 h-3" /> Regenerate
          </button>
        </div>
      </div>

      {/* Multi-Day Accordion */}
      <div className="flex-1 overflow-y-auto p-8 space-y-4">
        {currentItinerary?.days.map((day) => {
          const dayNum = day.day_number;
          const isExpanded = expandedDays.includes(dayNum);

          return (
            <div key={dayNum} className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm">
              <button 
                onClick={() => setExpandedDays(prev => prev.includes(dayNum) ? prev.filter(d => d !== dayNum) : [...prev, dayNum])}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="text-left">
                  <h3 className="font-black text-slate-800">Day {dayNum}</h3>
                  <p className="text-xs text-slate-400 font-medium italic">{day.brief_description}</p>
                </div>
                {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div 
                    initial={{ height: 0 }} 
                    animate={{ height: 'auto' }} 
                    exit={{ height: 0 }} 
                    className="overflow-hidden bg-slate-50/30"
                  >
                    <div className="p-4 pt-0 space-y-2">
                      {/* Mapping through activities in the current day */}
                      {day.items.map((item, idx) => (
                        <div 
                          key={`${dayNum}-${idx}`} 
                          className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-200 transition-all shadow-sm group"
                        >
                          {/* Time Column */}
                          <div className="flex flex-col items-center justify-center min-w-[70px] text-[10px] font-bold text-slate-500 bg-slate-50 py-2 rounded-lg border border-slate-100">
                            <span>{item.start_time}</span>
                            <div className="h-2 w-[1px] bg-slate-200 my-1"></div>
                            <span>{item.end_time}</span>
                          </div>

                          {/* Content Column */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-800 text-sm">{item.title}</h4>
                              <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
                                {item.type}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 italic">
                              {item.description || "No description provided."}
                            </p>
                          </div>

                          {/* Action Column */}
                          <button className="p-2 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </main>
  );
};