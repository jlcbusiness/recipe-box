import { describe, expect, it } from 'vitest';
import type { RecipeIngredient } from '../../src/lib/recipes/data';
import {
  applyMeasureEquivalent,
  getResolvedMeasureEquivalent,
} from '../../src/lib/recipes/measure-equivalent-rules';
import { transformIngredientForDisplay } from '../../src/lib/recipes/recipe-reader-rules';

const ingredient: RecipeIngredient = {
  id: 'lemon-row',
  ingredient_id: 'lemon',
  ingredient_set_id: 'main',
  ingredient_name: 'Lemon',
  position: 0,
  is_main: false,
  detail: '',
  preparation: 'juiced',
  portion_one_ratio: null,
  size_value: null,
  size_unit: null,
  nutrition_equivalent: {
    measurementType: 'count',
    picklistValueId: null,
    picklistValue: null,
    volume: { amount: 0.5, unitCode: 'cup' },
    weight: null,
  },
  density: {
    volumeAmount: 1,
    volumeUnitCode: 'cup',
    weightAmount: 240,
    weightUnitCode: 'g',
  },
  measurements: [
    {
      id: 'count-measure',
      position: 0,
      measurement_type: 'count',
      amount_min: 2,
      amount_max: 3,
      unit_code: null,
      picklist_value_id: null,
      picklist_value: null,
    },
  ],
};

describe('recipe measure equivalent rules', () => {
  it('keeps Count initially, then resolves both dimensions without mutating the recipe', () => {
    expect(applyMeasureEquivalent(ingredient).measurements).toEqual(ingredient.measurements);
    const displayIngredient = applyMeasureEquivalent(ingredient, {
      showEquivalentMeasures: true,
    });

    expect(displayIngredient.measurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurement_type: 'volume',
          amount_min: 1,
          amount_max: 1.5,
          unit_code: 'cup',
        }),
        expect.objectContaining({
          measurement_type: 'weight',
          amount_min: 240,
          amount_max: 360,
          unit_code: 'g',
        }),
      ]),
    );
    expect(ingredient.measurements[0]).toMatchObject({
      measurement_type: 'count',
      amount_min: 2,
      amount_max: 3,
    });
    expect(
      transformIngredientForDisplay(displayIngredient, {
        multiplier: 2,
        unitSystems: { volume: 'recipe', weight: 'recipe' },
      }).measurements,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount_min: 2,
          amount_max: 3,
          unit_code: 'cup',
        }),
        expect.objectContaining({
          amount_min: 480,
          amount_max: 720,
          unit_code: 'g',
        }),
      ]),
    );
  });

  it('converts only the selected measurement slot back to Count', () => {
    const displayIngredient = applyMeasureEquivalent(ingredient, {
      showEquivalentMeasures: true,
      countDimensions: { volume: true },
    });

    expect(displayIngredient.measurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurement_type: 'count',
          amount_min: 2,
          amount_max: 3,
        }),
        expect.objectContaining({
          measurement_type: 'weight',
          amount_min: 240,
          amount_max: 360,
          unit_code: 'g',
        }),
      ]),
    );
    expect(displayIngredient.measurements).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ measurement_type: 'volume' })]),
    );
  });

  it('uses the single available dimension by default and lets its slot return to Count', () => {
    const singleDimensionIngredient: RecipeIngredient = {
      ...ingredient,
      nutrition_equivalent: {
        measurementType: 'count',
        picklistValueId: null,
        picklistValue: null,
        volume: { amount: 0.5, unitCode: 'cup' },
        weight: null,
      },
      density: null,
    };

    expect(applyMeasureEquivalent(singleDimensionIngredient).measurements).toEqual(
      expect.arrayContaining([expect.objectContaining({ measurement_type: 'volume' })]),
    );
    expect(
      applyMeasureEquivalent(singleDimensionIngredient, {
        showEquivalentMeasures: true,
        countDimensions: { volume: true },
      }).measurements,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ measurement_type: 'count' })]));
  });

  it('does not mutate the source measurement when converting display values', () => {
    expect(ingredient.measurements[0]).toMatchObject({
      measurement_type: 'count',
      amount_min: 2,
      amount_max: 3,
    });
  });

  it('matches Things equivalents by picklist identity and omits unavailable dimensions', () => {
    const thingsEquivalent = {
      measurementType: 'informal' as const,
      picklistValueId: 'sprig-id',
      picklistValue: 'Sprig',
      volume: { amount: 1, unitCode: 'tbsp' },
      weight: null,
    };
    const thingsIngredient: RecipeIngredient = {
      ...ingredient,
      measurements: [
        {
          ...ingredient.measurements[0],
          measurement_type: 'informal',
          picklist_value_id: 'sprig-id',
          picklist_value: 'sprig',
        },
      ],
      nutrition_equivalent: thingsEquivalent,
      density: null,
    };

    expect(getResolvedMeasureEquivalent(thingsIngredient)).toMatchObject({
      volume: { amount: 1, unitCode: 'tbsp' },
      weight: null,
    });
    expect(
      applyMeasureEquivalent(thingsIngredient, { showEquivalentMeasures: true }).measurements,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ measurement_type: 'volume' })]));
    expect(
      getResolvedMeasureEquivalent({
        ...thingsIngredient,
        nutrition_equivalent: {
          ...thingsEquivalent,
          picklistValueId: 'other-sprig',
        },
      }),
    ).toBeNull();
  });
});
