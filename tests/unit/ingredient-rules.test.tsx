import { describe, expect, it } from 'vitest';
import {
  ensureTrailingIngredientRow,
  formatIngredientDisplay,
  moveIngredientRow,
  moveIngredientRowTo,
  serializeIngredientRows,
} from '../../src/lib/recipes/ingredient-rules';

const rows = [
  {
    id: 'row-onion',
    ingredientId: 'ingredient-onion',
    ingredientName: 'Onion',
    isMain: true,
    detail: 'yellow',
    preparation: 'diced',
    measurements: [],
  },
  {
    id: 'row-salt',
    ingredientId: null,
    ingredientName: '  Sea salt  ',
    isMain: false,
    detail: '',
    preparation: 'to taste',
    measurements: [],
  },
  {
    id: 'row-empty',
    ingredientId: null,
    ingredientName: '',
    isMain: false,
    detail: '',
    preparation: '',
    measurements: [],
  },
];

describe('ingredient row rules', () => {
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
    ).toBe('1 1/2 cups / 120 g all-purpose flour, sifted');
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
    ).toBe('1.5 l / 0.33-1.67 g flour');
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
    expect(display(1.5, null, 'cup', 'volume')).toBe('1 1/2 cups flour');
    expect(display(1, 2, 'cup', 'volume')).toBe('1-2 cups flour');
    expect(display(2, null, 'tsp', 'volume')).toBe('2 tsp flour');
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
    expect(display(1.5, null, 'Sprig')).toBe('1 1/2 sprigs herbs');
    expect(display(1, 2, 'Pinch of')).toBe('1-2 pinches of herbs');
  });

  it('moves a row by its stable ID without changing its content', () => {
    expect(moveIngredientRow(rows, 'row-salt', 'up')).toEqual([rows[1], rows[0], rows[2]]);
    expect(moveIngredientRow(rows, 'row-onion', 'down')).toEqual([rows[1], rows[0], rows[2]]);
    expect(moveIngredientRow(rows, 'row-onion', 'up')).toBe(rows);
    expect(moveIngredientRow(rows, 'row-empty', 'down')).toBe(rows);
    expect(moveIngredientRow(rows, 'missing-row', 'down')).toBe(rows);
  });

  it('moves a dragged row to the target row position', () => {
    expect(moveIngredientRowTo(rows, 'row-empty', 'row-onion')).toEqual([
      rows[2],
      rows[0],
      rows[1],
    ]);
    expect(moveIngredientRowTo(rows, 'row-onion', 'row-onion')).toBe(rows);
  });

  it('serializes rows in current order and excludes untouched blank rows', () => {
    expect(serializeIngredientRows([])).toEqual([]);
    expect(serializeIngredientRows(rows)).toEqual([
      {
        ingredient_id: 'ingredient-onion',
        ingredient_name: null,
        is_main: true,
        detail: 'yellow',
        preparation: 'diced',
        measurements: [],
      },
      {
        ingredient_id: null,
        ingredient_name: 'Sea salt',
        is_main: false,
        detail: '',
        preparation: 'to taste',
        measurements: [],
      },
    ]);
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
        ingredient_id: 'ingredient-onion',
        ingredient_name: null,
        is_main: true,
        detail: 'yellow',
        preparation: 'diced',
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

  it('rejects row details that have no ingredient', () => {
    expect(() => serializeIngredientRows([{ ...rows[2], detail: 'minced' }])).toThrow(
      'Choose an ingredient for each edited row.',
    );
  });
});
