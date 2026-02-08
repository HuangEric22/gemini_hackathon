'use client'

import { useState } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { usePlacesAutocomplete } from '@/hooks/places-autocomplete';
import { Place } from '@/shared'
import { placeholder } from 'drizzle-orm';

interface Props {
  onSearch?: (destination: Place) => void;
  onChange?: (value: string) => void;
  isLoading?: boolean;
  variant?: 'standalone' | 'inline';
  placeholder?: string;
}

export function SearchCard({ onSearch, onChange, isLoading = false, variant = 'standalone', placeholder}: Props) {
  const [destination, setDestination] = useState<google.maps.places.AutocompleteSuggestion | null>(null);
  const [inputValue, setInputValue] = useState('');

  const [showDropDown, setDropDown] = useState(false);
  const { searchSuggestions, loading: isFetchingSuggestions, fetchSuggestions, refreshSession } = usePlacesAutocomplete();

  const isStandalone = variant === 'standalone';

  const handleInputChange = (value: string) => {
    setInputValue(value);
    setDropDown(true);
    fetchSuggestions(value);
    onChange?.(value);
  };

  const handleSelect = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!suggestion.placePrediction) return;
    const name = suggestion.placePrediction.text.toString()
    setInputValue(name);
    setDestination(suggestion);
    setDropDown(false);
    refreshSession();
    onChange?.(name)
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination?.placePrediction) return;
    const { place } = await destination.placePrediction?.toPlace().fetchFields({ fields: ['location', 'id', 'displayName', 'viewport'] });
    console.log(place.location, place.displayName);

    if (!place.location || !place.displayName) {
      return;
    }

    const selectedPlace = {
      name: place.displayName,
      lat: place.location?.lat(),
      lng: place.location?.lng(),
      id: place.id,
      viewport: place?.viewport
    }

    if (inputValue.trim()) {
      onSearch?.(selectedPlace);
    }
  };

  return (
    <div className={`w-full transition-all ${isStandalone
        ? "bg-white rounded-2xl shadow-sm border border-slate-100 p-6"
        : "bg-transparent border rounded-lg"
      }`}>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/*Destination Input */}
        <div className="space-y-1.5">
          {isStandalone &&
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
              Where to?
            </label>
          }

          <div className="relative group">
            {isStandalone &&
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              </div>
            }

            <input
              type="text"
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder= {placeholder || "e.g. Kyoto, Japan"}
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
        {searchSuggestions.length > 0 && inputValue.length > 1 && showDropDown && (
          <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-2xl mt-1 overflow-hidden">
            {searchSuggestions.map((s, i) => (
              <li
                key={i}
                onClick={() => handleSelect(s)}
                className="px-4 py-3 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 flex items-center gap-2 border-b border-slate-50 last:border-none"
              >
                <MapPin className="h-4 w-3 text-indigo-400" />
                {s.placePrediction?.text.toString() || ""}
              </li>
            ))}
          </ul>
        )}
        {/*Submit Button */}
        {isStandalone &&
          <button
            type="submit"
            disabled={!inputValue || isLoading}
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