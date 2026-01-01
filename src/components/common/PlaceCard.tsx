import React from 'react';
import { Place } from '@/types/index';
import { Plus, Star, MapPin, ExternalLink } from 'lucide-react';

interface PlaceCardProps {
  place: Place;
  onAdd: (place: Place) => void;
  isAdded: boolean;
}

export const PlaceCard: React.FC<PlaceCardProps> = ({ place, onAdd, isAdded }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden border border-slate-100 flex flex-col h-full group">
      <div className="relative h-48 overflow-hidden">
        <img 
          src={place.imageUrl} 
          alt={place.name} 
          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full flex items-center shadow-sm">
          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 mr-1" />
          <span className="text-xs font-bold text-slate-700">{place.rating}</span>
        </div>
      </div>
      
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-slate-800 text-lg leading-tight">{place.name}</h3>
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md whitespace-nowrap ml-2">
            {place.priceLevel}
          </span>
        </div>
        
        <p className="text-slate-600 text-sm mb-4 flex-1">{place.description}</p>
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center text-slate-400 text-xs overflow-hidden">
            <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
            <span className="truncate">{place.location}</span>
          </div>
          
          {place.googleMapsUri && (
             <a 
               href={place.googleMapsUri} 
               target="_blank" 
               rel="noopener noreferrer"
               className="text-indigo-600 hover:text-indigo-800 p-1"
               title="View on Google Maps"
             >
               <ExternalLink className="w-4 h-4" />
             </a>
          )}
        </div>

        <button
          onClick={() => onAdd(place)}
          disabled={isAdded}
          className={`w-full py-2.5 px-4 rounded-lg flex items-center justify-center font-medium transition-colors ${
            isAdded 
              ? 'bg-emerald-50 text-emerald-600 cursor-default' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800'
          }`}
        >
          {isAdded ? (
            <>Added to Itinerary</>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Add to Plan
            </>
          )}
        </button>
      </div>
    </div>
  );
};