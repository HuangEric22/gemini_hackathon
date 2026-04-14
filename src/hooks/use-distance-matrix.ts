'use client'

import { useCallback, useState } from 'react';
import type { TravelMatrix } from '@/shared';
import { computeRouteMatrixAction } from '@/app/actions/compute-route-matrix';

type TravelMode = 'DRIVE' | 'TRANSIT' | 'WALK';

/**
 * Computes an NxN travel-time matrix between activities using the Routes API (v2).
 * Used before generation to feed real travel times into the Gemini prompt.
 */
export function useDistanceMatrix() {
  const [isComputing, setIsComputing] = useState(false);

  const computeMatrix = useCallback(async (
    activities: { name: string; lat: number; lng: number }[],
    mode: TravelMode = 'DRIVE',
  ): Promise<TravelMatrix> => {
    if (activities.length < 2) return {};

    setIsComputing(true);
    try {
      return await computeRouteMatrixAction(activities, mode);
    } finally {
      setIsComputing(false);
    }
  }, []);

  return { computeMatrix, isComputing };
}
