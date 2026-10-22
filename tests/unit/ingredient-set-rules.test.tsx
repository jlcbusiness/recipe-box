import { describe, expect, it } from 'vitest';
import {
  createDefaultIngredientSet,
  type IngredientSetDraft,
  moveIngredientRowToSet,
  normalizeIngredientSets,
  sortIngredientsBySet,
  validateIngredientSetLabels,
} from '../../src/lib/recipes/ingredient-set-rules';

const sets: IngredientSetDraft[] = [
  { id: 'set-main', label: 'Main', position: 0 },
  { id: 'set-sauce', label: 'For the sauce', position: 1 },
];

const rows = [
  { id: 'row-onion', ingredientSetId: 'set-main', position: 0, name: 'Onion' },
  { id: 'row-tomato', ingredientSetId: 'set-main', position: 1, name: 'Tomato' },
  { id: 'row-water', ingredientSetId: 'set-sauce', position: 2, name: 'Water' },
];

describe('ingredient set rules', () => {
  it('creates the stable default label at position zero', () => {
    expect(createDefaultIngredientSet('set-default')).toEqual({
      id: 'set-default',
      label: 'Main',
      position: 0,
    });
  });

  it('trims labels and renumbers sets in their submitted order', () => {
    expect(
      normalizeIngredientSets([
        { id: 'set-sauce', label: ' For the sauce ', position: 8 },
        { id: 'set-main', label: 'Main', position: 2 },
      ]),
    ).toEqual([
      { id: 'set-main', label: 'Main', position: 0 },
      { id: 'set-sauce', label: 'For the sauce', position: 1 },
    ]);
  });

  it('requires one set and rejects blank, long, duplicate, or repeated set IDs', () => {
    expect(validateIngredientSetLabels([])).toBe('at-least-one');
    expect(validateIngredientSetLabels([{ id: 'a', label: '  ', position: 0 }])).toBe(
      'empty-label',
    );
    expect(validateIngredientSetLabels([{ id: 'a', label: 'x'.repeat(81), position: 0 }])).toBe(
      'label-too-long',
    );
    expect(
      validateIngredientSetLabels([
        { id: 'a', label: 'For sauce', position: 0 },
        { id: 'b', label: ' for SAUCE ', position: 1 },
      ]),
    ).toBe('duplicate-label');
    expect(
      validateIngredientSetLabels([
        { id: 'a', label: 'Main', position: 0 },
        { id: 'a', label: 'Sauce', position: 1 },
      ]),
    ).toBe('duplicate-id');
  });

  it('moves a row by stable ID without changing its identity or other fields', () => {
    expect(moveIngredientRowToSet(rows, 'row-onion', 'set-sauce', sets)).toEqual([
      { ...rows[0], ingredientSetId: 'set-sauce' },
      rows[1],
      rows[2],
    ]);
    expect(moveIngredientRowToSet(rows, 'missing-row', 'set-sauce', sets)).toBe(rows);
    expect(moveIngredientRowToSet(rows, 'row-onion', 'missing-set', sets)).toBe(rows);
  });

  it('keeps set order and applies the selected sort only within each set', () => {
    const readerRows = rows.map(({ ingredientSetId, ...row }) => ({
      ...row,
      ingredient_set_id: ingredientSetId,
    }));
    const sorted = sortIngredientsBySet(
      [...sets].reverse(),
      [...readerRows].reverse(),
      (left, right) => left.name.localeCompare(right.name),
    );

    expect(sorted.map((row) => row.id)).toEqual(['row-onion', 'row-tomato', 'row-water']);
  });
});
