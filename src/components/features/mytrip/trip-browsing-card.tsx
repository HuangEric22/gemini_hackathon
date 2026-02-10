import React from 'react';
import { Star, Minus, MapPin, MoreHorizontal, ListPlus, Check } from 'lucide-react';
import { type Activity } from '@/db/schema'
import { updateWantToGo } from '@/app/actions/crud-trip';

interface TripActivityCardProps {
  tripId: number
  activity: Activity;
  isAdded: boolean;
  onHover: (id: number | null) => void;
  onToggle: () => void;
  onClick: () => void;
}

export function TripActivityCard({ tripId, activity, isAdded, onHover, onToggle, onClick }: TripActivityCardProps) {
  return (
    <div 
      className="flex flex-col flex-row h-50 gap-6 p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group cursor-pointer"
      onMouseEnter={() => onHover(activity.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
    >
      {/* Image Block */}
      <div className="relative w-full sm:w-48 h-40 sm:h-full overflow-hidden rounded-xl shrink-0 bg-slate-100">
        <img 
          src={activity.imageUrl || 'https://via.placeholder.com/400x300?text=No+Image'} 
          alt={activity.name} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-600 uppercase shadow-sm">
          {activity.category}
        </div>
      </div>

      {/* Content Block */}
      <div className="flex-1 space-y-2 relative pr-12">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
            {activity.name}
          </h3>
          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">
            <Star className="w-3 h-3 fill-yellow-700" />
            {activity.rating}
          </div>
        </div>
        
        <p className="text-slate-500 text-sm line-clamp-2 leading-relaxed">
          {activity.description}
        </p>

        <div className="flex items-center gap-4 text-slate-400 text-xs pt-1">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {activity.address}
          </span>
        </div>

        {/* Interaction Buttons */}
        <div className="absolute top-0 right-0 flex flex-col gap-2">
          <button 
            onClick={(e) => { 
                e.stopPropagation(); // Prevents triggering the card's onClick
                onToggle(); 
                updateWantToGo(tripId, activity.id, isAdded)
            }}
            className={`group/btn relative p-2.5 rounded-full shadow-sm transition-all border ${
                isAdded 
                ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-red-500 hover:border-red-500' 
                : 'bg-white border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-600'
            }`}
          >
            {isAdded ? (
                <>
                  {/* Shows Check by default, Minus on hover to indicate removal */}
                  <Check className="w-5 h-5 block group-hover/btn:hidden" />
                  <Minus className="w-5 h-5 hidden group-hover/btn:block" />
                </>
            ) : (
                <ListPlus className="w-5 h-5" />
            )}
          </button>
          <button className="p-2.5 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-slate-600 shadow-sm transition-all">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}