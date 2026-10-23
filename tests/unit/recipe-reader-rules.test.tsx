import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RecipeReader,
  RecipeReaderProvider,
  RecipeServesControl,
} from '../../src/app/recipes/recipe-reader';
import type { RecipeIngredient, RecipeInstructionStep } from '../../src/lib/recipes/data';
import {
  formatIngredientDisplay,
  type IngredientDisplayInput,
} from '../../src/lib/recipes/ingredient-rules';
import { formatQuantity, type MeasurementSystem } from '../../src/lib/recipes/measurement-rules';
import {
  convertUnitAmount,
  getScaleMultiplier,
  scaleAmountRange,
  sortRecipeIngredients,
  transformIngredientForDisplay,
} from '../../src/lib/recipes/recipe-reader-rules';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'wakeLock');
});

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

function ingredientRow(
  id: string,
  name: string,
  position: number,
  measurements: RecipeIngredient['measurements'] = [],
): RecipeIngredient {
  return {
    id,
    ingredient_id: `${id}-catalog`,
    ingredient_set_id: 'set-main',
    ingredient_name: name,
    position,
    is_main: false,
    detail: '',
    preparation: '',
    portion_one_ratio: null,
    size_value: null,
    size_unit: null,
    measurements,
  };
}

function amount(
  measurementType: RecipeIngredient['measurements'][number]['measurement_type'],
  amountMin: number | null,
  unitCode: string | null = null,
  amountMax: number | null = null,
): RecipeIngredient['measurements'][number] {
  return {
    id: `${measurementType}-${amountMin ?? 'none'}`,
    position: 0,
    measurement_type: measurementType,
    amount_min: amountMin,
    amount_max: amountMax,
    unit_code: unitCode,
    picklist_value_id: null,
    picklist_value: measurementType === 'unmeasured' ? 'To taste' : null,
  };
}

function instructionStep(position: number, contentMarkdown: string): RecipeInstructionStep {
  return {
    id: `step-${position}`,
    position,
    content_markdown: contentMarkdown,
    plain_text: contentMarkdown,
  };
}

describe('recipe reader measurement rules', () => {
  it('renders divided portions and Size in Standard and Ingredient-first views', () => {
    render(
      <RecipeReaderProvider serves={4}>
        <RecipeReader
          defaultPresentation="standard"
          ingredients={[
            {
              id: 'carrot-row',
              ingredient_id: 'carrot',
              ingredient_set_id: 'set-main',
              ingredient_name: 'Carrot',
              position: 0,
              is_main: false,
              detail: '',
              preparation: 'cubed',
              portion_one_ratio: 0.25,
              size_value: 1.25,
              size_unit: 'in',
              measurements: [
                {
                  id: 'carrot-count',
                  position: 0,
                  measurement_type: 'count',
                  amount_min: 4,
                  amount_max: null,
                  unit_code: null,
                  picklist_value_id: null,
                  picklist_value: null,
                },
              ],
            },
          ]}
          recipeId="recipe-id"
          serves={4}
          steps={[]}
          volumeSystem="us_customary"
          weightSystem="us_customary"
        />
      </RecipeReaderProvider>,
    );

    expect(screen.getByRole('listitem').textContent).toContain('4 carrot, cubed 1 ¼ in');
    expect(screen.getByRole('listitem').textContent).toContain('1 : 3');
    expect(screen.getByRole('listitem').textContent).toContain('cubed 1 ¼ in');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Ingredient view: Standard. Activate for Ingredient-first.',
      }),
    );
    const ingredientRow = screen.getByRole('row', { name: /carrot/u });
    expect(ingredientRow.textContent).toContain('4');
    expect(ingredientRow.textContent).toContain('1 : 3');
    expect(ingredientRow.textContent).toContain('cubed 1 ¼ in');
  });

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
    expect(formatQuantity(0.5)).toBe('½');
    expect(formatQuantity(2 + 1 / 4 + 0.029)).toBe('2 ¼');
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

  it('preserves familiar fractions and simplifies smaller amounts for display', () => {
    const displayAmount = (
      measurement: RecipeIngredient['measurements'][number],
      multiplier = 1,
      weightSystem: MeasurementSystem = 'us_customary',
    ) =>
      transformIngredientForDisplay(
        ingredientRow('small-amount', 'Small amount', 0, [measurement]),
        { multiplier, unitSystems: { volume: 'us_customary', weight: weightSystem } },
      ).measurements?.[0];

    expect(displayAmount(amount('volume', 1 / 2, 'cup'))).toMatchObject({
      amount_min: 1 / 2,
      unit_code: 'cup',
    });
    expect(displayAmount(amount('volume', 1 / 2, 'qt'))).toMatchObject({
      amount_min: 1,
      unit_code: 'pt',
    });
    expect(displayAmount(amount('volume', 1 / 4, 'qt'))).toMatchObject({
      amount_min: 1,
      unit_code: 'cup',
    });
    expect(displayAmount(amount('volume', 1 / 4, 'pt'))).toMatchObject({
      amount_min: 1 / 2,
      unit_code: 'cup',
    });
    expect(displayAmount(amount('volume', 1, 'pt'), 1 / 4)).toMatchObject({
      amount_min: 1 / 2,
      unit_code: 'cup',
    });
    expect(displayAmount(amount('volume', 1 / 8, 'gal'), 1 / 4)).toMatchObject({
      amount_min: 1 / 2,
      unit_code: 'cup',
    });
    expect(displayAmount(amount('volume', 1 / 3, 'pt'))).toMatchObject({
      amount_min: 2 / 3,
      unit_code: 'cup',
    });
    expect(displayAmount(amount('volume', 3 / 4, 'pt'))).toMatchObject({
      amount_min: 3 / 4,
      unit_code: 'pt',
    });
    expect(displayAmount(amount('volume', 1 / 16, 'cup'))).toMatchObject({
      amount_min: 1,
      unit_code: 'tbsp',
    });
    expect(displayAmount(amount('volume', 1 / 12, 'cup'))).toMatchObject({
      amount_min: 4 / 3,
      unit_code: 'tbsp',
    });
    expect(displayAmount(amount('volume', 1 / 4, 'cup'), 0.5)).toMatchObject({
      amount_min: 2,
      unit_code: 'tbsp',
    });
    expect(displayAmount(amount('volume', 1 / 8, 'gal'))).toMatchObject({
      amount_min: 1,
      unit_code: 'pt',
    });
    expect(displayAmount(amount('volume', 1 / 8, 'tbsp'))).toMatchObject({
      amount_min: 3 / 8,
      unit_code: 'tsp',
    });
    expect(displayAmount(amount('volume', 1 / 4, 'tbsp'))).toMatchObject({
      amount_min: 3 / 4,
      unit_code: 'tsp',
    });
    expect(displayAmount(amount('weight', 1 / 8, 'lb'))).toMatchObject({
      amount_min: 2,
      unit_code: 'oz',
    });
    expect(displayAmount(amount('weight', 1 / 8, 'kg'), 1, 'metric')).toMatchObject({
      amount_min: 125,
      unit_code: 'g',
    });
    expect(displayAmount(amount('volume', 1 / 4, 'cup'))).toMatchObject({
      amount_min: 1 / 4,
      unit_code: 'cup',
    });
    expect(displayAmount(amount('volume', 1 / 4 + 0.001, 'cup'))).toMatchObject({
      amount_min: 1 / 4 + 0.001,
      unit_code: 'cup',
    });

    const scaledButter = transformIngredientForDisplay(
      ingredientRow('butter', 'Butter', 0, [amount('volume', 1 / 16, 'cup')]),
      {
        multiplier: 1 / 4,
        unitSystems: { volume: 'us_customary', weight: 'us_customary' },
      },
    );
    expect(scaledButter.ingredient_name).toBe('Butter');
    expect(scaledButter.measurements?.[0]).toMatchObject({
      amount_min: 3 / 4,
      unit_code: 'tsp',
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
          defaultPresentation="standard"
          ingredients={[
            {
              id: 'flour-row',
              ingredient_id: 'flour',
              ingredient_set_id: 'set-main',
              ingredient_name: 'Flour',
              position: 0,
              is_main: true,
              detail: '',
              preparation: '',
              portion_one_ratio: null,
              size_value: null,
              size_unit: null,
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
          recipeId="recipe-id"
          serves={null}
          steps={[]}
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

  it('preserves stored units on the initial render when requested', () => {
    render(
      <RecipeReaderProvider serves={4}>
        <RecipeReader
          defaultPresentation="standard"
          ingredients={[
            {
              id: 'flour-row',
              ingredient_id: 'flour',
              ingredient_set_id: 'set-main',
              ingredient_name: 'Flour',
              position: 0,
              is_main: true,
              detail: '',
              preparation: '',
              portion_one_ratio: null,
              size_value: null,
              size_unit: null,
              measurements: [
                {
                  id: 'flour-volume',
                  position: 0,
                  measurement_type: 'volume',
                  amount_min: 250,
                  amount_max: null,
                  unit_code: 'ml',
                  picklist_value_id: null,
                  picklist_value: null,
                },
              ],
            },
          ]}
          preserveStoredUnits
          recipeId="recipe-id"
          serves={4}
          steps={[]}
          volumeSystem="us_customary"
          weightSystem="us_customary"
        />
      </RecipeReaderProvider>,
    );

    expect(screen.getByRole('listitem').textContent?.replace(/\s+/gu, ' ').trim()).toBe(
      '250 ml flour',
    );
    expect(screen.getByRole('combobox', { name: 'Change Flour volume unit' })).toBeDefined();
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
          defaultPresentation="standard"
          ingredients={[
            {
              id: 'flour-row',
              ingredient_id: 'flour',
              ingredient_set_id: 'set-main',
              ingredient_name: 'Flour',
              position: 0,
              is_main: true,
              detail: '',
              preparation: '',
              portion_one_ratio: null,
              size_value: null,
              size_unit: null,
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
          recipeId="recipe-id"
          serves={4}
          steps={[]}
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
          defaultPresentation="standard"
          ingredients={[
            {
              id: 'flour-row',
              ingredient_id: 'flour',
              ingredient_set_id: 'set-main',
              ingredient_name: 'Flour',
              position: 0,
              is_main: true,
              detail: '',
              preparation: '',
              portion_one_ratio: null,
              size_value: null,
              size_unit: null,
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
          recipeId="recipe-id"
          serves={4}
          steps={[]}
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

describe('recipe ingredient sorting', () => {
  it('orders by each row’s first structured mention and appends unmentioned rows in entered order', () => {
    const saltId = '00000000-0000-4000-8000-000000000001';
    const onionId = '00000000-0000-4000-8000-000000000002';
    const flourId = '00000000-0000-4000-8000-000000000003';
    const sugarId = '00000000-0000-4000-8000-000000000004';
    const rows = [
      ingredientRow(saltId, 'Salt', 0),
      ingredientRow(onionId, 'Onion', 1),
      ingredientRow(flourId, 'Flour', 2),
      ingredientRow(sugarId, 'Sugar', 3),
    ];
    const steps = [
      instructionStep(
        1,
        `Use [[ingredient:${flourId}|flour]], then [[ingredient:${sugarId}|sugar]].`,
      ),
      instructionStep(
        0,
        `Literal #salt is not a link; use [[ingredient:${sugarId}|sugar]], then [[ingredient:${onionId}|onion]].`,
      ),
    ];

    expect(
      sortRecipeIngredients(rows, steps, 'instructions').map((row) => row.ingredient_name),
    ).toEqual(['Sugar', 'Onion', 'Flour', 'Salt']);
  });

  it('sorts names in either direction while preserving entered order for equal names', () => {
    const rows = [
      ingredientRow('banana', 'banana', 0),
      ingredientRow('apple', 'Apple', 2),
      ingredientRow('flour-later', 'flour', 3),
      ingredientRow('flour-first', 'Flour', 1),
    ];

    expect(
      sortRecipeIngredients(rows, [], 'alphabetical', 'ascending').map(
        (row) => row.ingredient_name,
      ),
    ).toEqual(['Apple', 'banana', 'Flour', 'flour']);
    expect(
      sortRecipeIngredients(rows, [], 'alphabetical', 'descending').map(
        (row) => row.ingredient_name,
      ),
    ).toEqual(['Flour', 'flour', 'banana', 'Apple']);
  });

  it('sorts normalized amounts inside fixed groups and keeps ties and non-numeric rows stable', () => {
    const rows = [
      ingredientRow('volume-large', 'Volume large', 0, [amount('volume', 1, 'cup')]),
      ingredientRow('count-eggs', 'Eggs', 1, [amount('count', 3)]),
      ingredientRow('feel', 'Salt', 2, [amount('unmeasured', null)]),
      ingredientRow('no-amount', 'Water', 3),
      ingredientRow('weight-grams', 'Weight grams', 4, [amount('weight', 500, 'g')]),
      ingredientRow('volume-small', 'Volume small', 5, [
        amount('volume', 1, 'tbsp', 2),
        amount('weight', 2000, 'g'),
      ]),
      ingredientRow('things', 'Cilantro', 6, [amount('informal', 1)]),
      ingredientRow('weight-pound', 'Weight pound', 7, [amount('weight', 1, 'lb')]),
      ingredientRow('count-tied', 'Eggs duplicate', 8, [amount('count', 3)]),
    ];
    const originalPositions = rows.map((row) => row.position);

    const ascending = sortRecipeIngredients(rows, [], 'size', 'ascending');
    expect(ascending.map((row) => row.id)).toEqual([
      'volume-small',
      'volume-large',
      'weight-pound',
      'weight-grams',
      'things',
      'count-eggs',
      'count-tied',
      'feel',
      'no-amount',
    ]);
    expect(sortRecipeIngredients(rows, [], 'size', 'descending').map((row) => row.id)).toEqual([
      'volume-large',
      'volume-small',
      'weight-grams',
      'weight-pound',
      'count-eggs',
      'count-tied',
      'things',
      'feel',
      'no-amount',
    ]);
    expect(ascending).not.toBe(rows);
    expect(rows.map((row) => row.position)).toEqual(originalPositions);
  });

  it('restores the exact entered order by position', () => {
    const rows = [
      ingredientRow('last', 'Last', 2),
      ingredientRow('first', 'First', 0),
      ingredientRow('middle', 'Middle', 1),
    ];

    expect(sortRecipeIngredients(rows, [], 'entered').map((row) => row.id)).toEqual([
      'first',
      'middle',
      'last',
    ]);
  });
});

describe('recipe reader views', () => {
  it('renders non-empty ingredient sets as accessible dividers in both presentations', () => {
    const rows = [
      { ...ingredientRow('sauce-row', 'Tomato', 0), ingredient_set_id: 'set-sauce' },
      { ...ingredientRow('filling-row', 'Onion', 1), ingredient_set_id: 'set-filling' },
    ];
    const ingredientSets = [
      { id: 'set-sauce', label: 'For the sauce', position: 0 },
      { id: 'set-filling', label: 'For the filling', position: 1 },
      { id: 'set-unused', label: 'Unused section', position: 2 },
    ];

    render(
      <RecipeReaderProvider serves={null}>
        <RecipeReader
          defaultPresentation="standard"
          ingredients={rows}
          ingredientSets={ingredientSets}
          recipeId="recipe-id"
          serves={null}
          steps={[]}
          volumeSystem="us_customary"
          weightSystem="us_customary"
        />
      </RecipeReaderProvider>,
    );

    expect(screen.getByRole('heading', { name: 'For the sauce' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'For the filling' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Unused section' })).toBeNull();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Ingredient view: Standard. Activate for Ingredient-first.',
      }),
    );

    expect(screen.getByRole('table', { name: 'Recipe ingredients' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'For the sauce' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'For the filling' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Unused section' })).toBeNull();
  });

  it('switches presentations and sorts rows without changing their entered order', () => {
    const flourId = '00000000-0000-4000-8000-000000000011';
    const saltId = '00000000-0000-4000-8000-000000000012';
    const sugarId = '00000000-0000-4000-8000-000000000013';
    const rows = [
      ingredientRow(flourId, 'Flour', 0, [amount('volume', 1, 'cup')]),
      ingredientRow(saltId, 'Salt', 1, [amount('unmeasured', null)]),
      ingredientRow(sugarId, 'Sugar', 2, [amount('count', 2)]),
    ];
    const steps = [
      instructionStep(
        0,
        `Add [[ingredient:${sugarId}|sugar]], then [[ingredient:${flourId}|flour]].`,
      ),
    ];
    const originalPositions = rows.map((row) => row.position);

    render(
      <RecipeReaderProvider serves={null}>
        <RecipeReader
          defaultPresentation="standard"
          ingredients={rows}
          recipeId="recipe-id"
          serves={null}
          steps={steps}
          volumeSystem="us_customary"
          weightSystem="us_customary"
        />
      </RecipeReaderProvider>,
    );

    const presentation = screen.getByRole('button', {
      name: 'Ingredient view: Standard. Activate for Ingredient-first.',
    });
    fireEvent.click(presentation);

    const table = screen.getByRole('table', { name: 'Recipe ingredients' });
    const headers = Array.from(table.querySelectorAll('thead th'));
    expect(
      headers.map(
        (cell) =>
          cell.querySelector('.recipe-reader-label-desktop')?.textContent ?? cell.textContent,
      ),
    ).toEqual(['Ingredient', 'Volume', 'Weight', 'Preparation']);
    expect(
      headers.map((cell) => cell.querySelector('.recipe-reader-label-mobile')?.textContent ?? ''),
    ).toEqual(['', 'Vol', 'Wt', 'Prep']);
    const renderedRows = Array.from(table.querySelectorAll('tbody tr'));
    const sugarRow = renderedRows.find((row) =>
      row.querySelector('th')?.textContent?.includes('sugar'),
    );
    const saltRow = renderedRows.find((row) =>
      row.querySelector('th')?.textContent?.includes('salt'),
    );
    expect(sugarRow?.querySelector('td')?.getAttribute('colspan')).toBe('2');
    expect(saltRow?.querySelector('td')?.getAttribute('colspan')).toBe('2');
    const sort = screen.getByRole('button', {
      name: 'Sort ingredients: Order Entered. Activate for Appears in Instructions.',
    });
    fireEvent.click(sort);
    expect(Array.from(table.querySelectorAll('tbody tr')).map((row) => row.textContent)).toEqual([
      'sugar2',
      'flour1 cup',
      'saltto taste',
    ]);

    fireEvent.click(sort);
    expect(Array.from(table.querySelectorAll('tbody tr')).map((row) => row.textContent)).toEqual([
      'flour1 cup',
      'saltto taste',
      'sugar2',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Sort ascending' }));
    expect(Array.from(table.querySelectorAll('tbody tr')).map((row) => row.textContent)).toEqual([
      'sugar2',
      'saltto taste',
      'flour1 cup',
    ]);

    fireEvent.click(sort);
    fireEvent.click(sort);
    expect(Array.from(table.querySelectorAll('tbody tr')).map((row) => row.textContent)).toEqual([
      'flour1 cup',
      'saltto taste',
      'sugar2',
    ]);
    expect(rows.map((row) => row.position)).toEqual(originalPositions);
  });

  it('checks ingredients in cook mode and releases the wake lock when mode closes', async () => {
    const release = vi.fn(async () => {});
    const sentinel = {
      addEventListener: vi.fn(),
      release,
    };
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });

    render(
      <RecipeReaderProvider serves={null}>
        <RecipeReader
          defaultPresentation="standard"
          ingredients={[ingredientRow('flour-id', 'Flour', 0)]}
          recipeId="recipe-id"
          serves={null}
          steps={[]}
          volumeSystem="us_customary"
          weightSystem="us_customary"
        />
      </RecipeReaderProvider>,
    );

    const cookMode = screen.getByRole('switch', { name: 'Cook mode' });
    fireEvent.click(cookMode);
    await screen.findByText('standard, order entered, screen lock on');
    const flourCheck = screen.getByRole('checkbox', { name: 'Mark Flour complete' });
    fireEvent.click(flourCheck);
    expect((flourCheck as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('listitem').getAttribute('data-checked')).toBe('true');

    fireEvent.click(cookMode);
    expect(release).toHaveBeenCalledOnce();
    expect(screen.queryByRole('checkbox', { name: 'Mark Flour complete' })).toBeNull();
  });

  it('keeps check-off available when screen wake lock is unsupported or rejected', async () => {
    render(
      <RecipeReaderProvider serves={null}>
        <RecipeReader
          defaultPresentation="standard"
          ingredients={[ingredientRow('flour-id', 'Flour', 0)]}
          recipeId="recipe-id"
          serves={null}
          steps={[]}
          volumeSystem="us_customary"
          weightSystem="us_customary"
        />
      </RecipeReaderProvider>,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Cook mode' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('not supported');
    });
    const flourCheck = screen.getByRole('checkbox', { name: 'Mark Flour complete' });
    fireEvent.click(flourCheck);
    expect((flourCheck as HTMLInputElement).checked).toBe(true);
  });

  it('keeps check-off available when the wake-lock request is rejected', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn().mockRejectedValue(new Error('Not allowed.')) },
    });

    render(
      <RecipeReaderProvider serves={null}>
        <RecipeReader
          defaultPresentation="standard"
          ingredients={[ingredientRow('flour-id', 'Flour', 0)]}
          recipeId="recipe-id"
          serves={null}
          steps={[]}
          volumeSystem="us_customary"
          weightSystem="us_customary"
        />
      </RecipeReaderProvider>,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Cook mode' }));
    expect((await screen.findByRole('status')).textContent).toContain('could not be acquired');
    const flourCheck = screen.getByRole('checkbox', { name: 'Mark Flour complete' });
    fireEvent.click(flourCheck);
    expect((flourCheck as HTMLInputElement).checked).toBe(true);
  });

  it('reacquires a system-released wake lock when the document becomes visible', async () => {
    function makeSentinel() {
      let releaseListener = () => {};
      return {
        addEventListener: vi.fn((_type: string, listener: () => void) => {
          releaseListener = listener;
        }),
        release: vi.fn(async () => {}),
        releaseBySystem: () => releaseListener(),
      };
    }

    const first = makeSentinel();
    const second = makeSentinel();
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });

    const view = render(
      <RecipeReaderProvider serves={null}>
        <RecipeReader
          defaultPresentation="standard"
          ingredients={[ingredientRow('flour-id', 'Flour', 0)]}
          recipeId="recipe-id"
          serves={null}
          steps={[]}
          volumeSystem="us_customary"
          weightSystem="us_customary"
        />
      </RecipeReaderProvider>,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Cook mode' }));
    await screen.findByText('standard, order entered, screen lock on');
    first.releaseBySystem();
    await screen.findByText('Screen may turn off because the wake lock was released.');
    document.dispatchEvent(new Event('visibilitychange'));
    await screen.findByText('standard, order entered, screen lock on');
    expect(request).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(second.release).toHaveBeenCalledOnce();
  });

  it('clears temporary check-off state when the recipe changes', () => {
    function renderRecipe(recipeId: string) {
      return (
        <RecipeReaderProvider serves={null}>
          <RecipeReader
            defaultPresentation="standard"
            ingredients={[ingredientRow('flour-id', 'Flour', 0)]}
            recipeId={recipeId}
            serves={null}
            steps={[]}
            volumeSystem="us_customary"
            weightSystem="us_customary"
          />
        </RecipeReaderProvider>
      );
    }

    const view = render(renderRecipe('first-recipe'));
    fireEvent.click(screen.getByRole('switch', { name: 'Cook mode' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Flour complete' }));
    expect(
      (screen.getByRole('checkbox', { name: 'Mark Flour complete' }) as HTMLInputElement).checked,
    ).toBe(true);

    view.rerender(renderRecipe('second-recipe'));
    expect(
      (screen.getByRole('switch', { name: 'Cook mode' }) as HTMLButtonElement).getAttribute(
        'aria-checked',
      ),
    ).toBe('false');
    expect(screen.queryByRole('checkbox', { name: 'Mark Flour complete' })).toBeNull();
  });
});
