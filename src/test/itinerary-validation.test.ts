import { describe, it, expect } from 'vitest';
import type { OpeningPeriod } from '@/db/schema';
import type { ItineraryGenerationResponse } from '@/shared';
import {
  parseTimeToMinutes,
  formatMinutes,
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
  validateItinerary,
  type TripInputForValidation,
  type ItineraryItem,
} from '@/lib/itinerary-validation';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const item = (title: string, start: string, end: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  title,
  start_time: start,
  end_time: end,
  type: 'attraction',
  is_suggested: false,
  lat: 35.66,
  lng: 139.7,
  ...over,
});

const commute = (start: string, end: string): ItineraryItem =>
  item('Commute', start, end, { type: 'commute', commute_info: '10 min drive' });

const day = (day_number: number, items: ItineraryItem[]) => ({
  day_number,
  brief_description: `Day ${day_number}`,
  items,
});

const itin = (...days: ItineraryGenerationResponse['days']): ItineraryGenerationResponse => ({ days });

const input = (over: Partial<TripInputForValidation> = {}): TripInputForValidation => ({
  activities: [{ name: 'Museum' }],
  numDays: 1,
  ...over,
});

/** Opening hours: same window each day of the week. */
const dailyHours = (openHour: number, closeHour: number): OpeningPeriod[] =>
  Array.from({ length: 7 }, (_, d) => ({
    open: { day: d, hour: openHour, minute: 0 },
    close: { day: d, hour: closeHour, minute: 0 },
  }));

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

describe('parseTimeToMinutes', () => {
  it.each([
    ['9:00 AM', 540],
    ['9 AM', 540],
    ['12:00 AM', 0],
    ['12:30 PM', 750],
    ['9:15 p.m.', 21 * 60 + 15],
    ['09:00', 540],
    ['21:30', 1290],
    ['0:00', 0],
  ])('parses %s → %d', (raw, expected) => {
    expect(parseTimeToMinutes(raw)).toBe(expected);
  });

  it.each(['noon', '25:00', '13:00 PM', '10:75', '', null, undefined])(
    'rejects %s',
    raw => expect(parseTimeToMinutes(raw as string | null | undefined)).toBeNull(),
  );
});

describe('formatMinutes', () => {
  it('formats minutes since midnight', () => {
    expect(formatMinutes(0)).toBe('12:00 AM');
    expect(formatMinutes(540)).toBe('9:00 AM');
    expect(formatMinutes(750)).toBe('12:30 PM');
    expect(formatMinutes(1290)).toBe('9:30 PM');
  });
});

// ---------------------------------------------------------------------------
// Structural checks
// ---------------------------------------------------------------------------

describe('checkDayCount', () => {
  it('passes when days are numbered 1..N', () => {
    const i = input({ numDays: 2 });
    expect(checkDayCount(i, itin(day(1, []), day(2, [])))).toEqual([]);
  });

  it('fails on wrong day count', () => {
    const i = input({ numDays: 3 });
    const v = checkDayCount(i, itin(day(1, []), day(2, [])));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('expected exactly 3 day(s)');
  });

  it('fails on wrong numbering even with right count', () => {
    const i = input({ numDays: 2 });
    expect(checkDayCount(i, itin(day(1, []), day(3, [])))).toHaveLength(1);
  });
});

describe('checkTimesParseable', () => {
  it('flags unparseable and inverted times', () => {
    const v = checkTimesParseable(input(), itin(day(1, [
      item('Museum', 'morningish', '11:00 AM'),
      item('Park', '2:00 PM', '1:00 PM'),
      item('OK', '3:00 PM', '4:00 PM'),
    ])));
    expect(v).toHaveLength(2);
    expect(v[0]).toContain('unparseable');
    expect(v[1]).toContain('at or before it starts');
  });
});

describe('checkCoords', () => {
  it('flags (0,0) and out-of-range coords but exempts commutes', () => {
    const v = checkCoords(input(), itin(day(1, [
      item('Museum', '9:00 AM', '10:00 AM', { lat: 0, lng: 0 }),
      item('Park', '10:00 AM', '11:00 AM', { lat: 137, lng: 20 }),
      item('NoCoords', '11:00 AM', '12:00 PM', { lat: undefined, lng: undefined }),
      commute('12:00 PM', '12:10 PM'),
      item('Fine', '1:00 PM', '2:00 PM'),
    ])));
    expect(v).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// User activity presence (the is_suggested/alternative contract)
// ---------------------------------------------------------------------------

describe('checkUserActivitiesPresent', () => {
  const twoActivities = input({ activities: [{ name: 'Museum' }, { name: 'Sushi Dai', category: 'restaurant' }] });

  it('passes when every activity is scheduled with its exact name', () => {
    const v = checkUserActivitiesPresent(twoActivities, itin(day(1, [
      item('Museum', '9:00 AM', '11:00 AM'),
      item('Sushi Dai', '12:00 PM', '1:00 PM', { type: 'restaurant' }),
    ])));
    expect(v).toEqual([]);
  });

  it('counts a user pick demoted to type="alternative" as present (is_suggested=false)', () => {
    const v = checkUserActivitiesPresent(twoActivities, itin(day(1, [
      item('Museum', '9:00 AM', '11:00 AM'),
      item('Sushi Dai', '12:00 PM', '1:00 PM', { type: 'alternative' }),
    ])));
    expect(v).toEqual([]);
  });

  it('tolerates is_suggested=true on an alternative (legacy model behavior)', () => {
    const v = checkUserActivitiesPresent(twoActivities, itin(day(1, [
      item('Museum', '9:00 AM', '11:00 AM'),
      item('Sushi Dai', '12:00 PM', '1:00 PM', { type: 'alternative', is_suggested: true }),
    ])));
    expect(v).toEqual([]);
  });

  it('flags a user activity that only appears as an AI suggestion', () => {
    const v = checkUserActivitiesPresent(twoActivities, itin(day(1, [
      item('Museum', '9:00 AM', '11:00 AM'),
      item('Sushi Dai', '12:00 PM', '1:00 PM', { type: 'restaurant', is_suggested: true }),
    ])));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('only appears as an AI suggestion');
  });

  it('flags dropped and renamed activities', () => {
    const v = checkUserActivitiesPresent(twoActivities, itin(day(1, [
      item('The Museum', '9:00 AM', '11:00 AM'), // renamed
    ])));
    expect(v).toHaveLength(2);
    expect(v.join(' ')).toContain('"Museum" is missing');
    expect(v.join(' ')).toContain('"Sushi Dai" is missing');
  });

  it('ignores the hotel', () => {
    const i = input({ activities: [{ name: 'Hotel Nikko', category: 'hotel' }, { name: 'Museum' }] });
    const v = checkUserActivitiesPresent(i, itin(day(1, [item('Museum', '9:00 AM', '11:00 AM')])));
    expect(v).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Overlaps, hours, anchors, assignments
// ---------------------------------------------------------------------------

describe('checkNoOverlap', () => {
  it('flags overlapping scheduled items but ignores commutes and alternatives', () => {
    const v = checkNoOverlap(input(), itin(day(1, [
      item('Museum', '9:00 AM', '11:00 AM'),
      item('Park', '10:30 AM', '12:00 PM'),
      item('Alt', '10:00 AM', '11:00 AM', { type: 'alternative' }),
      commute('9:30 AM', '9:45 AM'),
    ])));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('overlaps');
  });

  it('passes back-to-back items', () => {
    const v = checkNoOverlap(input(), itin(day(1, [
      item('Museum', '9:00 AM', '11:00 AM'),
      item('Park', '11:00 AM', '12:00 PM'),
    ])));
    expect(v).toEqual([]);
  });
});

describe('checkOpeningHours', () => {
  const soba = input({
    activities: [{ name: 'Kanda Matsuya', category: 'restaurant', openingHours: dailyHours(11, 20) }],
  });

  it('flags a venue scheduled before it opens (the tokyo-meals failure)', () => {
    const v = checkOpeningHours(soba, itin(day(1, [
      item('Kanda Matsuya', '9:20 AM', '10:05 AM', { type: 'restaurant' }),
    ])));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('outside its opening hours');
  });

  it('passes a venue scheduled within hours', () => {
    const v = checkOpeningHours(soba, itin(day(1, [
      item('Kanda Matsuya', '12:00 PM', '1:00 PM', { type: 'restaurant' }),
    ])));
    expect(v).toEqual([]);
  });

  it('treats close=null as open 24h', () => {
    const i = input({ activities: [{ name: 'Park', openingHours: [{ open: { day: 0, hour: 0, minute: 0 }, close: null }] }] });
    const v = checkOpeningHours(i, itin(day(1, [item('Park', '5:00 AM', '6:00 AM')])));
    expect(v).toEqual([]);
  });

  it('treats a window closing on a later weekday as open until midnight', () => {
    const i = input({
      activities: [{ name: 'Bar', openingHours: [{ open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }] }],
    });
    const v = checkOpeningHours(i, itin(day(1, [item('Bar', '10:00 PM', '11:30 PM')])));
    expect(v).toEqual([]);
  });

  it('does not check items that only appear as alternatives', () => {
    const v = checkOpeningHours(soba, itin(day(1, [
      item('Kanda Matsuya', '9:20 AM', '10:05 AM', { type: 'alternative' }),
    ])));
    expect(v).toEqual([]);
  });
});

describe('checkHotelAnchor', () => {
  const withHotel = input({ activities: [{ name: 'Hotel Nikko', category: 'hotel' }, { name: 'Museum' }] });

  it('returns nothing when there is no hotel', () => {
    expect(checkHotelAnchor(input(), itin(day(1, [item('Museum', '9:00 AM', '10:00 AM')])))).toEqual([]);
  });

  it('requires each day to start and end with a commute', () => {
    const v = checkHotelAnchor(withHotel, itin(day(1, [
      item('Museum', '9:00 AM', '10:00 AM'),
      commute('10:00 AM', '10:15 AM'),
    ])));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('does not start with a commute');
  });

  it('flags the hotel as a standalone activity', () => {
    const v = checkHotelAnchor(withHotel, itin(day(1, [
      commute('8:45 AM', '9:00 AM'),
      item('Hotel Nikko', '9:00 AM', '10:00 AM'),
      commute('10:00 AM', '10:15 AM'),
    ])));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('standalone');
  });

  it('passes a properly anchored day', () => {
    const v = checkHotelAnchor(withHotel, itin(day(1, [
      commute('8:45 AM', '9:00 AM'),
      item('Museum', '9:00 AM', '10:00 AM'),
      commute('10:00 AM', '10:15 AM'),
    ])));
    expect(v).toEqual([]);
  });
});

describe('checkDayAssignments', () => {
  const assigned = input({
    numDays: 2,
    activities: [{ name: 'Museum' }, { name: 'Park' }],
    dayAssignments: { 'day-2': ['Museum'], unassigned: ['Park'] },
  });

  it('passes when the pinned activity is on its day', () => {
    const v = checkDayAssignments(assigned, itin(
      day(1, [item('Park', '9:00 AM', '10:00 AM')]),
      day(2, [item('Museum', '9:00 AM', '10:00 AM')]),
    ));
    expect(v).toEqual([]);
  });

  it('flags a pinned activity on the wrong day', () => {
    const v = checkDayAssignments(assigned, itin(
      day(1, [item('Museum', '9:00 AM', '10:00 AM')]),
      day(2, [item('Park', '9:00 AM', '10:00 AM')]),
    ));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('appears on day 1');
  });
});

// ---------------------------------------------------------------------------
// Meals + pace + start time
// ---------------------------------------------------------------------------

describe('checkMealBalance', () => {
  const restaurants = input({
    activities: [
      { name: 'Sushi Dai', category: 'restaurant' },
      { name: 'Kanda Matsuya', category: 'restaurant' },
    ],
  });

  it('flags two user breakfasts on one day (the tokyo-meals failure)', () => {
    const v = checkMealBalance(restaurants, itin(day(1, [
      item('Sushi Dai', '7:00 AM', '8:00 AM', { type: 'restaurant' }),
      item('Kanda Matsuya', '9:20 AM', '10:05 AM', { type: 'restaurant' }),
    ])));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('2 user-selected breakfasts');
  });

  it('does not count alternatives toward a slot', () => {
    const v = checkMealBalance(restaurants, itin(day(1, [
      item('Sushi Dai', '7:00 AM', '8:00 AM', { type: 'restaurant' }),
      item('Kanda Matsuya', '7:00 AM', '8:00 AM', { type: 'alternative' }),
    ])));
    expect(v).toEqual([]);
  });

  it('passes one meal per slot', () => {
    const v = checkMealBalance(restaurants, itin(day(1, [
      item('Sushi Dai', '7:00 AM', '8:00 AM', { type: 'restaurant' }),
      item('Kanda Matsuya', '12:00 PM', '1:00 PM', { type: 'restaurant' }),
    ])));
    expect(v).toEqual([]);
  });
});

describe('checkPace', () => {
  const packed = input({
    pace: 'packed',
    activities: [{ name: 'Sushi Dai', category: 'restaurant' }, { name: 'Museum' }],
  });

  it('flags a packed day with too few non-meal activities (the sf-packed-luxury failure)', () => {
    const v = checkPace(packed, itin(day(1, [
      item('Museum', '9:00 AM', '11:00 AM'),
      item('Park', '11:00 AM', '12:00 PM'),
      item('Sushi Dai', '12:00 PM', '1:00 PM', { type: 'restaurant' }),
    ])));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('outside the packed-pace range');
  });

  it('counts AI-suggested activities toward the pace but not meals, commutes, or alternatives', () => {
    const v = checkPace(packed, itin(day(1, [
      item('Museum', '9:00 AM', '10:00 AM'),
      item('Suggested A', '10:00 AM', '11:00 AM', { is_suggested: true }),
      item('Suggested B', '11:00 AM', '12:00 PM', { is_suggested: true }),
      item('Sushi Dai', '12:00 PM', '1:00 PM', { type: 'restaurant' }),   // user meal: excluded
      item('Cafe Stop', '1:00 PM', '1:30 PM', { type: 'cafe' }),          // meal type: excluded
      commute('1:30 PM', '2:00 PM'),                                       // excluded
      item('Alt', '2:00 PM', '3:00 PM', { type: 'alternative' }),          // excluded
      item('Park', '3:00 PM', '5:00 PM'),
    ])));
    expect(v).toEqual([]); // 4 countable ≥ packed lower bound of 4
  });

  it('flags a relaxed day with too many activities', () => {
    const relaxed = input({ pace: 'relaxed' });
    const v = checkPace(relaxed, itin(day(1,
      ['A', 'B', 'C', 'D', 'E'].map((t, k) => item(t, `${k + 1}:00 PM`, `${k + 1}:30 PM`)),
    )));
    expect(v).toHaveLength(1);
  });

  it('returns nothing when no pace is set', () => {
    expect(checkPace(input(), itin(day(1, [])))).toEqual([]);
  });
});

describe('checkStartTime', () => {
  const early = input({ startTime: '9:00 AM' });

  it('flags a first activity before the requested start', () => {
    const v = checkStartTime(early, itin(day(1, [item('Museum', '8:00 AM', '10:00 AM')])));
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('before the requested day start');
  });

  it('ignores leading commutes when finding the first activity', () => {
    const v = checkStartTime(early, itin(day(1, [
      commute('8:45 AM', '9:00 AM'),
      item('Museum', '9:00 AM', '10:00 AM'),
    ])));
    expect(v).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

describe('validateItinerary', () => {
  it('returns no violations for a clean itinerary', () => {
    const i = input({
      numDays: 1,
      pace: 'relaxed',
      startTime: '9:00 AM',
      activities: [
        { name: 'Hotel Nikko', category: 'hotel' },
        { name: 'Museum', openingHours: dailyHours(9, 18) },
        { name: 'Sushi Dai', category: 'restaurant' },
      ],
    });
    const clean = itin(day(1, [
      commute('8:45 AM', '9:00 AM'),
      item('Museum', '9:00 AM', '11:00 AM'),
      commute('11:00 AM', '11:15 AM'),
      item('Sushi Dai', '12:00 PM', '1:00 PM', { type: 'restaurant' }),
      item('Park Stroll', '1:30 PM', '3:00 PM', { is_suggested: true }),
      commute('3:00 PM', '3:15 PM'),
    ]));
    expect(validateItinerary(i, clean)).toEqual([]);
  });

  it('aggregates violations across checks', () => {
    const i = input({
      numDays: 2,
      pace: 'packed',
      activities: [{ name: 'Museum', openingHours: dailyHours(11, 18) }],
    });
    const bad = itin(day(1, [item('Museum', '9:00 AM', '10:00 AM')])); // 1 day instead of 2, before opening, under packed pace
    const v = validateItinerary(i, bad);
    expect(v.length).toBeGreaterThanOrEqual(3);
    expect(v.join('\n')).toContain('expected exactly 2 day(s)');
    expect(v.join('\n')).toContain('outside its opening hours');
    expect(v.join('\n')).toContain('outside the packed-pace range');
  });
});
