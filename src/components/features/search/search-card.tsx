'use client'

import { useState } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { usePlacesAutocomplete } from '@/hooks/places-autocomplete';

interface Props {
  onSearch?: (destination: string) => void;
  onChange?: (value: string) => void;
  isLoading?: boolean;
  variant?: 'standalone'|'inline';
}

export function SearchCard({ onSearch, onChange, isLoading = false, variant='standalone'}: Props) {
  const [destination, setDestination] = useState('');
  const [showDropDown, setDropDown] = useState(false);
  const { suggestions, loading : isFetchingSuggestions , fetchSuggestions, refreshSession } = usePlacesAutocomplete(destination, 'locality');

  const isStandalone = variant === 'standalone';

  const handleInputChange = (value: string) => {
    setDestination(value);
    setDropDown(true);
    fetchSuggestions(value);
    onChange?.(value);
  };

  const handleSelect = (text: string) => {
    setDestination(text);
    setDropDown(false);
    refreshSession();
    onChange?.(text)
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (destination.trim()) {
      onSearch(destination);
    }
  };

  return (
    <div className={`w-full transition-all ${
      isStandalone 
        ? "bg-white rounded-2xl shadow-sm border border-slate-100 p-6" 
        : "bg-transparent border rounded-lg"
      }`}>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/*Destination Input */}
        <div className="space-y-1.5">
          {isStandalone&&
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
              Where to?
            </label>
          }
          
          <div className="relative group">
            {isStandalone&&
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MapPin className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            }
            
            <input
              type="text"
              value={destination}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="e.g. Kyoto, Japan"
              className={`"block w-full border-b-2 border-slate-200 bg-transparent text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none transition-colors text-lg" ${
                isStandalone 
                  ? "pl-10 pr-3 py-3" 
                  : "px-4 py-2"
                }`}></input>
            {isFetchingSuggestions && (
              <div className="absolute inset-y-0 right-3 flex items-center">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            )}              
          </div>
        </div>
        {/* SearchCard.tsx inside the relative group div */}
        {suggestions.length > 0 && destination.length > 1 && showDropDown && (
          <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-2xl mt-1 overflow-hidden">
            {suggestions.map((s, i) => (
              <li 
                key={i}
                onClick={() => handleSelect(s.placePrediction.text.toString())}
                className="px-4 py-3 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 flex items-center gap-2 border-b border-slate-50 last:border-none"
              >
                <MapPin className="h-4 w-3 text-indigo-400" />
                {s.placePrediction.text.toString()}
              </li>
            ))}
          </ul>
        )}
        {/*Submit Button */}
        {isStandalone &&
            <button
              type="submit"
              disabled={!destination || isLoading}
              className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <Search className="w-5 h-5 mr-2" strokeWidth={2.5} />
                  Find Places
                </>
              )}
            </button>
        }
      </form>

    </div>
  );
}