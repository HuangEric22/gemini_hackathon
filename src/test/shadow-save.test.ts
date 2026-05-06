import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlaceSnapshot } from '@/app/actions/shadow-save-activities';

// --------------------------------------------------------------------------
// vi.hoisted() ensures these spies exist before vi.mock() factories run.
// The Drizzle call chain is: db.insert().values().onConflictDoUpdate().returning()
// --------------------------------------------------------------------------
const { mockInsert, mockValues, mockOnConflictDoUpdate, mockReturning } = vi.hoisted(() => {
  const mockReturning = vi.fn().mockResolvedValue([]);
  const mockOnConflictDoUpdate = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  return { mockInsert, mockValues, mockOnConflictDoUpdate, mockReturning };
});

vi.mock('@/db', () => ({
  db: { insert: mockInsert },
}));

vi.mock('drizzle-orm', () => ({
  sql: vi.fn((strings: TemplateStringsArray) => strings[0]),
}));

vi.mock('@/db/schema', () => ({
  // Must be an object so that `activities.googlePlaceId` resolves to something defined
  activities: { googlePlaceId: 'google_place_id' },
}));

import { shadowSaveActivities } from '@/app/actions/shadow-save-activities';

// --------------------------------------------------------------------------
// Reusable test data
// --------------------------------------------------------------------------
function makeSnapshot(overrides: Partial<PlaceSnapshot> = {}): PlaceSnapshot {
  return {
    googlePlaceId: 'ChIJ_test_1',
    name: 'Fushimi Inari Shrine',
    lat: 34.9671,
    lng: 135.7727,
    address: '68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto',
    city: 'Kyoto',
    category: 'attraction',
    rating: 4.7,
    imageUrl: 'https://example.com/fushimi.jpg',
    ...overrides,
  };
}

describe('shadowSaveActivities', () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockValues.mockClear();
    mockOnConflictDoUpdate.mockClear();
    mockReturning.mockClear();
  });

  it('inserts all provided snapshots into the activities table', async () => {
    const places = [makeSnapshot(), makeSnapshot({ googlePlaceId: 'ChIJ_test_2', name: 'Kinkaku-ji' })];
    await shadowSaveActivities(places);

    expect(mockInsert).toHaveBeenCalledWith({ googlePlaceId: 'google_place_id' });
    expect(mockValues).toHaveBeenCalledWith(places);
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it('does nothing when given an empty array (no DB call)', async () => {
    await shadowSaveActivities([]);

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('uses googlePlaceId as the conflict target for upserts', async () => {
    await shadowSaveActivities([makeSnapshot()]);

    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.anything(),
      }),
    );
  });

  it('updates rating and imageUrl on conflict so fresh data wins on re-save', async () => {
    await shadowSaveActivities([makeSnapshot()]);

    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          rating: expect.anything(),
          imageUrl: expect.anything(),
        }),
      }),
    );
  });

  it('handles a single snapshot without throwing', async () => {
    await expect(shadowSaveActivities([makeSnapshot()])).resolves.not.toThrow();
  });
});
