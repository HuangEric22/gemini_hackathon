/**
 * Deterministic itinerary validation, shared by:
 *  - production generation (validate-and-repair loop in generate-itinerary)
 *  - the eval harness (phase-2 hard checks)
 *
 * Each check takes the trip input + generated itinerary and returns
 * human-readable violation strings (empty array = pass). The messages are
 * written to double as repair instructions fed back to Gemini, so they name
 * the offending item and say what the constraint was.
 *
 * Contract notes:
 *  - `is_suggested === true` means "the AI invented this item". User-selected
 *    activities always keep is_suggested=false, including surplus restaurants
 *    demoted to type="alternative" — they are still the user's picks.
 *  - A user activity counts as present when it appears with its exact name
 *    either scheduled or as a type="alternative" item.
 */

import type { OpeningPeriod } from '@/db/schema';
import type { ItineraryGenerationResponse } from '@/shared';
import { formatOpeningHours } from '@/lib/trip-planning-tools';

export type ItineraryDay = ItineraryGenerationResponse['days'][number];
export type ItineraryItem = ItineraryDay['items'][number];

/** Structural subset of GenerateItineraryInput that validation reads. */
export interface TripInputForValidation {
  activities: {
    name: string;
    category?: string | null;
    openingHours?: OpeningPeriod[] | null;
  }[];
  numDays: number;
  pace?: 'relaxed' | 'moderate' | 'packed';
  startTime?: string;
  dayAssignments?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Time + item helpers
// ---------------------------------------------------------------------------

/** Parses "9:00 AM", "9 AM", "09:00", "21:30" → minutes since midnight, or null. */
export function parseTimeToMinutes(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*$/i.exec(raw);
  if (!m) return null;

  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3]?.toLowerCase().replace(/\./g, '');

  if (minute > 59) return null;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export const isCommute = (item: ItineraryItem): boolean =>
  Boolean(item.type?.toLowerCase().includes('commute'));

export const isAlternative = (item: ItineraryItem): boolean =>
  Boolean(item.type?.toLowerCase().includes('alternative'));

const MEAL_TYPE = /meal|breakfast|lunch|dinner|restaurant|food|cafe/i;
const norm = (s: string) => s.toLowerCase().trim();

const allItems = (itinerary: ItineraryGenerationResponse): ItineraryItem[] =>
  (itinerary.days ?? []).flatMap(d => d.items ?? []);

const nonHotelActivities = (input: TripInputForValidation) =>
  input.activities.filter(a => a.category !== 'hotel');

const hotelActivity = (input: TripInputForValidation) =>
  input.activities.find(a => a.category === 'hotel');

/**
 * The scheduled (non-alternative, non-suggested, non-commute) instance of a
 * user activity, matched by exact title.
 */
function findScheduledItem(
  days: ItineraryDay[],
  activityName: string,
): { day: ItineraryDay; item: ItineraryItem } | null {
  for (const day of days) {
    for (const item of day.items) {
      if (
        item.title === activityName &&
        item.is_suggested !== true &&
        !isCommute(item) &&
        !isAlternative(item)
      ) {
        return { day, item };
      }
    }
  }
  return null;
}

/**
 * Whether a user activity appears at all: scheduled, or offered as a
 * type="alternative" (either is_suggested flag is tolerated on alternatives —
 * they remain identifiable as the user's pick by exact title).
 */
function isActivityPresent(days: ItineraryDay[], activityName: string): boolean {
  return days.some(day =>
    day.items.some(item =>
      item.title === activityName &&
      !isCommute(item) &&
      (item.is_suggested !== true || isAlternative(item)),
    ),
  );
}

// ---------------------------------------------------------------------------
// Checks — each returns violation messages (empty = pass)
// ---------------------------------------------------------------------------

export function checkDayCount(
  input: TripInputForValidation,
  itinerary: ItineraryGenerationResponse,
): string[] {
  const days = itinerary.days ?? [];
  const dayNumbers = days.map(d => d.day_number).sort((a, b) => a - b);
  const expected = Array.from({ length: input.numDays }, (_, i) => i + 1);
  if (days.length === input.numDays && JSON.stringify(dayNumbers) === JSON.stringify(expected)) {
    return [];
  }
  return [
    `expected exactly ${input.numDays} day(s) numbered 1..${input.numDays}, got ${days.length} day(s) numbered [${dayNumbers.join(', ')}]`,
  ];
}

export function checkTimesParseable(
  _input: TripInputForValidation,
  itinerary: ItineraryGenerationResponse,
): string[] {
  const violations: string[] = [];
  for (const day of itinerary.days ?? []) {
    for (const item of day.items) {
      const start = parseTimeToMinutes(item.start_time);
      const end = parseTimeToMinutes(item.end_time);
      if (start === null || end === null) {
        violations.push(`day ${day.day_number} "${item.title}" has unparseable times [${item.start_time} – ${item.end_time}]`);
      } else if (end <= start) {
        violations.push(`day ${day.day_number} "${item.title}" ends (${item.end_time}) at or before it starts (${item.start_time})`);
      }
    }
  }
  return violations;
}

export function checkCoords(
  _input: TripInputForValidation,
  itinerary: ItineraryGenerationResponse,
): string[] {
  // Commutes are transitions, not places — they may legitimately lack coords.
  return allItems(itinerary)
    .filter(i => !isCommute(i))
    .filter(i =>
      !Number.isFinite(i.lat) || !Number.isFinite(i.lng) ||
      Math.abs(i.lat!) > 90 || Math.abs(i.lng!) > 180 ||
      (i.lat === 0 && i.lng === 0),
    )
    .map(i => `"${i.title}" has missing or implausible coordinates (${i.lat}, ${i.lng})`);
}

export function checkUserActivitiesPresent(
  input: TripInputForValidation,
  itinerary: ItineraryGenerationResponse,
): string[] {
  const days = itinerary.days ?? [];
  const items = allItems(itinerary);
  const violations: string[] = [];
  for (const a of nonHotelActivities(input)) {
    if (isActivityPresent(days, a.name)) continue;
    const nearMiss = items.find(i => norm(i.title) === norm(a.name));
    violations.push(nearMiss
      ? `user-selected activity "${a.name}" only appears as an AI suggestion (is_suggested=${nearMiss.is_suggested} type=${nearMiss.type}) — it must be scheduled or offered as type="alternative"`
      : `user-selected activity "${a.name}" is missing from the itinerary — every user activity must appear exactly once, scheduled or as type="alternative"`);
  }
  return violations;
}

export function checkNoOverlap(
  _input: TripInputForValidation,
  itinerary: ItineraryGenerationResponse,
): string[] {
  const violations: string[] = [];
  for (const day of itinerary.days ?? []) {
    const timed = day.items
      .filter(i => !isCommute(i) && !isAlternative(i))
      .map(i => ({ i, start: parseTimeToMinutes(i.start_time), end: parseTimeToMinutes(i.end_time) }))
      .filter((x): x is { i: ItineraryItem; start: number; end: number } => x.start !== null && x.end !== null)
      .sort((a, b) => a.start - b.start);
    for (let k = 1; k < timed.length; k++) {
      if (timed[k].start < timed[k - 1].end) {
        violations.push(`day ${day.day_number}: "${timed[k - 1].i.title}" (${timed[k - 1].i.start_time}–${timed[k - 1].i.end_time}) overlaps "${timed[k].i.title}" (${timed[k].i.start_time}–${timed[k].i.end_time})`);
      }
    }
  }
  return violations;
}

/**
 * Each scheduled window must fit inside the venue's open window on at least
 * one weekday (the itinerary has no calendar dates, so day N maps to no
 * particular weekday). Alternatives are not checked — their times are
 * hypothetical swap slots.
 */
export function checkOpeningHours(
  input: TripInputForValidation,
  itinerary: ItineraryGenerationResponse,
): string[] {
  const days = itinerary.days ?? [];
  const violations: string[] = [];
  for (const a of nonHotelActivities(input)) {
    if (!a.openingHours?.length) continue;
    const found = findScheduledItem(days, a.name);
    if (!found) continue; // presence is checkUserActivitiesPresent's job
    const start = parseTimeToMinutes(found.item.start_time);
    const end = parseTimeToMinutes(found.item.end_time);
    if (start === null || end === null) continue; // checkTimesParseable's job
    const fits = (a.openingHours as OpeningPeriod[]).some(p => {
      if (p.close === null) return true; // open 24h
      const openMin = p.open.hour * 60 + p.open.minute;
      // Window closing on a later weekday ≈ open until midnight for our purposes.
      const closeMin = p.close.day !== p.open.day ? 24 * 60 : p.close.hour * 60 + p.close.minute;
      return start >= openMin && end <= closeMin;
    });
    if (!fits) {
      violations.push(`"${a.name}" is scheduled ${found.item.start_time}–${found.item.end_time}, outside its opening hours (${formatOpeningHours(a.openingHours as OpeningPeriod[])})`);
    }
  }
  return violations;
}

/** Only meaningful when the trip has a hotel; callers should skip otherwise. */
export function checkHotelAnchor(
  input: TripInputForValidation,
  itinerary: ItineraryGenerationResponse,
): string[] {
  const hotel = hotelActivity(input);
  if (!hotel) return [];
  const violations: string[] = [];
  for (const day of itinerary.days ?? []) {
    if (day.items.length === 0) {
      violations.push(`day ${day.day_number} is empty`);
      continue;
    }
    if (!isCommute(day.items[0])) violations.push(`day ${day.day_number} does not start with a commute from the hotel`);
    if (!isCommute(day.items[day.items.length - 1])) violations.push(`day ${day.day_number} does not end with a commute back to the hotel`);
  }
  const standalone = allItems(itinerary).find(i => !isCommute(i) && norm(i.title) === norm(hotel.name));
  if (standalone) violations.push(`hotel "${hotel.name}" appears as a standalone activity — it should only anchor commutes`);
  return violations;
}

export function checkDayAssignments(
  input: TripInputForValidation,
  itinerary: ItineraryGenerationResponse,
): string[] {
  const days = itinerary.days ?? [];
  const violations: string[] = [];
  for (const [key, names] of Object.entries(input.dayAssignments ?? {})) {
    if (!key.startsWith('day-') || names.length === 0) continue;
    const dayNum = parseInt(key.replace('day-', ''), 10);
    const day = days.find(d => d.day_number === dayNum);
    for (const name of names) {
      const onDay = day?.items.some(i => i.title === name && i.is_suggested !== true);
      if (!onDay) {
        const actual = days.find(d => d.items.some(i => i.title === name));
        violations.push(`"${name}" was assigned to day ${dayNum} by the user but appears on ${actual ? `day ${actual.day_number}` : 'no day'}`);
      }
    }
  }
  return violations;
}

/** At most one user-selected restaurant per meal slot (breakfast/lunch/dinner) per day. */
export function checkMealBalance(
  input: TripInputForValidation,
  itinerary: ItineraryGenerationResponse,
): string[] {
  const userRestaurants = new Set(
    input.activities.filter(a => a.category === 'restaurant').map(a => a.name),
  );
  if (userRestaurants.size === 0) return [];
  const slotOf = (startMin: number) => (startMin < 11 * 60 ? 'breakfast' : startMin < 16 * 60 ? 'lunch' : 'dinner');
  const violations: string[] = [];
  for (const day of itinerary.days ?? []) {
    const slots: Record<string, string[]> = { breakfast: [], lunch: [], dinner: [] };
    for (const item of day.items) {
      if (item.is_suggested === true || isCommute(item) || isAlternative(item)) continue;
      if (!userRestaurants.has(item.title)) continue;
      const start = parseTimeToMinutes(item.start_time);
      if (start === null) continue;
      slots[slotOf(start)].push(item.title);
    }
    for (const [slot, titles] of Object.entries(slots)) {
      if (titles.length > 1) {
        violations.push(`day ${day.day_number} schedules ${titles.length} user-selected ${slot}s (${titles.join(', ')}) — keep one and offer the rest as type="alternative"`);
      }
    }
  }
  return violations;
}

/** Bands from the prompt (relaxed 2–3, moderate 3–4, packed 5+) with ±1 grace. */
export const PACE_BANDS: Record<'relaxed' | 'moderate' | 'packed', [number, number]> = {
  relaxed: [1, 4],
  moderate: [2, 5],
  packed: [4, Infinity],
};

/** Counts per-day "activities": not commutes, alternatives, or meals. */
export function countPaceActivities(
  input: TripInputForValidation,
  day: ItineraryDay,
): number {
  const userRestaurants = new Set(
    input.activities.filter(a => a.category === 'restaurant').map(a => a.name),
  );
  return day.items.filter(i =>
    !isCommute(i) && !isAlternative(i) &&
    !MEAL_TYPE.test(i.type ?? '') && !userRestaurants.has(i.title),
  ).length;
}

/** Only meaningful when input.pace is set; callers should skip otherwise. */
export function checkPace(
  input: TripInputForValidation,
  itinerary: ItineraryGenerationResponse,
): string[] {
  if (!input.pace) return [];
  const [lo, hi] = PACE_BANDS[input.pace];
  const violations: string[] = [];
  for (const day of itinerary.days ?? []) {
    const count = countPaceActivities(input, day);
    if (count < lo || count > hi) {
      violations.push(`day ${day.day_number} has ${count} non-meal activities, outside the ${input.pace}-pace range of ${lo}–${hi === Infinity ? 'unlimited' : hi}${count < lo ? ' — add is_suggested=true activities near that day\'s cluster' : ''}`);
    }
  }
  return violations;
}

/** Only meaningful when input.startTime is set; callers should skip otherwise. */
export function checkStartTime(
  input: TripInputForValidation,
  itinerary: ItineraryGenerationResponse,
): string[] {
  const startMin = parseTimeToMinutes(input.startTime);
  if (startMin === null) return [];
  const violations: string[] = [];
  for (const day of itinerary.days ?? []) {
    const first = day.items.find(i => !isCommute(i) && !isAlternative(i));
    if (!first) continue;
    const s = parseTimeToMinutes(first.start_time);
    if (s !== null && s < startMin) {
      violations.push(`day ${day.day_number} starts "${first.title}" at ${first.start_time}, before the requested day start of ${formatMinutes(startMin)}`);
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

const ALL_CHECKS = [
  checkDayCount,
  checkTimesParseable,
  checkCoords,
  checkUserActivitiesPresent,
  checkNoOverlap,
  checkOpeningHours,
  checkHotelAnchor,
  checkDayAssignments,
  checkMealBalance,
  checkPace,
  checkStartTime,
];

/**
 * Runs every applicable check and returns all violations. Checks that don't
 * apply to the input (no hotel, no pace, …) contribute nothing.
 */
export function validateItinerary(
  input: TripInputForValidation,
  itinerary: ItineraryGenerationResponse,
): string[] {
  return ALL_CHECKS.flatMap(check => check(input, itinerary));
}
