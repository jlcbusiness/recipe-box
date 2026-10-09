import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RecipeReader,
  RecipeReaderProvider,
  RecipeServesControl,
} from '../../src/app/recipes/recipe-reader';
import {
  formatIngredientDisplay,
  type IngredientDisplayInput,
} from '../../src/lib/recipes/ingredient-rules';
import { formatQuantity, type MeasurementSystem } from '../../src/lib/recipes/measurement-rules';
import {
  convertUnitAmount,
  getScaleMultiplier,
  scaleAmountRange,
  transformIngredientForDisplay,
} from '../../src/lib/recipes/recipe-reader-rules';

afterEach(cleanup);

const flour: IngredientDisplayInput = {
  ingredient_name: 'Flour',
  detail: 'All-purpose',
  preparation: 'Sifted',
  measurements: [
    {
      measurement_type: 'volume',
      amount_min: 1,
      amount_max: 2,
      unit_code: 'cup',
      picklist_value: null,
    },
    {
      measurement_type: 'weight',
      amount_min: 120,
      amount_max: null,
      unit_code: 'g',
      picklist_value: null,
    },
  ],
};

// NIST SP 811 Appendix B.9; US liquid measures use exact US customary definitions.
const canonicalUnitCases = [
  ['volume', 'tsp', 'ml', 4.92892159375],
  ['volume', 'tbsp', 'ml', 14.78676478125],
  ['volume', 'fl_oz', 'ml', 29.5735295625],
  ['volume', 'cup', 'ml', 236.5882365],
  ['volume', 'pt', 'ml', 473.176473],
  ['volume', 'qt', 'ml', 946.352946],
  ['volume', 'gal', 'ml', 3785.411784],
  ['volume', 'ml', 'ml', 1],
  ['volume', 'l', 'ml', 1000],
  ['weight', 'oz', 'g', 28.349523125],
  ['weight', 'lb', 'g', 453.59237],
  ['weight', 'g', 'g', 1],
  ['weight', 'kg', 'g', 1000],
] as const;

describe('recipe reader measurement rules', () => {
  it.each(canonicalUnitCases)(
    'converts supported unit %s/%s to its canonical unit and back',
    (dimension, unitCode, canonicalUnit, canonicalAmount) => {
      expect(convertUnitAmount(1, dimension, unitCode, canonicalUnit)).toBeCloseTo(
        canonicalAmount,
        10,
      );
      expect(convertUnitAmount(canonicalAmount, dimension, canonicalUnit, unitCode)).toBeCloseTo(
        1,
        10,
      );
    },
  );

  it('preserves a same-unit amount and formats fractions and decimal boundaries', () => {
    expect(convertUnitAmount(1.2345, 'volume', 'cup', 'cup')).toBe(1.2345);
    expect(formatQuantity(0.5)).toBe('1/2');
    expect(formatQuantity(2 + 1 / 4 + 0.029)).toBe('2 1/4');
    expect(formatQuantity(1 + 1 / 4 + 0.031)).toBe('1.28');
    expect(formatQuantity(1.234, 'metric')).toBe('1.23');
    expect(formatQuantity(1.236, 'metric')).toBe('1.24');
  });

  it.each([
    [1, 'volume', 'cup', 'ml', 236.5882365],
    [6, 'volume', 'tsp', 'tbsp', 2],
    [1, 'weight', 'lb', 'g', 453.59237],
    [1, 'weight', 'kg', 'lb', 1000 / 453.59237],
  ] as const)(
    'converts %s %s from %s to %s without intermediate rounding',
    (amount, dimension, fromUnit, toUnit, expected) => {
      expect(convertUnitAmount(amount, dimension, fromUnit, toUnit)).toBeCloseTo(expected, 10);
    },
  );

  it('rejects invalid units and conversions across dimensions', () => {
    expect(() => convertUnitAmount(1, 'volume', 'cup', 'g')).toThrow();
    expect(() => convertUnitAmount(1, 'weight', 'cup', 'g')).toThrow();
    expect(() => convertUnitAmount(1, 'volume', 'unknown', 'ml')).toThrow();
    expect(() => convertUnitAmount(0, 'volume', 'cup', 'ml')).toThrow();
  });

  it('calculates serving, multiply, and divide scale multipliers', () => {
    expect(getScaleMultiplier({ mode: 'servings', baseServings: 4, targetServings: 6 })).toBe(1.5);
    expect(getScaleMultiplier({ mode: 'multiply', factor: 2.5 })).toBe(2.5);
    expect(getScaleMultiplier({ mode: 'divide', divisor: 3 })).toBeCloseTo(1 / 3);
  });

  it.each([
    { mode: 'servings', baseServings: null, targetServings: 4 },
    { mode: 'servings', baseServings: 0, targetServings: 4 },
    { mode: 'servings', baseServings: 4, targetServings: 0 },
    { mode: 'multiply', factor: 0 },
    { mode: 'multiply', factor: Number.POSITIVE_INFINITY },
    { mode: 'divide', divisor: 0 },
    { mode: 'divide', divisor: 1.5 },
  ] as const)('rejects invalid scaling input $mode', (scale) => {
    expect(() => getScaleMultiplier(scale)).toThrow();
  });

  it('scales both range endpoints and preserves an absent upper endpoint', () => {
    expect(scaleAmountRange(2, 3, 2)).toEqual({ minimum: 4, maximum: 6 });
    expect(scaleAmountRange(1.5, null, 0.5)).toEqual({ minimum: 0.75, maximum: null });
    expect(() => scaleAmountRange(1, 2, 0)).toThrow();
    expect(() => scaleAmountRange(Number.MAX_VALUE, null, 2)).toThrow();
  });

  it('scales first and converts each unit dimension independently for display', () => {
    const display = transformIngredientForDisplay(flour, {
      multiplier: 2,
      unitSystems: { volume: 'metric', weight: 'us_customary' },
    });

    expect(formatIngredientDisplay(display)).toBe(
      '473.18-946.35 ml / 8.47 oz all-purpose flour, sifted',
    );
    expect(flour.measurements?.[0]).toMatchObject({
      amount_min: 1,
      amount_max: 2,
      unit_code: 'cup',
    });
  });

  it('uses an exact per-ingredient unit override without changing the source', () => {
    const display = transformIngredientForDisplay(flour, {
      multiplier: 1,
      unitSystems: { volume: 'metric', weight: 'metric' },
      unitOverrides: { volume: 'tbsp' },
    });

    expect(formatIngredientDisplay(display)).toBe('16-32 TBSP / 120 g all-purpose flour, sifted');
  });

  it('rejects unsupported account measurement systems', () => {
    expect(() =>
      transformIngredientForDisplay(flour, {
        multiplier: 1,
        unitSystems: {
          volume: 'imperial' as unknown as MeasurementSystem,
          weight: 'us_customary',
        },
      }),
    ).toThrow();
  });

  it('scales Count and Things but leaves Feel phrases unchanged', () => {
    const ingredient: IngredientDisplayInput = {
      ingredient_name: 'Produce',
      detail: '',
      preparation: '',
      measurements: [
        {
          measurement_type: 'count',
          amount_min: 2,
          amount_max: 3,
          unit_code: null,
          picklist_value: null,
        },
        {
          measurement_type: 'informal',
          amount_min: 1,
          amount_max: null,
          unit_code: null,
          picklist_value: 'Bunch',
        },
        {
          measurement_type: 'unmeasured',
          amount_min: null,
          amount_max: null,
          unit_code: null,
          picklist_value: 'To taste',
        },
      ],
    };

    const display = transformIngredientForDisplay(ingredient, {
      multiplier: 2,
      unitSystems: { volume: 'metric', weight: 'metric' },
    });

    expect(formatIngredientDisplay(display)).toBe('4-6 / 2 bunches produce to taste');
    expect(formatIngredientDisplay(ingredient)).toBe('2-3 / 1 bunch produce to taste');
  });

  it('keeps the base ingredient when an invalid scale is submitted without base servings', () => {
    render(
      <RecipeReaderProvider serves={null}>
        <RecipeReader
          ingredients={[
            {
              id: 'flour-row',
              ingredient_id: 'flour',
              ingredient_name: 'Flour',
              position: 0,
              is_main: true,
              detail: '',
              preparation: '',
              measurements: [
                {
                  id: 'flour-volume',
                  position: 0,
                  measurement_type: 'volume',
                  amount_min: 1,
                  amount_max: null,
                  unit_code: 'cup',
                  picklist_value_id: null,
                  picklist_value: null,
                },
              ],
            },
          ]}
          serves={null}
          volumeSystem="us_customary"
          weightSystem="us_customary"
        />
      </RecipeReaderProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Scale recipe' }));
    expect(screen.queryByRole('option', { name: 'Servings' })).toBeNull();
    fireEvent.change(screen.getByLabelText('By'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByRole('alert').textContent).toContain('By must be a positive number.');
    expect(screen.getByRole('listitem').textContent?.replace(/\s+/gu, ' ').trim()).toBe(
      '1 cup flour',
    );
  });

  it('stages scaling in a compact pane and commits it to the recipe Serves field', () => {
    render(
      <RecipeReaderProvider serves={4}>
        <dl>
          <div>
            <dt>Serves</dt>
            <RecipeServesControl serves={4} />
          </div>
        </dl>
        <RecipeReader
          ingredients={[
            {
              id: 'flour-row',
              ingredient_id: 'flour',
              ingredient_name: 'Flour',
              position: 0,
              is_main: true,
              detail: '',
              preparation: '',
              measurements: [
                {
                  id: 'flour-volume',
                  position: 0,
                  measurement_type: 'volume',
                  amount_min: 1,
                  amount_max: null,
                  unit_code: 'cup',
                  picklist_value_id: null,
                  picklist_value: null,
                },
              ],
            },
          ]}
          serves={4}
          volumeSystem="us_customary"
          weightSystem="us_customary"
        />
      </RecipeReaderProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Scale recipe' }));
    expect(screen.getByRole('dialog', { name: 'Scale recipe' })).toBeDefined();
    const scalePicklist = screen.getByRole('combobox', { name: 'Scale' });
    fireEvent.click(scalePicklist);
    fireEvent.keyDown(scalePicklist, { key: 'ArrowDown' });
    fireEvent.keyDown(scalePicklist, { key: 'Tab' });
    expect(scalePicklist.textContent).toContain('Multiply');
    expect((screen.getByLabelText('By') as HTMLInputElement).value).toBe('2');

    fireEvent.change(screen.getByLabelText('By'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByText('Serves 8')).toBeDefined();
    expect(screen.getByRole('listitem').textContent?.replace(/\s+/gu, ' ').trim()).toBe(
      '2 cups flour',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Scale recipe' }));
    fireEvent.change(screen.getByLabelText('By'), { target: { value: '3' } });
    fireEvent.keyDown(screen.getByLabelText('By'), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Scale recipe' })).toBeNull();
    expect(screen.getByText('Serves 8')).toBeDefined();
    expect(screen.getByRole('listitem').textContent?.replace(/\s+/gu, ' ').trim()).toBe(
      '2 cups flour',
    );
  });

  it('changes a measurement unit from its inline text picker', () => {
    render(
      <RecipeReaderProvider serves={4}>
        <RecipeReader
          ingredients={[
            {
              id: 'flour-row',
              ingredient_id: 'flour',
              ingredient_name: 'Flour',
              position: 0,
              is_main: true,
              detail: '',
              preparation: '',
              measurements: [
                {
                  id: 'flour-volume',
                  position: 0,
                  measurement_type: 'volume',
                  amount_min: 1,
                  amount_max: null,
                  unit_code: 'cup',
                  picklist_value_id: null,
                  picklist_value: null,
                },
              ],
            },
          ]}
          serves={4}
          volumeSystem="us_customary"
          weightSystem="us_customary"
        />
      </RecipeReaderProvider>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Change Flour volume unit' }));
    fireEvent.click(screen.getByRole('option', { name: 'TBSP' }));
    expect(screen.getByRole('listitem').textContent?.replace(/\s+/gu, ' ').trim()).toBe(
      '16 TBSP flour',
    );
    expect(screen.queryByLabelText('Flour volume unit')).toBeNull();
  });
});
