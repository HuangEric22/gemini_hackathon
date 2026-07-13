/**
 * Phase-2 grader — deterministic hard-contract checks on the itinerary.
 *
 * The check logic itself lives in src/lib/itinerary-validation.ts and is
 * shared with the production validate-and-repair loop, so the eval grades
 * exactly the contract that generation enforces. This file maps those
 * checks onto CheckResults (pass/fail/skip) and adds the eval-only
 * expectation checks (hike duration, min suggested/alternative items).
 *
 * Which checks run is derived from the scenario input itself (e.g.
 * hotel_anchor only when a hotel is selected, pace only when input.pace is
 * set), so scenarios don't need to enumerate them. Inapplicable checks are
 * reported as 'skip' so the scorecard shape is stable across scenarios.
 */

import type { ItineraryGenerationResponse } from '@/shared';
import {
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
  parseTimeToMinutes,
  isCommute,
  isAlternative,
  type TripInputForValidation,
} from '@/lib/itinerary-validation';
import type { CheckResult, EvalScenario } from '../harness/types';

const HIKE_TITLE = /hike|hiking|trail|trek|summit|falls trail|waterfall/i;

export function gradePhase2(
  scenario: EvalScenario,
  itinerary: ItineraryGenerationResponse,
): CheckResult[] {
  const checks: CheckResult[] = [];
  const input = scenario.input;
  const exp = scenario.expectations ?? {};
  const allItems = (itinerary.days ?? []).flatMap(d => d.items ?? []);

  const push = (
    name: string,
    check: (input: TripInputForValidation, itinerary: ItineraryGenerationResponse) => string[],
    passDetails: string,
  ) => {
    const violations = check(input, itinerary);
    checks.push({
      name,
      status: violations.length === 0 ? 'pass' : 'fail',
      details: violations.length === 0 ? passDetails : violations.join('; '),
    });
  };
  const skip = (name: string, why: string) => checks.push({ name, status: 'skip', details: why });

  const nonHotel = input.activities.filter(a => a.category !== 'hotel');

  push('day_count', checkDayCount, `${input.numDays} day(s), numbered 1..${input.numDays}`);
  push('times_parseable', checkTimesParseable, `all ${allItems.length} items have valid start/end times`);
  push('coords_present', checkCoords, 'every item has plausible lat/lng');
  push(
    'user_activities_present',
    checkUserActivitiesPresent,
    `all ${nonHotel.length} user activities present with exact names (scheduled or as alternatives)`,
  );
  push('no_overlap', checkNoOverlap, 'no overlapping items within any day');

  if (nonHotel.some(a => a.openingHours?.length)) {
    push('opening_hours', checkOpeningHours, 'all scheduled user activities within opening hours');
  } else {
    skip('opening_hours', 'no activities with opening-hours data');
  }

  // --- hike_duration (eval-only expectation) ---------------------------------
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
      checks.push({
        name: 'hike_duration',
        status: short.length === 0 ? 'pass' : 'fail',
        details: short.length === 0
          ? `${hikeItems.length} hike item(s) scheduled ≥ ${minMin} min`
          : `hike scheduled too short (< ${minMin} min): ${short.map(i => `"${i.title}" ${i.start_time}–${i.end_time}`).join(', ')}`,
      });
    }
  }

  if (input.activities.some(a => a.category === 'hotel')) {
    push('hotel_anchor', checkHotelAnchor, 'every day starts/ends with a commute; hotel never standalone');
  } else {
    skip('hotel_anchor', 'no hotel in scenario');
  }

  const hasAssignments = Object.entries(input.dayAssignments ?? {}).some(
    ([key, names]) => key.startsWith('day-') && names.length > 0,
  );
  if (hasAssignments) {
    push('day_assignments', checkDayAssignments, 'all pinned activities on their assigned days');
  } else {
    skip('day_assignments', 'no day assignments in scenario');
  }

  if (input.activities.some(a => a.category === 'restaurant')) {
    push('meal_balance', checkMealBalance, 'at most one user-selected meal per slot per day');
  } else {
    skip('meal_balance', 'no user-selected restaurants');
  }

  if (input.pace) {
    push('pace', checkPace, `all days within ${input.pace} band`);
  } else {
    skip('pace', 'no pace set in scenario');
  }

  if (input.startTime) {
    if (parseTimeToMinutes(input.startTime) === null) {
      skip('start_time', `unparseable input startTime "${input.startTime}"`);
    } else {
      push('start_time', checkStartTime, `first activity of each day at/after ${input.startTime}`);
    }
  } else {
    skip('start_time', 'no day start time set in scenario');
  }

  // --- gap-fill / alternatives expectations (eval-only) ------------------------
  if (exp.phase2_min_suggested_items !== undefined) {
    const suggested = allItems.filter(i => i.is_suggested === true && !isCommute(i));
    checks.push({
      name: 'min_suggested_items',
      status: suggested.length >= exp.phase2_min_suggested_items ? 'pass' : 'fail',
      details: suggested.length >= exp.phase2_min_suggested_items
        ? `${suggested.length} suggested item(s) (≥ ${exp.phase2_min_suggested_items})`
        : `only ${suggested.length} suggested item(s), expected ≥ ${exp.phase2_min_suggested_items}`,
    });
  }
  if (exp.phase2_min_alternative_items !== undefined) {
    const alts = allItems.filter(isAlternative);
    checks.push({
      name: 'min_alternative_items',
      status: alts.length >= exp.phase2_min_alternative_items ? 'pass' : 'fail',
      details: alts.length >= exp.phase2_min_alternative_items
        ? `${alts.length} alternative item(s) (≥ ${exp.phase2_min_alternative_items})`
        : `only ${alts.length} type="alternative" item(s), expected ≥ ${exp.phase2_min_alternative_items}`,
    });
  }

  return checks;
}
