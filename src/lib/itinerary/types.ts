import type { OpeningPeriod } from '@/db/schema';
import type { ItineraryGenerationResponse } from '@/shared';

export interface ActivityPick {
  name: string;
  lat: number;
  lng: number;
  category?: string | null;
  googlePlaceId?: string | null;
  openingHours?: OpeningPeriod[] | null;
  averageDuration?: number | null;
}

export interface GenerateItineraryInput {
  activities: ActivityPick[];
  numDays: number;
  transportMode?: string;
  currentItinerary?: ItineraryGenerationResponse | null;
  preference?: string;
  dayAssignments?: Record<string, string[]>;
  pace?: 'relaxed' | 'moderate' | 'packed';
  budget?: 'budget' | 'moderate' | 'luxury';
  startTime?: string;
}

export type ItineraryProgressPhase = 'planning' | 'generating' | 'validating' | 'repairing';

export type ItineraryProgressCallback = (event: {
  phase: ItineraryProgressPhase;
  message: string;
}) => void;

export interface ItineraryValidationIssue {
  code: 'wrong_day_count' | 'wrong_day_number' | 'duplicate_day_number' | 'missing_activity' | 'overlapping_items';
  message: string;
  dayNumber?: number;
  itemTitle?: string;
}

