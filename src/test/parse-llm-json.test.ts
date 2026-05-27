import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { itineraryDaySchema, itineraryGenerationResponseSchema, stringArraySchema } from '@/lib/llm-output-schemas';
import { parseLlmJson } from '@/lib/parse-llm-json';

const validDay = {
  day_number: 1,
  brief_description: 'A relaxed first day.',
  items: [
    {
      title: 'Fushimi Inari Shrine',
      start_time: '09:00',
      end_time: '11:00',
      type: 'activity',
    },
  ],
};

describe('parseLlmJson', () => {
  it('throws a clear error when model text is empty', () => {
    expect(() => parseLlmJson('', 'test-model', stringArraySchema)).toThrow(
      'Model test-model returned an empty response',
    );
  });

  it('throws a clear error when model text is invalid JSON', () => {
    expect(() => parseLlmJson('{ nope', 'test-model', stringArraySchema)).toThrow(
      'Model test-model returned invalid JSON',
    );
  });

  it('throws a clear error when JSON has the wrong shape', () => {
    expect(() => parseLlmJson('{"days":"not-an-array"}', 'test-model', itineraryGenerationResponseSchema)).toThrow(
      'Model test-model returned JSON with an invalid shape',
    );
  });

  it('returns a valid itinerary response', () => {
    const result = parseLlmJson(
      JSON.stringify({ days: [validDay] }),
      'test-model',
      itineraryGenerationResponseSchema,
    );

    expect(result.days[0].items[0].title).toBe('Fushimi Inari Shrine');
  });

  it('returns a valid regenerated day', () => {
    const result = parseLlmJson(JSON.stringify(validDay), 'test-model', itineraryDaySchema);

    expect(result.day_number).toBe(1);
  });

  it('returns a valid string array', () => {
    const result = parseLlmJson('["Osaka", "Nara"]', 'test-model', stringArraySchema);

    expect(result).toEqual(['Osaka', 'Nara']);
  });

  it('works with any provided Zod schema', () => {
    const result = parseLlmJson('{"ok":true}', 'test-model', z.object({ ok: z.boolean() }));

    expect(result.ok).toBe(true);
  });
});
