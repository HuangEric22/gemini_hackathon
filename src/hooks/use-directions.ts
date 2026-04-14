'use client'

import { useCallback, useState } from 'react';
import type { LegTransport } from '@/shared';
import { computeDirectionsAction } from '@/app/actions/compute-directions';

interface Leg {
  originTitle: string;
  destTitle: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
}

/**
 * Computes walking / transit / driving directions for consecutive itinerary legs.
 * Uses the Routes API (v2) via server action.
 */
export function useDirections() {
  const [isComputing, setIsComputing] = useState(false);
  const [legTransports, setLegTransports] = useState<LegTransport[]>([]);

  const computeRoutes = useCallback(async (legs: Leg[]) => {
    if (legs.length === 0) { setLegTransports([]); return; }

    setIsComputing(true);
    try {
      const results = await computeDirectionsAction(legs);
      setLegTransports(results);
    } catch (err) {
      console.error('[useDirections] Error computing routes:', err);
    } finally {
      setIsComputing(false);
    }
  }, []);

  return { legTransports, computeRoutes, isComputing };
}
