/**
 * Phase-2 grader — deterministic hard-contract checks on the itinerary.
 *
 * Which checks run is derived from the scenario input itself (e.g.
 * hotel_anchor only when a hotel is selected, pace only when input.pace is
 * set), so scenarios don't need to enumerate them. Inapplicable checks are
 * reported as 'skip' so the scorecard shape is stable across scenarios.
 */

import type { ItineraryGenerationResponse } from '@/shared';
import type { OpeningPeriod } from '@/db/schema';
import { formatOpeningHours } from '@/lib/trip-planning-tools';
import { parseTimeToMinutes, formatMinutes } from '../harness/time-utils';
import type { CheckResult, EvalScenario } from '../harness/types';

type Day = ItineraryGenerationResponse['days'][number];
type Item = Day['items'][number];

const HIKE_TITLE = /hike|hiking|trail|trek|summit|falls trail|waterfall/i;

const isCommute = (item: Item) => item.type?.toLowerCase().includes('commute');
const isAlternative = (item: Item) => item.type?.toLowerCase().includes('alternative');
const norm = (s: string) => s.toLowerCase().trim();

function findUserItem(days: Day[], activityName: string): { day: Day; item: Item } | null {
  for (const day of days) {
    for (const item of day.items) {
      if (item.title === activityName && item.is_suggested !== true && !isCommute(item)) {
        return { day, item };
      }
    }
  }
  return null;
}

export function gradePhase2(
  scenario: EvalScenario,
  itinerary: ItineraryGenerationResponse,
): CheckResult[] {
  const checks: CheckResult[] = [];
  const input = scenario.input;
  const exp = scenario.expectations ?? {};
  const days = itinerary.days ?? [];
  const allItems = days.flatMap(d => d.items ?? []);
  const push = (name: string, ok: boolean, passDetails: string, failDetails: string) =>
    checks.push({ name, status: ok ? 'pass' : 'fail', details: ok ? passDetails : failDetails });
  const skip = (name: string, why: string) => checks.push({ name, status: 'skip', details: why });

  // --- day_count -------------------------------------------------------------
  const dayNumbers = days.map(d => d.day_number).sort((a, b) => a - b);
  const expectedNumbers = Array.from({ length: input.numDays }, (_, i) => i + 1);
  push(
    'day_count',
    days.length === input.numDays && JSON.stringify(dayNumbers) === JSON.stringify(expectedNumbers),
    `${days.length} day(s), numbered 1..${input.numDays}`,
    `expected ${input.numDays} day(s) numbered 1..${input.numDays}, got ${days.length} day(s) numbered [${dayNumbers.join(', ')}]`,
  );

  // --- times_parseable ---------------------------------------------------------
  const unparseable: string[] = [];
  for (const day of days) {
    for (const item of day.items) {
      const start = parseTimeToMinutes(item.start_time);
      const end = parseTimeToMinutes(item.end_time);
      if (start === null || end === null) {
        unparseable.push(`day ${day.day_number} "${item.title}": [${item.start_time} – ${item.end_time}]`);
      } else if (end <= start) {
        unparseable.push(`day ${day.day_number} "${item.title}": end ${item.end_time} not after start ${item.start_time}`);
      }
    }
  }
  push(
    'times_parseable',
    unparseable.length === 0,
    `all ${allItems.length} items have valid start/end times`,
    unparseable.join('; '),
  );

  // --- coords_present ------------------------------------------------------------
  // Commutes are transitions, not places — Gemini legitimately emits them
  // without meaningful coordinates, so only real items are checked.
  const badCoords = allItems.filter(i => !isCommute(i)).filter(i =>
    !Number.isFinite(i.lat) || !Number.isFinite(i.lng) ||
    Math.abs(i.lat!) > 90 || Math.abs(i.lng!) > 180 ||
    (i.lat === 0 && i.lng === 0),
  );
  push(
    'coords_present',
    badCoords.length === 0,
    'every item has plausible lat/lng',
    `missing/implausible coords on: ${badCoords.map(i => `"${i.title}" (${i.lat}, ${i.lng})`).join(', ')}`,
  );

  // --- user_activities_present ----------------------------------------------------
  const hotel = input.activities.find(a => a.category === 'hotel');
  const nonHotel = input.activities.filter(a => a !== hotel);
  const missing: string[] = [];
  for (const a of nonHotel) {
    if (!findUserItem(days, a.name)) {
      const nearMiss = allItems.find(i => norm(i.title) === norm(a.name));
      missing.push(nearMiss
        ? `"${a.name}" (near-miss: "${nearMiss.title}" is_suggested=${nearMiss.is_suggested} type=${nearMiss.type})`
        : `"${a.name}"`);
    }
  }
  push(
    'user_activities_present',
    missing.length === 0,
    `all ${nonHotel.length} user activities present with exact names, non-suggested`,
    `missing or renamed: ${missing.join(', ')}`,
  );

  // --- no_overlap -----------------------------------------------------------------
  const overlaps: string[] = [];
  for (const day of days) {
    const timed = day.items
      .filter(i => !isCommute(i) && !isAlternative(i))
      .map(i => ({ i, start: parseTimeToMinutes(i.start_time), end: parseTimeToMinutes(i.end_time) }))
      .filter((x): x is { i: Item; start: number; end: number } => x.start !== null && x.end !== null)
      .sort((a, b) => a.start - b.start);
    for (let k = 1; k < timed.length; k++) {
      if (timed[k].start < timed[k - 1].end) {
        overlaps.push(`day ${day.day_number}: "${timed[k - 1].i.title}" (${timed[k - 1].i.start_time}–${timed[k - 1].i.end_time}) overlaps "${timed[k].i.title}" (${timed[k].i.start_time}–${timed[k].i.end_time})`);
      }
    }
  }
  push('no_overlap', overlaps.length === 0, 'no overlapping items within any day', overlaps.join('; '));

  // --- opening_hours ---------------------------------------------------------------
  // The itinerary has no calendar dates, so day N maps to no particular
  // weekday. The verifiable contract: each scheduled window must fit inside
  // the venue's open window on at least one weekday.
  const withHours = nonHotel.filter(a => a.openingHours?.length);
  if (withHours.length === 0) {
    skip('opening_hours', 'no activities with opening-hours data');
  } else {
    const violations: string[] = [];
    for (const a of withHours) {
      const found = findUserItem(days, a.name);
      if (!found) continue; // user_activities_present already flags this
      const start = parseTimeToMinutes(found.item.start_time);
      const end = parseTimeToMinutes(found.item.end_time);
      if (start === null || end === null) continue; // times_parseable flags this
      const fits = (a.openingHours as OpeningPeriod[]).some(p => {
        if (p.close === null) return true; // open 24h
        const openMin = p.open.hour * 60 + p.open.minute;
        // Window closing on a later weekday ≈ open until midnight for our purposes.
        const closeMin = p.close.day !== p.open.day ? 24 * 60 : p.close.hour * 60 + p.close.minute;
        return start >= openMin && end <= closeMin;
      });
      if (!fits) {
        violations.push(`"${a.name}" scheduled ${found.item.start_time}–${found.item.end_time} but hours are: ${formatOpeningHours(a.openingHours as OpeningPeriod[])}`);
      }
    }
    push(
      'opening_hours',
      violations.length === 0,
      `${withHours.length} activity(ies) scheduled within opening hours`,
      violations.join('; '),
    );
  }

  // --- hike_duration ----------------------------------------------------------------
  if (exp.phase2_hike_duration_min_minutes === undefined) {
    skip('hike_duration', 'no hike-duration expectation for this scenario');
  } else {
    const minMin = exp.phase2_hike_duration_min_minutes;
    const hikeItems = allItems.filter(i => !isCommute(i) && !isAlternative(i) && HIKE_TITLE.test(i.title));
    if (hikeItems.length === 0) {
      checks.push({ name: 'hike_duration', status: 'fail', details: 'expected a hike-like item but none found in itinerary' });
    } else {
      const short = hikeItems.filter(i => {
        const s = parseTimeToMinutes(i.start_time);
        const e = parseTimeToMinutes(i.end_time);
        return s === null || e === null || e - s < minMin;
      });
      push(
        'hike_duration',
        short.length === 0,
        `${hikeItems.length} hike item(s) scheduled ≥ ${minMin} min`,
        `hike scheduled too short (< ${minMin} min): ${short.map(i => `"${i.title}" ${i.start_time}–${i.end_time}`).join(', ')}`,
      );
    }
  }

  // --- hotel_anchor ------------------------------------------------------------------
  if (!hotel) {
    skip('hotel_anchor', 'no hotel in scenario');
  } else {
    const problems: string[] = [];
    for (const day of days) {
      if (day.items.length === 0) { problems.push(`day ${day.day_number} is empty`); continue; }
      if (!isCommute(day.items[0])) problems.push(`day ${day.day_number} does not start with a commute from the hotel`);
      if (!isCommute(day.items[day.items.length - 1])) problems.push(`day ${day.day_number} does not end with a commute to the hotel`);
    }
    const standalone = allItems.find(i => !isCommute(i) && norm(i.title) === norm(hotel.name));
    if (standalone) problems.push(`hotel "${hotel.name}" appears as a standalone item`);
    push('hotel_anchor', problems.length === 0, 'every day starts/ends with a commute; hotel never standalone', problems.join('; '));
  }

  // --- day_assignments ----------------------------------------------------------------
  const assignments = Object.entries(input.dayAssignments ?? {}).filter(
    ([key, names]) => key.startsWith('day-') && names.length > 0,
  );
  if (assignments.length === 0) {
    skip('day_assignments', 'no day assignments in scenario');
  } else {
    const misplaced: string[] = [];
    for (const [key, names] of assignments) {
      const dayNum = parseInt(key.replace('day-', ''), 10);
      const day = days.find(d => d.day_number === dayNum);
      for (const name of names) {
        const onDay = day?.items.some(i => i.title === name && i.is_suggested !== true);
        if (!onDay) {
          const actual = days.find(d => d.items.some(i => i.title === name));
          misplaced.push(`"${name}" expected on day ${dayNum}, found on ${actual ? `day ${actual.day_number}` : 'no day'}`);
        }
      }
    }
    push('day_assignments', misplaced.length === 0, 'all pinned activities on their assigned days', misplaced.join('; '));
  }

  // --- meal_balance -------------------------------------------------------------------
  const userRestaurants = new Set(
    input.activities.filter(a => a.category === 'restaurant').map(a => a.name),
  );
  if (userRestaurants.size === 0) {
    skip('meal_balance', 'no user-selected restaurants');
  } else {
    const slotOf = (startMin: number) => (startMin < 11 * 60 ? 'breakfast' : startMin < 16 * 60 ? 'lunch' : 'dinner');
    const problems: string[] = [];
    for (const day of days) {
      const slots: Record<string, string[]> = { breakfast: [], lunch: [], dinner: [] };
      for (const item of day.items) {
        if (item.is_suggested === true || isCommute(item) || isAlternative(item)) continue;
        if (!userRestaurants.has(item.title)) continue;
        const start = parseTimeToMinutes(item.start_time);
        if (start === null) continue;
        slots[slotOf(start)].push(item.title);
      }
      for (const [slot, titles] of Object.entries(slots)) {
        if (titles.length > 1) problems.push(`day ${day.day_number} has ${titles.length} user ${slot}s: ${titles.join(', ')}`);
      }
    }
    push('meal_balance', problems.length === 0, 'at most one user-selected meal per slot per day', problems.join('; '));
  }

  // --- pace ----------------------------------------------------------------------------
  if (!input.pace) {
    skip('pace', 'no pace set in scenario');
  } else {
    // Count "activities": not commutes, not alternatives, not meals.
    const MEAL_TYPE = /meal|breakfast|lunch|dinner|restaurant|food|cafe/i;
    const counts = days.map(day => ({
      day: day.day_number,
      count: day.items.filter(i =>
        !isCommute(i) && !isAlternative(i) &&
        !MEAL_TYPE.test(i.type ?? '') && !userRestaurants.has(i.title),
      ).length,
    }));
    // Bands from the prompt (relaxed 2–3, moderate 3–4, packed 5+) with ±1 grace.
    const bands: Record<string, [number, number]> = {
      relaxed: [1, 4],
      moderate: [2, 5],
      packed: [4, Infinity],
    };
    const [lo, hi] = bands[input.pace];
    const off = counts.filter(c => c.count < lo || c.count > hi);
    push(
      'pace',
      off.length === 0,
      `all days within ${input.pace} band (${lo}–${hi === Infinity ? '∞' : hi} activities): [${counts.map(c => c.count).join(', ')}]`,
      `days outside ${input.pace} band (${lo}–${hi === Infinity ? '∞' : hi}): ${off.map(c => `day ${c.day} has ${c.count}`).join(', ')}`,
    );
  }

  // --- start_time ---------------------------------------------------------------------
  if (!input.startTime) {
    skip('start_time', 'no day start time set in scenario');
  } else {
    const startMin = parseTimeToMinutes(input.startTime);
    if (startMin === null) {
      skip('start_time', `unparseable input startTime "${input.startTime}"`);
    } else {
      const early: string[] = [];
      for (const day of days) {
        const first = day.items.find(i => !isCommute(i) && !isAlternative(i));
        if (!first) continue;
        const s = parseTimeToMinutes(first.start_time);
        if (s !== null && s < startMin) {
          early.push(`day ${day.day_number} "${first.title}" starts ${first.start_time} (before ${formatMinutes(startMin)})`);
        }
      }
      push('start_time', early.length === 0, `first activity of each day at/after ${input.startTime}`, early.join('; '));
    }
  }

  // --- gap-fill / alternatives expectations ---------------------------------------------
  if (exp.phase2_min_suggested_items !== undefined) {
    const suggested = allItems.filter(i => i.is_suggested === true && !isCommute(i));
    push(
      'min_suggested_items',
      suggested.length >= exp.phase2_min_suggested_items,
      `${suggested.length} suggested item(s) (≥ ${exp.phase2_min_suggested_items})`,
      `only ${suggested.length} suggested item(s), expected ≥ ${exp.phase2_min_suggested_items}`,
    );
  }
  if (exp.phase2_min_alternative_items !== undefined) {
    const alts = allItems.filter(isAlternative);
    push(
      'min_alternative_items',
      alts.length >= exp.phase2_min_alternative_items,
      `${alts.length} alternative item(s) (≥ ${exp.phase2_min_alternative_items})`,
      `only ${alts.length} type="alternative" item(s), expected ≥ ${exp.phase2_min_alternative_items}`,
    );
  }

  return checks;
}
