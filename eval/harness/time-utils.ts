/**
 * Time parsing for itinerary item times.
 *
 * The implementations moved to src/lib/itinerary-validation.ts so the
 * production validate-and-repair loop and the eval share one definition;
 * this module re-exports them for existing harness imports.
 */

export { parseTimeToMinutes, formatMinutes } from '@/lib/itinerary-validation';
