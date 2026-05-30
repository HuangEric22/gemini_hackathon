import type { ItineraryGenerationResponse } from '@/shared';
import type { GenerateItineraryInput, ItineraryValidationIssue } from './types';

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

function parseClockTime(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toUpperCase();

  if (minutes > 59 || hours > 23) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  }

  return hours * 60 + minutes;
}

// Checks deterministic itinerary rules that prompts alone cannot guarantee.
export function validateItinerary(
  itinerary: ItineraryGenerationResponse,
  input: GenerateItineraryInput,
): ItineraryValidationIssue[] {
  const issues: ItineraryValidationIssue[] = [];

  if (itinerary.days.length !== input.numDays) {
    issues.push({
      code: 'wrong_day_count',
      message: `Expected ${input.numDays} day(s), got ${itinerary.days.length}.`,
    });
  }

  const dayNumbers = new Set<number>();
  for (const day of itinerary.days) {
    if (dayNumbers.has(day.day_number)) {
      issues.push({
        code: 'duplicate_day_number',
        message: `Day ${day.day_number} appears more than once.`,
        dayNumber: day.day_number,
      });
    }
    dayNumbers.add(day.day_number);

    if (day.day_number < 1 || day.day_number > input.numDays) {
      issues.push({
        code: 'wrong_day_number',
        message: `Day number ${day.day_number} is outside 1-${input.numDays}.`,
        dayNumber: day.day_number,
      });
    }

    let previousEnd: number | null = null;
    for (const item of day.items) {
      const start = parseClockTime(item.start_time);
      const end = parseClockTime(item.end_time);
      if (start !== null && end !== null && previousEnd !== null && start < previousEnd) {
        issues.push({
          code: 'overlapping_items',
          message: `${item.title} starts before the previous item ends.`,
          dayNumber: day.day_number,
          itemTitle: item.title,
        });
      }
      if (end !== null) previousEnd = end;
    }
  }

  const itineraryTitles = new Set(
    itinerary.days.flatMap(day =>
      day.items
        .filter(item => item.type !== 'commute')
        .map(item => normalizeTitle(item.title)),
    ),
  );

  for (const activity of input.activities) {
    if (activity.category === 'hotel') continue;
    if (!itineraryTitles.has(normalizeTitle(activity.name))) {
      issues.push({
        code: 'missing_activity',
        message: `Missing selected activity: ${activity.name}.`,
        itemTitle: activity.name,
      });
    }
  }

  return issues;
}

