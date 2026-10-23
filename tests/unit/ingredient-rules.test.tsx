import { describe, expect, it } from 'vitest';
import {
  allocatePortions,
  ensureTrailingIngredientRow,
  formatIngredientDisplay,
  getIngredientDisplayInputForPortion,
  getIngredientDisplayParts,
  getPortionDisplayAmounts,
  getPortionRatio,
  moveIngredientRow,
  moveIngredientRowTo,
  serializeIngredientRows,
  validateIngredientRowUniqueness,
  validateIngredientSize,
  validatePortionMeasurements,
} from '../../src/lib/recipes/ingredient-rules';

const rows = [
  {
    id: 'row-onion',
    ingredientSetId: 'set-main',
    ingredientId: 'ingredient-onion',
    ingredientName: 'Onion',
    isMain: true,
    detail: 'yellow',
    preparation: 'diced',
    measurements: [],
  },
  {
    id: 'row-salt',
    ingredientSetId: 'set-main',
    ingredientId: null,
    ingredientName: '  Sea salt  ',
    isMain: false,
    detail: '',
    preparation: 'to taste',
    measurements: [],
  },
  {
    id: 'row-empty',
    ingredientSetId: 'set-main',
    ingredientId: null,
    ingredientName: '',
    isMain: false,
    detail: '',
    preparation: '',
    measurements: [],
  },
];

describe('ingredient row rules', () => {
  it('allocates exactly two portions from a positive first-use amount without changing the total', () => {
    const ratio = 1 / 3;

    expect(getPortionRatio(1, 3)).toBeCloseTo(ratio);
    expect(allocatePortions(3, ratio)).toEqual([1, 2]);
    expect(allocatePortions(120, ratio)).toEqual([40, 80]);
    expect(getPortionRatio(0, 3)).toBeNull();
    expect(getPortionRatio(3, 3)).toBeNull();
    expect(getPortionRatio(4, 3)).toBeNull();
    expect(allocatePortions(3, 0)).toBeNull();
    expect(allocatePortions(3, 1)).toBeNull();
  });

  it('formats the selected portion amount for ingredient mentions', () => {
    const ingredient = {
      ingredient_name: 'Lamb',
      detail: '',
      preparation: 'divided',
      measurements: [
        {
          measurement_type: 'volume' as const,
          amount_min: 2,
          amount_max: null,
          unit_code: 'cup',
          picklist_value: null,
        },
      ],
    };

    expect(
      getIngredientDisplayParts(getIngredientDisplayInputForPortion(ingredient, 1 / 3, 1)).amount,
    ).toBe('⅔ cup');
    expect(
      getIngredientDisplayParts(getIngredientDisplayInputForPortion(ingredient, 1 / 3, 2)).amount,
    ).toBe('1 ⅓ cups');
  });

  it('allows scalar Unit, Count, and Things measurements but rejects ranges and Feel', () => {
    const scalar = (
      measurement_type: 'volume' | 'weight' | 'count' | 'informal' | 'unmeasured',
    ) => ({
      measurement_type,
      amount_min: measurement_type === 'unmeasured' ? null : 2,
      amount_max: null,
    });

    expect(validatePortionMeasurements([scalar('volume'), scalar('weight')], 0.25)).toBeNull();
    expect(validatePortionMeasurements([scalar('count')], 0.25)).toBeNull();
    expect(validatePortionMeasurements([scalar('informal')], 0.25)).toBeNull();
    expect(
      validatePortionMeasurements([{ ...scalar('volume'), amount_max: 3 }], 0.25),
    ).not.toBeNull();
    expect(validatePortionMeasurements([scalar('unmeasured')], 0.25)).not.toBeNull();
    expect(validatePortionMeasurements([], 0.25)).not.toBeNull();
  });

  it('rejects canonical duplicates within a set but allows the same ingredient in another set', () => {
    const duplicateRows = [
      { ingredientSetId: 'main', ingredientId: 'onion-id', ingredientName: 'Onion' },
      { ingredientSetId: 'main', ingredientId: 'onion-id', ingredientName: 'Onion' },
    ];

    expect(validateIngredientRowUniqueness(duplicateRows)).not.toBeNull();
    expect(
      validateIngredientRowUniqueness([
        duplicateRows[0],
        { ...duplicateRows[1], ingredientSetId: 'sauce' },
      ]),
    ).toBeNull();
    expect(
      validateIngredientRowUniqueness([
        { ingredientSetId: 'main', ingredientId: null, ingredientName: 'Carrot' },
        { ingredientSetId: 'main', ingredientId: null, ingredientName: ' carrot ' },
      ]),
    ).not.toBeNull();
  });

  it('requires positive Size in inches or centimeters only for cubed preparation', () => {
    expect(validateIngredientSize('cubed', '1.25', 'in')).toBeNull();
    expect(validateIngredientSize('Cubed', '.5', 'cm')).toBeNull();
    expect(validateIngredientSize('cubed', '', '')).toBeNull();
    expect(validateIngredientSize('cubed', '0', 'in')).not.toBeNull();
    expect(validateIngredientSize('cubed', '-1', 'in')).not.toBeNull();
    expect(validateIngredientSize('cubed', '1/2', 'in')).not.toBeNull();
    expect(validateIngredientSize('cubed', '1', '')).not.toBeNull();
    expect(validateIngredientSize('cubed', '', 'cm')).toBeNull();
    expect(validateIngredientSize('sliced', '1', 'cm')).not.toBeNull();
  });

  it('keeps exactly one empty row after populated rows', () => {
    const emptyRow = { ...rows[2], id: 'trailing-empty' };
    const createEmpty = () => emptyRow;

    expect(ensureTrailingIngredientRow(rows.slice(0, 2), createEmpty)).toEqual([
      rows[0],
      rows[1],
      emptyRow,
    ]);
    expect(ensureTrailingIngredientRow([...rows.slice(0, 2), emptyRow], createEmpty)).toEqual([
      rows[0],
      rows[1],
      emptyRow,
    ]);
    const normalizedRows = ensureTrailingIngredientRow(
      [rows[0], emptyRow, rows[1], { ...emptyRow, id: 'extra' }],
      createEmpty,
    );
    expect(normalizedRows.slice(0, 2)).toEqual([rows[0], rows[1]]);
    expect(normalizedRows).toHaveLength(3);
    expect(normalizedRows[2]).toEqual({ ...emptyRow, id: 'extra' });
  });

  it('formats lowercase specifics and preparation as natural recipe text', () => {
    expect(
      formatIngredientDisplay({
        ingredient_name: 'Cheese',
        detail: 'YELLOW Cheddar',
        preparation: 'Diced',
      }),
    ).toBe('yellow cheddar cheese, diced');
    expect(
      formatIngredientDisplay({
        ingredient_name: 'Flour',
        detail: 'White',
        preparation: 'Sifted',
      }),
    ).toBe('white flour, sifted');
  });

  it('formats structured cubed Size in its saved unit', () => {
    expect(
      formatIngredientDisplay({
        ingredient_name: 'Carrot',
        detail: '',
        preparation: 'cubed',
        size_value: 1.25,
        size_unit: 'in',
      }),
    ).toBe('carrot, cubed 1 ¼ in');
    expect(
      formatIngredientDisplay({
        ingredient_name: 'Carrot',
        detail: '',
        preparation: 'cubed',
        size_value: 1.5,
        size_unit: 'cm',
      }),
    ).toBe('carrot, cubed 1.5 cm');
  });

  it('formats divided amounts using their existing unit and quantity rules', () => {
    expect(
      getPortionDisplayAmounts(
        [
          {
            measurement_type: 'volume',
            amount_min: 2,
            amount_max: null,
            unit_code: 'cup',
            picklist_value: null,
          },
        ],
        0.25,
        'volume',
      ),
    ).toEqual(['½ cup', '1 ½ cups']);
  });

  it('formats dual measurements before ingredient text and phrases after it', () => {
    expect(
      formatIngredientDisplay({
        ingredient_name: 'Flour',
        detail: 'All-purpose',
        preparation: 'Sifted',
        measurements: [
          {
            measurement_type: 'volume',
            amount_min: 1.5,
            amount_max: null,
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
      }),
    ).toBe('1 ½ cups / 120 g all-purpose flour, sifted');
    expect(
      formatIngredientDisplay({
        ingredient_name: 'Salt',
        detail: '',
        preparation: '',
        measurements: [
          {
            measurement_type: 'unmeasured',
            amount_min: null,
            amount_max: null,
            unit_code: null,
            picklist_value: 'To taste',
          },
        ],
      }),
    ).toBe('salt to taste');
  });

  it('formats metric view amounts as decimals with at most two places', () => {
    expect(
      formatIngredientDisplay({
        ingredient_name: 'Flour',
        detail: '',
        preparation: '',
        measurements: [
          {
            measurement_type: 'volume',
            amount_min: 1.5,
            amount_max: null,
            unit_code: 'l',
            picklist_value: null,
          },
          {
            measurement_type: 'weight',
            amount_min: 0.333333,
            amount_max: 1.666,
            unit_code: 'g',
            picklist_value: null,
          },
        ],
      }),
    ).toBe('1.5 L / 0.33-1.67 g flour');
  });

  it('shows a display-only pinch for scalar teaspoon values nearest to 1/16 tsp', () => {
    const volume = (amount_min: number, amount_max: number | null = null, unit_code = 'tsp') => ({
      ingredient_name: 'Salt',
      detail: '',
      preparation: '',
      measurements: [
        {
          measurement_type: 'volume' as const,
          amount_min,
          amount_max,
          unit_code,
          picklist_value: null,
        },
      ],
    });

    expect(getIngredientDisplayParts(volume(1 / 16), { aliasPinch: true }).amount).toBe('pinch');
    expect(getIngredientDisplayParts(volume(1 / 32), { aliasPinch: true }).amount).toBe('0.03 tsp');
    expect(getIngredientDisplayParts(volume(3 / 32), { aliasPinch: true }).amount).toBe('0.09 tsp');
    expect(getIngredientDisplayParts(volume(1 / 32 + 0.0001), { aliasPinch: true }).amount).toBe(
      'pinch',
    );
    expect(getIngredientDisplayParts(volume(3 / 32 - 0.0001), { aliasPinch: true }).amount).toBe(
      'pinch',
    );
    expect(getIngredientDisplayParts(volume(1 / 32, 3 / 32), { aliasPinch: true }).amount).toBe(
      '0.03-0.09 tsp',
    );
    expect(
      getIngredientDisplayParts(volume(1 / 16, null, 'tbsp'), { aliasPinch: true }).amount,
    ).toBe('0.06 TBSP');
    expect(getIngredientDisplayParts(volume(1 / 16), { aliasPinch: true }).measurements[0]).toEqual(
      {
        quantity: '',
        unitLabel: 'pinch',
        measurementType: 'volume',
        unitCode: 'tsp',
      },
    );
    expect(volume(1 / 16).measurements[0]).toMatchObject({
      amount_min: 1 / 16,
      unit_code: 'tsp',
    });
  });

  it('pluralizes cups above one while leaving unit abbreviations unchanged', () => {
    const display = (
      amount_min: number,
      amount_max: number | null,
      unit_code: string,
      measurement_type: 'volume' | 'weight',
    ) =>
      formatIngredientDisplay({
        ingredient_name: 'Flour',
        detail: '',
        preparation: '',
        measurements: [
          {
            measurement_type,
            amount_min,
            amount_max,
            unit_code,
            picklist_value: null,
          },
        ],
      });

    expect(display(1, null, 'cup', 'volume')).toBe('1 cup flour');
    expect(display(1.5, null, 'cup', 'volume')).toBe('1 ½ cups flour');
    expect(display(1, 2, 'cup', 'volume')).toBe('1-2 cups flour');
    expect(display(2, null, 'tsp', 'volume')).toBe('2 tsp flour');
    expect(display(1, null, 'tbsp', 'volume')).toBe('1 TBSP flour');
    expect(display(2, null, 'oz', 'weight')).toBe('2 oz flour');
  });

  it('pluralizes Thing units when the maximum quantity is greater than one', () => {
    const display = (amount_min: number, amount_max: number | null, picklist_value: string) =>
      formatIngredientDisplay({
        ingredient_name: 'Herbs',
        detail: '',
        preparation: '',
        measurements: [
          {
            measurement_type: 'informal',
            amount_min,
            amount_max,
            unit_code: null,
            picklist_value,
          },
        ],
      });

    expect(display(1, null, 'Bunch')).toBe('1 bunch herbs');
    expect(display(2, null, 'Bunch')).toBe('2 bunches herbs');
    expect(display(1.5, null, 'Sprig')).toBe('1 ½ sprigs herbs');
    expect(display(1, 2, 'Pinch of')).toBe('1-2 pinches of herbs');
  });

  it('moves a row by its stable ID without changing its content', () => {
    expect(moveIngredientRow(rows, 'row-salt', 'up')).toEqual([rows[1], rows[0], rows[2]]);
    expect(moveIngredientRow(rows, 'row-onion', 'down')).toEqual([rows[1], rows[0], rows[2]]);
    expect(moveIngredientRow(rows, 'row-onion', 'up')).toBe(rows);
    expect(moveIngredientRow(rows, 'row-empty', 'down')).toBe(rows);
    expect(moveIngredientRow(rows, 'missing-row', 'down')).toBe(rows);
  });

  it('moves across a section boundary by adopting the adjacent section', () => {
    const groupedRows = [
      { ...rows[0], ingredientSetId: 'set-main' },
      { ...rows[1], ingredientSetId: 'set-sauce' },
      { ...rows[2], ingredientSetId: 'set-sauce' },
    ];

    expect(moveIngredientRow(groupedRows, 'row-onion', 'down')).toEqual([
      groupedRows[1],
      { ...groupedRows[0], ingredientSetId: 'set-sauce' },
      groupedRows[2],
    ]);
    expect(moveIngredientRowTo(groupedRows, 'row-onion', 'row-salt')).toEqual([
      groupedRows[1],
      { ...groupedRows[0], ingredientSetId: 'set-sauce' },
      groupedRows[2],
    ]);
  });

  it('moves a dragged row to the target row position', () => {
    expect(moveIngredientRowTo(rows, 'row-empty', 'row-onion')).toEqual([
      rows[2],
      rows[0],
      rows[1],
    ]);
    expect(moveIngredientRowTo(rows, 'row-onion', 'row-empty')).toEqual([
      rows[1],
      rows[0],
      rows[2],
    ]);
    expect(moveIngredientRowTo(rows, 'row-onion', 'row-onion')).toBe(rows);
  });

  it('serializes rows in current order and excludes untouched blank rows', () => {
    expect(serializeIngredientRows([])).toEqual([]);
    expect(serializeIngredientRows(rows)).toEqual([
      {
        recipe_ingredient_id: 'row-onion',
        ingredient_set_id: 'set-main',
        ingredient_id: 'ingredient-onion',
        ingredient_name: null,
        is_main: true,
        detail: 'yellow',
        preparation: 'diced',
        portion_one_ratio: null,
        size_value: null,
        size_unit: null,
        measurements: [],
      },
      {
        recipe_ingredient_id: 'row-salt',
        ingredient_set_id: 'set-main',
        ingredient_id: null,
        ingredient_name: 'Sea salt',
        is_main: false,
        detail: '',
        preparation: 'to taste',
        portion_one_ratio: null,
        size_value: null,
        size_unit: null,
        measurements: [],
      },
    ]);
  });

  it('serializes division ratio and cubed Size without replacing canonical measurements', () => {
    expect(
      serializeIngredientRows([
        {
          ...rows[0],
          preparation: 'cubed',
          portionOneRatio: 0.25,
          sizeValue: '1.25',
          sizeUnit: 'cm',
          measurements: [
            {
              id: 'measurement-volume',
              type: 'volume',
              quantity: '2',
              unitCode: 'cup',
              picklistValueId: '',
            },
          ],
        },
      ]),
    ).toEqual([
      {
        recipe_ingredient_id: 'row-onion',
        ingredient_set_id: 'set-main',
        ingredient_id: 'ingredient-onion',
        ingredient_name: null,
        is_main: true,
        detail: 'yellow',
        preparation: 'cubed',
        portion_one_ratio: 0.25,
        size_value: 1.25,
        size_unit: 'cm',
        measurements: [
          {
            measurement_type: 'volume',
            amount_min: 2,
            amount_max: null,
            unit_code: 'cup',
            picklist_value_id: null,
          },
        ],
      },
    ]);
    expect(() => serializeIngredientRows([{ ...rows[0], portionOneRatio: 0.25 }])).toThrow(
      'Only scalar Unit, Count, and Things amounts can be divided.',
    );
    expect(() =>
      serializeIngredientRows([
        {
          ...rows[0],
          preparation: 'divided',
          measurements: [
            {
              id: 'measurement-volume',
              type: 'volume',
              quantity: '2',
              unitCode: 'cup',
              picklistValueId: '',
            },
          ],
        },
      ]),
    ).toThrow('Enter a first portion greater than zero and less than the total.');
    expect(
      serializeIngredientRows([{ ...rows[0], preparation: 'cubed', sizeUnit: 'cm' }])[0],
    ).toMatchObject({ size_value: null, size_unit: null });
    expect(() =>
      serializeIngredientRows([
        { ...rows[0], sizeValue: '1', sizeUnit: 'cm', preparation: 'sliced' },
      ]),
    ).toThrow('Size is available only when Preparation is cubed.');
  });

  it('serializes measurements inside their ingredient row', () => {
    expect(
      serializeIngredientRows([
        {
          ...rows[0],
          measurements: [
            {
              id: 'measurement-volume',
              type: 'volume',
              quantity: '1 1/2',
              unitCode: 'cup',
              picklistValueId: '',
            },
          ],
        },
      ]),
    ).toEqual([
      {
        recipe_ingredient_id: 'row-onion',
        ingredient_set_id: 'set-main',
        ingredient_id: 'ingredient-onion',
        ingredient_name: null,
        is_main: true,
        detail: 'yellow',
        preparation: 'diced',
        portion_one_ratio: null,
        size_value: null,
        size_unit: null,
        measurements: [
          {
            measurement_type: 'volume',
            amount_min: 1.5,
            amount_max: null,
            unit_code: 'cup',
            picklist_value_id: null,
          },
        ],
      },
    ]);
  });

  it('derives the stored division ratio from the staged first portion and canonical total', () => {
    const serialized = serializeIngredientRows([
      {
        ...rows[0],
        portionOneRatio: 0.5,
        portionOneAmount: '1/2',
        portionMeasurementType: 'volume',
        measurements: [
          {
            id: 'measurement-volume',
            type: 'volume',
            quantity: '2',
            unitCode: 'cup',
            picklistValueId: '',
          },
        ],
      },
    ]);

    expect(serialized[0]?.portion_one_ratio).toBe(0.25);
    expect(serialized[0]?.measurements[0]?.amount_min).toBe(2);
    expect(() =>
      serializeIngredientRows([
        {
          ...rows[0],
          portionOneRatio: 0.5,
          portionOneAmount: '2',
          portionMeasurementType: 'volume',
          measurements: [
            {
              id: 'measurement-volume',
              type: 'volume',
              quantity: '2',
              unitCode: 'cup',
              picklistValueId: '',
            },
          ],
        },
      ]),
    ).toThrow('Enter a first portion greater than zero and less than the total.');
  });

  it('rejects row details that have no ingredient', () => {
    expect(() => serializeIngredientRows([{ ...rows[2], detail: 'minced' }])).toThrow(
      'Choose an ingredient for each edited row.',
    );
  });
});
