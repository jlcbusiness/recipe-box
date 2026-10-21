import { describe, expect, it } from 'vitest';
import {
  formatGroupedInteger,
  formatGroupedIntegerInput,
  formatQuantity,
  formatQuantityInput,
  formatQuantityRange,
  type MeasurementInput,
  parseGroupedInteger,
  parseQuantityInput,
  serializeMeasurements,
  validateMeasurementSet,
  volumeUnits,
  weightUnits,
} from '../../src/lib/recipes/measurement-rules';

function measurement(
  type: MeasurementInput['type'],
  quantity: string,
  unitCode: string | null = null,
  picklistValueId: string | null = null,
): MeasurementInput {
  return { type, quantity, unitCode, picklistValueId };
}

describe('measurement rules', () => {
  it.each([
    ['2', { minimum: 2, maximum: null }],
    ['1.25', { minimum: 1.25, maximum: null }],
    ['.5', { minimum: 0.5, maximum: null }],
    ['1/2', { minimum: 0.5, maximum: null }],
    ['1 1/4', { minimum: 1.25, maximum: null }],
    ['½', { minimum: 0.5, maximum: null }],
    ['⅓', { minimum: 1 / 3, maximum: null }],
    ['⅔', { minimum: 2 / 3, maximum: null }],
    ['1 ⅝', { minimum: 1.625, maximum: null }],
    ['½-1 ⅝', { minimum: 0.5, maximum: 1.625 }],
    ['2-3', { minimum: 2, maximum: 3 }],
  ])('parses %s into normalized bounds', (input, expected) => {
    expect(parseQuantityInput(input)).toEqual(expected);
  });

  it.each([
    '',
    '0',
    '-1',
    '1/0',
    '1 / 2',
    '1 2/3/4',
    '⅕',
    '3-2',
    '2--3',
    'Infinity',
    'NaN',
    '-Infinity',
  ])('rejects invalid quantity %s', (input) => {
    expect(parseQuantityInput(input)).toBeNull();
  });

  it('formats common fractions and falls back to concise decimals', () => {
    expect(formatQuantity(0.5)).toBe('½');
    expect(formatQuantity(1.5)).toBe('1 ½');
    expect(formatQuantity(0.333333)).toBe('⅓');
    expect(formatQuantity(2 / 3)).toBe('⅔');
    expect(formatQuantity(0.25)).toBe('¼');
    expect(formatQuantity(0.75)).toBe('¾');
    expect(formatQuantity(0.125)).toBe('⅛');
    expect(formatQuantity(0.375)).toBe('⅜');
    expect(formatQuantity(0.625)).toBe('⅝');
    expect(formatQuantity(0.875)).toBe('⅞');
    expect(formatQuantity(1.17)).toBe('1.17');
    expect(formatQuantityRange(0.5, 1.625)).toBe('½-1 ⅝');
  });

  it('formats metric quantities as decimals with at most two places', () => {
    expect(formatQuantity(1.5, 'metric')).toBe('1.5');
    expect(formatQuantity(0.333333, 'metric')).toBe('0.33');
    expect(formatQuantity(1.625, 'metric')).toBe('1.63');
    expect(formatQuantity(123, 'metric')).toBe('123');
    expect(formatQuantity(0.01234, 'metric')).toBe('0.01');
    expect(formatQuantityRange(0.333333, 1.666, 'metric')).toBe('0.33-1.67');
  });

  it('groups large quantities without changing customary fractions', () => {
    expect(formatQuantity(1234)).toBe('1,234');
    expect(formatQuantity(1234.5)).toBe('1,234 ½');
    expect(formatQuantity(1234.567)).toBe('1,234.57');
    expect(formatQuantity(1234.56, 'metric')).toBe('1,234.56');
    expect(formatQuantityRange(1234, 2345, 'metric')).toBe('1,234-2,345');
  });

  it('parses and formats grouped quantities and integer inputs', () => {
    expect(parseQuantityInput('1,234')).toEqual({ minimum: 1234, maximum: null });
    expect(parseQuantityInput('1,234 1/2')).toEqual({ minimum: 1234.5, maximum: null });
    expect(parseQuantityInput('1 1/2')).toEqual({ minimum: 1.5, maximum: null });
    expect(parseQuantityInput('1,000-2,000')).toEqual({ minimum: 1000, maximum: 2000 });
    expect(formatQuantityInput('1234-2000', 'metric')).toBe('1,234-2,000');
    expect(formatQuantityInput('1 1/2')).toBe('1 1/2');
    expect(formatQuantityInput('1234 ½')).toBe('1,234 1/2');
    expect(formatGroupedInteger(1234567)).toBe('1,234,567');
    expect(formatGroupedIntegerInput('1234567')).toBe('1,234,567');
    expect(parseGroupedInteger('1,234,567')).toBe(1234567);
    expect(parseGroupedInteger('12,34')).toBeNull();
  });

  it('formats editor quantities without rounding away measurement precision', () => {
    expect(formatQuantityInput('1/12')).toBe('1/12');
    expect(formatQuantityInput('1/16')).toBe('1/16');
    expect(formatQuantityInput((1 / 12).toString())).toBe('1/12');
    expect(formatQuantityInput((1 / 16).toString())).toBe('1/16');
    expect(formatQuantityInput('0.08')).toBe('0.08');
    expect(formatQuantityInput('0.3333333333334')).toBe('0.3333333333334');

    expect(
      serializeMeasurements([
        {
          id: 'volume-entry',
          type: 'volume',
          quantity: formatQuantityInput('1/12'),
          unitCode: 'cup',
          picklistValueId: '',
        },
      ])[0].amount_min,
    ).toBe(1 / 12);
  });

  it('defines the fixed Volume and Weight unit catalogs by system', () => {
    expect(volumeUnits.map(({ code }) => code)).toEqual([
      'tsp',
      'tbsp',
      'fl_oz',
      'cup',
      'pt',
      'qt',
      'gal',
      'ml',
      'l',
    ]);
    expect(weightUnits.map(({ code }) => code)).toEqual(['oz', 'lb', 'g', 'kg']);
    expect(volumeUnits.find(({ code }) => code === 'ml')?.system).toBe('metric');
    expect(weightUnits.find(({ code }) => code === 'oz')?.system).toBe('us_customary');
  });

  it('serializes parsed single and ranged measurements for the save RPC', () => {
    expect(
      serializeMeasurements([
        {
          id: 'volume-entry',
          type: 'volume',
          quantity: '1 1/2',
          unitCode: 'cup',
          picklistValueId: '',
        },
      ]),
    ).toEqual([
      {
        measurement_type: 'volume',
        amount_min: 1.5,
        amount_max: null,
        unit_code: 'cup',
        picklist_value_id: null,
      },
    ]);
    expect(
      serializeMeasurements([
        {
          id: 'count-entry',
          type: 'count',
          quantity: '2-3',
          unitCode: '',
          picklistValueId: '',
        },
      ]),
    ).toEqual([
      {
        measurement_type: 'count',
        amount_min: 2,
        amount_max: 3,
        unit_code: null,
        picklist_value_id: null,
      },
    ]);
  });

  it('accepts valid measurement types and a Volume-plus-Weight pair', () => {
    expect(validateMeasurementSet([measurement('volume', '1 1/2', 'cup')])).toBeNull();
    expect(validateMeasurementSet([measurement('volume', '1 ½', 'cup')])).toBeNull();
    expect(validateMeasurementSet([measurement('weight', '120', 'g')])).toBeNull();
    expect(validateMeasurementSet([measurement('count', '2')])).toBeNull();
    expect(
      validateMeasurementSet([measurement('informal', '1', null, 'picklist-bunch')]),
    ).toBeNull();
    expect(
      validateMeasurementSet([measurement('unmeasured', '', null, 'picklist-to-taste')]),
    ).toBeNull();
    expect(
      validateMeasurementSet([
        measurement('volume', '1', 'cup'),
        measurement('weight', '120', 'g'),
      ]),
    ).toBeNull();
  });

  it('allows either or both optional Units amounts, but not an empty Units selection', () => {
    expect(
      serializeMeasurements([
        {
          id: 'volume-entry',
          type: 'volume',
          quantity: '1/2',
          unitCode: 'cup',
          picklistValueId: '',
        },
        {
          id: 'weight-entry',
          type: 'weight',
          quantity: '',
          unitCode: 'g',
          picklistValueId: '',
        },
      ]),
    ).toEqual([
      {
        measurement_type: 'volume',
        amount_min: 0.5,
        amount_max: null,
        unit_code: 'cup',
        picklist_value_id: null,
      },
    ]);
    expect(
      serializeMeasurements([
        {
          id: 'volume-entry',
          type: 'volume',
          quantity: '',
          unitCode: 'cup',
          picklistValueId: '',
        },
        {
          id: 'weight-entry',
          type: 'weight',
          quantity: '100',
          unitCode: 'g',
          picklistValueId: '',
        },
      ]),
    ).toEqual([
      {
        measurement_type: 'weight',
        amount_min: 100,
        amount_max: null,
        unit_code: 'g',
        picklist_value_id: null,
      },
    ]);
    expect(() =>
      serializeMeasurements([
        {
          id: 'volume-entry',
          type: 'volume',
          quantity: '',
          unitCode: 'cup',
          picklistValueId: '',
        },
        {
          id: 'weight-entry',
          type: 'weight',
          quantity: '',
          unitCode: 'g',
          picklistValueId: '',
        },
      ]),
    ).toThrow('Enter a volume or weight amount.');
  });

  it('rejects invalid units, missing values, and unsupported measurement pairs', () => {
    expect(validateMeasurementSet([measurement('volume', '1', 'g')])).not.toBeNull();
    expect(validateMeasurementSet([measurement('weight', '1', 'cup')])).not.toBeNull();
    expect(validateMeasurementSet([measurement('count', '1', 'each')])).not.toBeNull();
    expect(validateMeasurementSet([measurement('volume', '')])).not.toBeNull();
    expect(validateMeasurementSet([measurement('informal', '1')])).not.toBeNull();
    expect(
      validateMeasurementSet([measurement('unmeasured', '1', null, 'phrase-id')]),
    ).not.toBeNull();
    expect(
      validateMeasurementSet([
        measurement('volume', '1', 'cup'),
        measurement('volume', '2', 'tbsp'),
      ]),
    ).not.toBeNull();
    expect(
      validateMeasurementSet([measurement('volume', '1', 'cup'), measurement('count', '2')]),
    ).not.toBeNull();
  });
});
