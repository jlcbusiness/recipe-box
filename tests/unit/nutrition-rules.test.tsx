import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NutritionEstimate } from '../../src/app/nutrition/nutrition-estimate';
import {
  calculateRecipeNutrition,
  formatNutritionString,
  getNutritionBasisSignature,
  type NutritionIngredientInput,
  type NutritionProfile,
  roundNutrientValues,
  validateNutritionProfile,
} from '../../src/lib/recipes/nutrition-rules';

const flourProfile: NutritionProfile = {
  servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
  nutrients: {
    calories: 455,
    total_fat: 1.2,
    saturated_fat: 0.2,
    trans_fat: 0,
    cholesterol: 0,
    sodium: 4,
    total_carbohydrate: 95,
    dietary_fiber: 3,
    total_sugars: 0.3,
    added_sugars: 0,
    protein: 13,
    vitamin_d: 0,
    calcium: 19,
    iron: 5.8,
    potassium: 134,
  },
};

function scaledFlour(multiplier: number) {
  return Object.fromEntries(
    Object.entries(flourProfile.nutrients).map(([key, value]) => [key, value * multiplier]),
  );
}

function ingredient(overrides: Partial<NutritionIngredientInput> = {}): NutritionIngredientInput {
  return {
    measurements: [
      {
        type: 'volume',
        amount: 2,
        maximum: null,
        unitCode: 'cup',
        picklistValueId: null,
        picklistValue: null,
      },
    ],
    profile: flourProfile,
    servingSizeOverride: null,
    nutrientOverrides: {},
    density: null,
    equivalent: null,
    ...overrides,
  };
}

describe('nutrition rules', () => {
  it('requires a positive supported serving size and nonnegative calories', () => {
    expect(
      validateNutritionProfile({
        servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
        nutrients: { calories: 0 },
      }),
    ).toBeNull();
    expect(
      validateNutritionProfile({
        servingSize: { amount: 0, dimension: 'volume', unitCode: 'cup' },
        nutrients: { calories: 0 },
      }),
    ).toContain('serving size');
    expect(
      validateNutritionProfile({
        servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
        nutrients: { calories: -1 },
      }),
    ).toContain('nonnegative');
    expect(
      validateNutritionProfile({
        servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
        nutrients: { protein: 4 },
      }),
    ).toContain('Calories');
    expect(
      validateNutritionProfile({
        servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
        nutrients: { calories: 2, arbitrary_nutrient: 1 } as NutritionProfile['nutrients'],
      }),
    ).toContain('unsupported');
  });

  it('calculates exact ingredient totals and per-serving estimates', () => {
    const result = calculateRecipeNutrition(
      [ingredient({ ingredientId: 'flour-row', ingredientName: 'Flour' })],
      2,
    );

    expect(result.complete).toBe(true);
    expect(result.total).toEqual(scaledFlour(2));
    expect(result.perServing).toEqual(scaledFlour(1));
    expect(result.contributions).toEqual([
      {
        ingredientId: 'flour-row',
        ingredientName: 'Flour',
        multiplier: 2,
        listedValues: flourProfile.nutrients,
        values: scaledFlour(2),
        reason: null,
        hasData: true,
      },
    ]);
  });

  it('treats an ingredient with any blank standard nutrient as incomplete', () => {
    const { potassium: _potassium, ...withoutPotassium } = flourProfile.nutrients;
    const result = calculateRecipeNutrition(
      [ingredient({ profile: { ...flourProfile, nutrients: withoutPotassium } })],
      1,
    );

    expect(result.complete).toBe(false);
    expect(result.hasData).toBe(true);
    expect(result.reasons.join(' ')).toContain('Potassium');
  });

  it('uses the recipe-only serving size and scales Settings defaults to it', () => {
    const result = calculateRecipeNutrition(
      [
        ingredient({
          measurements: [
            {
              type: 'volume',
              amount: 2,
              maximum: null,
              unitCode: 'cup',
              picklistValueId: null,
              picklistValue: null,
            },
          ],
          servingSizeOverride: { amount: 2, dimension: 'volume', unitCode: 'cup' },
        }),
      ],
      1,
    );

    expect(result.complete).toBe(true);
    expect(result.total).toEqual(scaledFlour(2));
  });

  it('uses an explicit Count equivalent and does not infer a conversion', () => {
    const countMeasurement = {
      type: 'count' as const,
      amount: 3,
      maximum: null,
      unitCode: null,
      picklistValueId: null,
      picklistValue: null,
    };
    const result = calculateRecipeNutrition(
      [
        ingredient({
          measurements: [countMeasurement],
          profile: {
            ...flourProfile,
            servingSize: { amount: 1, dimension: 'weight', unitCode: 'g' },
          },
          equivalent: {
            measurementType: 'count',
            picklistValueId: null,
            picklistValue: null,
            volume: null,
            weight: { amount: 120, unitCode: 'g' },
          },
        }),
      ],
      1,
    );

    expect(result.complete).toBe(true);
    expect(result.total.calories).toBe(163800);
    expect(
      calculateRecipeNutrition(
        [ingredient({ measurements: [countMeasurement], equivalent: null })],
        1,
      ).complete,
    ).toBe(false);
  });

  it('converts supported Volume and Weight units into the profile basis', () => {
    const volumeResult = calculateRecipeNutrition(
      [
        ingredient({
          measurements: [
            {
              type: 'volume',
              amount: 16,
              maximum: null,
              unitCode: 'tbsp',
              picklistValueId: null,
              picklistValue: null,
            },
          ],
        }),
      ],
      1,
    );
    const weightResult = calculateRecipeNutrition(
      [
        ingredient({
          measurements: [
            {
              type: 'weight',
              amount: 1,
              maximum: null,
              unitCode: 'kg',
              picklistValueId: null,
              picklistValue: null,
            },
          ],
          profile: {
            ...flourProfile,
            servingSize: { amount: 100, dimension: 'weight', unitCode: 'g' },
          },
        }),
      ],
      1,
    );

    expect(volumeResult.complete).toBe(true);
    expect(volumeResult.total).toEqual(scaledFlour(1));
    expect(weightResult.complete).toBe(true);
    expect(weightResult.total).toEqual(scaledFlour(10));
  });

  it('uses ingredient density for Volume-to-Weight and Weight-to-Volume conversions', () => {
    const density = {
      volumeAmount: 1,
      volumeUnitCode: 'cup',
      weightAmount: 120,
      weightUnitCode: 'g',
    };
    const volumeToWeight = calculateRecipeNutrition(
      [
        ingredient({
          measurements: [
            {
              type: 'volume',
              amount: 1,
              maximum: null,
              unitCode: 'cup',
              picklistValueId: null,
              picklistValue: null,
            },
          ],
          profile: {
            ...flourProfile,
            servingSize: { amount: 120, dimension: 'weight', unitCode: 'g' },
          },
          density,
        }),
      ],
      1,
    );
    const weightToVolume = calculateRecipeNutrition(
      [
        ingredient({
          measurements: [
            {
              type: 'weight',
              amount: 120,
              maximum: null,
              unitCode: 'g',
              picklistValueId: null,
              picklistValue: null,
            },
          ],
          density,
        }),
      ],
      1,
    );

    expect(volumeToWeight.complete).toBe(true);
    expect(volumeToWeight.total).toEqual(scaledFlour(1));
    expect(weightToVolume.complete).toBe(true);
    expect(weightToVolume.total).toEqual(scaledFlour(1));
  });

  it('matches informal measure equivalents by picklist identity', () => {
    const measurement = {
      type: 'informal' as const,
      amount: 2,
      maximum: null,
      unitCode: null,
      picklistValueId: 'scoop-id',
      picklistValue: 'scoop',
    };
    const equivalent = {
      measurementType: 'informal' as const,
      picklistValueId: 'scoop-id',
      picklistValue: 'Scoop',
      volume: { amount: 0.5, unitCode: 'cup' },
      weight: null,
    };
    const result = calculateRecipeNutrition(
      [ingredient({ measurements: [measurement], equivalent })],
      1,
    );
    const mismatchedResult = calculateRecipeNutrition(
      [
        ingredient({
          measurements: [measurement],
          equivalent: { ...equivalent, picklistValueId: 'other-scoop-id' },
        }),
      ],
      1,
    );

    expect(result.complete).toBe(true);
    expect(result.total).toEqual(scaledFlour(1));
    expect(mismatchedResult.complete).toBe(false);
  });

  it('rejects ranges and stale recipe ingredient overrides', () => {
    const ranged = ingredient({
      measurements: [
        {
          type: 'volume',
          amount: 1,
          maximum: 2,
          unitCode: 'cup',
          picklistValueId: null,
          picklistValue: null,
        },
      ],
    });
    expect(calculateRecipeNutrition([ranged], 1).complete).toBe(false);

    const stale = ingredient({
      nutrientOverrides: {
        calories: {
          value: 500,
          basisSignature: getNutritionBasisSignature(flourProfile.servingSize),
          acknowledgedBasisSignature: null,
        },
      },
      profile: {
        ...flourProfile,
        servingSize: { amount: 2, dimension: 'volume', unitCode: 'cup' },
      },
    });
    const result = calculateRecipeNutrition([stale], 1);
    expect(result.complete).toBe(false);
    expect(result.reasons.join(' ').toLocaleLowerCase()).toContain('stale');

    const currentBasis = { amount: 2, dimension: 'volume' as const, unitCode: 'cup' };
    const acknowledged = calculateRecipeNutrition(
      [
        ingredient({
          nutrientOverrides: {
            calories: {
              value: 500,
              basisSignature: getNutritionBasisSignature(flourProfile.servingSize),
              acknowledgedBasisSignature: getNutritionBasisSignature(currentBasis),
            },
          },
          profile: { ...flourProfile, servingSize: currentBasis },
        }),
      ],
      1,
    );
    expect(acknowledged.complete).toBe(true);
    expect(acknowledged.total.calories).toBe(500);
  });

  it('preserves explicit zero and formats nutrients in grouped FDA label order', () => {
    expect(
      formatNutritionString({
        protein: 3,
        sodium: 0,
        calories: 230,
        total_fat: 8,
        saturated_fat: 1,
        total_carbohydrate: 37,
        added_sugars: 10,
        vitamin_d: 2,
        iron: 8,
        vitamin_a: 90,
      }),
    ).toBe(
      'Calories: 230 | Total Fat: 8g (10%) - Saturated Fat: 1g (5%) ~ Sodium: 0mg (0%) ~ Total Carbohydrate: 37g (13%) - Added Sugars: 10g (20%) ~ Protein: 3g | Vitamin D: 2mcg (10%) ~ Iron: 8mg (44%) ~ Vitamin A: 90mcg RAE (10%)',
    );
  });

  it('uses trusted density to resolve a paired Count equivalent for nutrition', () => {
    const countMeasurement = {
      type: 'count' as const,
      amount: 1,
      maximum: null,
      unitCode: null,
      picklistValueId: null,
      picklistValue: null,
    };
    const result = calculateRecipeNutrition(
      [
        ingredient({
          measurements: [countMeasurement],
          equivalent: {
            measurementType: 'count',
            picklistValueId: null,
            picklistValue: null,
            volume: { amount: 2, unitCode: 'cup' },
            weight: { amount: 120, unitCode: 'g' },
          },
          density: {
            volumeAmount: 1,
            volumeUnitCode: 'cup',
            weightAmount: 120,
            weightUnitCode: 'g',
          },
        }),
      ],
      1,
    );

    expect(result.complete).toBe(true);
    expect(result.total).toEqual(scaledFlour(1));
  });

  it('rounds calculated nutrition values to whole numbers', () => {
    expect(formatNutritionString({ calories: 229.6, total_fat: 8.4, iron: 0.6 })).toBe(
      'Calories: 230 | Total Fat: 8g (11%) | Iron: 1mg (3%)',
    );
    expect(roundNutrientValues({ calories: 229.6, protein: 2.5, iron: 0.4 })).toEqual({
      calories: 230,
      protein: 3,
      iron: 0,
    });
  });

  it('renders a Nutrition Facts-style list alongside the compact string', () => {
    const { container } = render(
      <NutritionEstimate
        label="Estimated"
        values={{ calories: 229.6, total_fat: 8.4, saturated_fat: 1, added_sugars: 10, iron: 8 }}
      />,
    );
    expect(container.querySelector('.recipe-nutrition-string')?.textContent).toBe(
      'Estimated: Calories: 230 | Total Fat: 8g (11%) - Saturated Fat: 1g (5%) ~ Added Sugars: 10g (20%) | Iron: 8mg (44%)',
    );
    const rows = [...container.querySelectorAll('.recipe-nutrition-facts-row')].map((row) => ({
      className: row.className,
      cells: [...row.children].map((cell) => cell.textContent),
    }));
    expect(rows).toEqual([
      { className: 'recipe-nutrition-facts-row is-calories', cells: ['Calories', '230'] },
      { className: 'recipe-nutrition-facts-row is-bold', cells: ['Total Fat', '8g', '11%'] },
      { className: 'recipe-nutrition-facts-row is-indent-1', cells: ['Saturated Fat', '1g', '5%'] },
      {
        className: 'recipe-nutrition-facts-row is-indent-2',
        cells: ['Added Sugars', '10g', '20%'],
      },
      {
        className: 'recipe-nutrition-facts-row is-section-start',
        cells: ['Iron', '8mg', '44%'],
      },
    ]);
  });
});
