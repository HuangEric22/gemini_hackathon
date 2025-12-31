import React from 'react';
import { Place, Category } from '../types';
import { Trash2, Utensils, Bed, Camera, Map } from 'lucide-react';

interface ItineraryListProps {
  items: Place[];
  onRemove: (id: string) => void;
}

export const ItineraryList: React.FC<ItineraryListProps> = ({ items, onRemove }) => {
  const getIcon = (cat: Category) => {
    switch(cat) {
      case 'food': return <Utensils className="w-4 h-4" />;
      case 'stay': return <Bed className="w-4 h-4" />;
      case 'visit': return <Camera className="w-4 h-4" />;
    }
  };

  const getColor = (cat: Category) => {
    switch(cat) {
      case 'food': return 'bg-orange-100 text-orange-600';
      case 'stay': return 'bg-blue-100 text-blue-600';
      case 'visit': return 'bg-purple-100 text-purple-600';
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 p-8 text-center border-2 border-dashed border-slate-200 rounded-xl">
        <Map className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm font-medium">Your itinerary is empty</p>
        <p className="text-xs mt-1">Search and add places to build your trip.</p>
      </div>
    );
  }

  const totalPriceEstimate = items.reduce((acc, item) => {
    return acc + item.priceLevel.length * 25; // Crude estimate: $ = 25, $$ = 50...
  }, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
         <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800">Trip Overview</h3>
            <span className="text-xs font-medium bg-slate-100 px-2 py-1 rounded-full text-slate-600">
                {items.length} items
            </span>
         </div>
         <div className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
            <span>Est. Cost Base</span>
            <span className="font-mono font-bold text-slate-800">${totalPriceEstimate}</span>
         </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex gap-3 group hover:border-indigo-100 transition-colors">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getColor(item.category)}`}>
              {getIcon(item.category)}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-slate-800 truncate">{item.name}</h4>
              <p className="text-xs text-slate-500 truncate">{item.location}</p>
            </div>
            <button 
              onClick={() => onRemove(item.id)}
              className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
              title="Remove from itinerary"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};