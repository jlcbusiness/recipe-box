import { describe, expect, it } from 'vitest';
import {
  formatQuantity,
  formatQuantityRange,
  type MeasurementInput,
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
    ['1/2', { minimum: 0.5, maximum: null }],
    ['1 1/4', { minimum: 1.25, maximum: null }],
    ['2-3', { minimum: 2, maximum: 3 }],
  ])('parses %s into normalized bounds', (input, expected) => {
    expect(parseQuantityInput(input)).toEqual(expected);
  });

  it.each(['', '0', '-1', '1/0', '1 / 2', '1 2/3/4', '3-2', '2--3', 'Infinity'])(
    'rejects invalid quantity %s',
    (input) => {
      expect(parseQuantityInput(input)).toBeNull();
    },
  );

  it('formats common fractions and falls back to concise decimals', () => {
    expect(formatQuantity(1.5)).toBe('1 1/2');
    expect(formatQuantity(0.333333)).toBe('1/3');
    expect(formatQuantity(1.625)).toBe('1 5/8');
    expect(formatQuantity(1.17)).toBe('1.17');
    expect(formatQuantityRange(2, 3)).toBe('2-3');
  });

  it('formats metric quantities as decimals with at most two places', () => {
    expect(formatQuantity(1.5, 'metric')).toBe('1.5');
    expect(formatQuantity(0.333333, 'metric')).toBe('0.33');
    expect(formatQuantity(1.625, 'metric')).toBe('1.63');
    expect(formatQuantity(123, 'metric')).toBe('123');
    expect(formatQuantity(0.01234, 'metric')).toBe('0.01');
    expect(formatQuantityRange(0.333333, 1.666, 'metric')).toBe('0.33-1.67');
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
