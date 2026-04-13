'use client'

import { useState } from 'react';
import { Panel, Group } from 'react-resizable-panels';
import { DiscoveryFeed } from '@/components/features/discovery/discovery-feed';
import { MapArea } from '@/components/features/map/map';
import { ResizeSeparator } from '@/components/layout/resizeable-separator';
import { MapPlace, Place } from '@/shared'

const DEFAULT_PLACE: Place = {
  name: "Kyoto",
  lat: 35.0116,
  lng: 135.7681,
  id: "ChIJL6_q594_AWAR3Y3YpvVq9Jk",
};

export default function Home() {
  const [cities, setCities] = useState<Place[]>([DEFAULT_PLACE]);
  const [activeCityId, setActiveCityId] = useState<string>(DEFAULT_PLACE.id);
  const [mapPlaces, setMapPlaces] = useState<MapPlace[]>([]);
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null);

  const activeCity = cities.find(c => c.id === activeCityId) ?? cities[0] ?? null;

  const handleAddCity = (place: Place) => {
    setCities(prev => {
      if (prev.some(c => c.id === place.id)) {
        setActiveCityId(place.id); // already added — just switch to it
        return prev;
      }
      setActiveCityId(place.id);
      return [...prev, place];
    });
    setFocusedPlaceId(null);
  };

  const handleRemoveCity = (id: string) => {
    setCities(prev => {
      const next = prev.filter(c => c.id !== id);
      if (next.length === 0) return prev; // keep at least one city
      if (activeCityId === id) setActiveCityId(next[next.length - 1].id);
      return next;
    });
    setFocusedPlaceId(null);
  };

  const handleSelectCity = (id: string) => {
    setActiveCityId(id);
    setFocusedPlaceId(null);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Group orientation='horizontal' className='w-full'>

        <Panel minSize="30%" defaultSize="60%">
          <DiscoveryFeed
            cities={cities}
            activeCityId={activeCityId}
            onAddCity={handleAddCity}
            onRemoveCity={handleRemoveCity}
            onSelectCity={handleSelectCity}
            onPlacesChange={setMapPlaces}
            focusedPlaceId={focusedPlaceId}
            onFocusPlace={setFocusedPlaceId}
          />
        </Panel>

        <ResizeSeparator />

        <Panel minSize="20%" defaultSize="30%">
          <MapArea
            center={{ lat: activeCity?.lat ?? DEFAULT_PLACE.lat, lng: activeCity?.lng ?? DEFAULT_PLACE.lng }}
            places={mapPlaces}
            focusedPlaceId={focusedPlaceId}
            onPinClick={setFocusedPlaceId}
          />
        </Panel>

      </Group>
    </div>
  );
};
