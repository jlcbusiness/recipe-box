import { describe, expect, it } from 'vitest';
import {
  isOfflineRecipePath,
  MAX_OFFLINE_RECIPES,
  type OfflineRecipeEntry,
  selectRecentOfflineRecipes,
} from '../../src/lib/offline/cache-rules';

function entry(path: string, viewedAt: number, title = path) {
  return { path, title, viewedAt } satisfies OfflineRecipeEntry;
}

describe('offline cache rules', () => {
  it('recognizes only exact UUID recipe detail routes', () => {
    expect(isOfflineRecipePath('/recipes/123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isOfflineRecipePath('/recipes/123e4567-e89b-12d3-a456-426614174000/edit')).toBe(false);
    expect(isOfflineRecipePath('/recipes/123e4567-e89b-12d3-a456-426614174000/history')).toBe(
      false,
    );
    expect(isOfflineRecipePath('/r/123e4567-e89b-12d3-a456-426614174000')).toBe(false);
    expect(isOfflineRecipePath('//example.test/recipes/123e4567-e89b-12d3-a456-426614174000')).toBe(
      false,
    );
  });

  it('keeps the newest ten unique valid recipe entries first', () => {
    const entries = Array.from({ length: 12 }, (_, index) =>
      entry(`/recipes/00000000-0000-0000-0000-${String(index).padStart(12, '0')}`, index),
    );

    expect(MAX_OFFLINE_RECIPES).toBe(10);
    expect(selectRecentOfflineRecipes(entries).map(({ viewedAt }) => viewedAt)).toEqual([
      11, 10, 9, 8, 7, 6, 5, 4, 3, 2,
    ]);
  });

  it('keeps the newest version of duplicate entries and ignores invalid metadata', () => {
    const path = '/recipes/123e4567-e89b-12d3-a456-426614174000';

    expect(
      selectRecentOfflineRecipes([
        entry(path, 1, 'Old title'),
        entry(path, 2, 'New title'),
        entry('/recipes/not-a-uuid', 4, 'Invalid path'),
        entry('/recipes/123e4567-e89b-12d3-a456-426614174001', Number.NaN, 'Invalid time'),
        entry('/recipes/123e4567-e89b-12d3-a456-426614174002', 5, ''),
      ]),
    ).toEqual([entry(path, 2, 'New title')]);
  });
});
