import { describe, expect, it } from 'vitest';
import {
  buildSyntheticRecipeTimeEntries,
  sameSyntheticRecipeTimeEntries,
} from '../../scripts/synthetic-recipe-time-entries.mjs';
import fixture from '../fixtures/recipe-box-synthetic-site-sample.json';

const picklists = new Map([
  ['time_type:Prep', 'prep-id'],
  ['time_type:Mixing', 'mixing-id'],
  ['time_type:Marinate', 'marinate-id'],
  ['time_type:Chill', 'chill-id'],
  ['time_type:Freeze', 'freeze-id'],
  ['time_type:Cook', 'cook-id'],
  ['time_type:Bake', 'bake-id'],
  ['time_type:Cooling', 'cooling-id'],
  ['time_type:Rest', 'rest-id'],
]);

describe('synthetic recipe time entries', () => {
  it('converts legacy component times in order and ignores the legacy total', () => {
    expect(
      buildSyntheticRecipeTimeEntries(
        {
          prepMinutes: 12,
          mixingMinutes: null,
          marinateMinutes: null,
          chillMinutes: null,
          freezeMinutes: null,
          cookMinutes: null,
          bakeMinutes: 8,
          coolingMinutes: 40,
          restMinutes: null,
          totalMinutes: 999,
        },
        picklists,
      ),
    ).toEqual([
      { time_type_id: 'prep-id', minutes: 12, position: 0 },
      { time_type_id: 'bake-id', minutes: 8, position: 1 },
      { time_type_id: 'cooling-id', minutes: 40, position: 2 },
    ]);
  });

  it('maps a total-only legacy recipe to Cook', () => {
    expect(
      buildSyntheticRecipeTimeEntries(
        {
          prepMinutes: null,
          mixingMinutes: null,
          marinateMinutes: null,
          chillMinutes: null,
          freezeMinutes: null,
          cookMinutes: null,
          bakeMinutes: null,
          coolingMinutes: null,
          restMinutes: null,
          totalMinutes: 40,
        },
        picklists,
      ),
    ).toEqual([{ time_type_id: 'cook-id', minutes: 40, position: 0 }]);
  });

  it('keeps recipes with no times empty', () => {
    expect(
      buildSyntheticRecipeTimeEntries(
        {
          prepMinutes: null,
          mixingMinutes: null,
          marinateMinutes: null,
          chillMinutes: null,
          freezeMinutes: null,
          cookMinutes: null,
          bakeMinutes: null,
          coolingMinutes: null,
          restMinutes: null,
          totalMinutes: null,
        },
        picklists,
      ),
    ).toEqual([]);
  });

  it('converts every legacy fixture recipe without changing its derived total', () => {
    let recipeCount = 0;
    let entryCount = 0;

    for (const publication of fixture.publications) {
      for (const recipe of publication.recipes) {
        const recipeEntries = buildSyntheticRecipeTimeEntries(recipe.times, picklists);
        recipeCount += 1;
        entryCount += recipeEntries.length;
        expect(recipeEntries.reduce((total, entry) => total + entry.minutes, 0)).toBe(
          recipe.times.totalMinutes ?? 0,
        );
        expect(recipeEntries.map((entry) => entry.position)).toEqual(
          recipeEntries.map((_, position) => position),
        );
      }
    }

    expect(recipeCount).toBe(51);
    expect(entryCount).toBe(164);
  });

  it('compares saved entries by type, minutes, and position', () => {
    const requested = [{ time_type_id: 'cook-id', minutes: 40, position: 0 }];

    expect(
      sameSyntheticRecipeTimeEntries(
        [{ time_type_id: 'cook-id', minutes: '40', position: '0' }],
        requested,
      ),
    ).toBe(true);
    expect(
      sameSyntheticRecipeTimeEntries(
        [{ time_type_id: 'prep-id', minutes: 40, position: 0 }],
        requested,
      ),
    ).toBe(false);
    expect(sameSyntheticRecipeTimeEntries([], requested)).toBe(false);
  });
});
