import { describe, expect, it } from 'vitest';
import {
  deriveDensityCounterpart,
  deriveDensityRange,
  type IngredientDensity,
  reconcileDensityIngredientChange,
} from '../../src/lib/recipes/density-rules';
import {
  type MeasurementDraft,
  serializeMeasurements,
} from '../../src/lib/recipes/measurement-rules';

const flourDensity: IngredientDensity = {
  volumeAmount: 1,
  volumeUnitCode: 'cup',
  weightAmount: 120,
  weightUnitCode: 'g',
};

describe('trusted density rules', () => {
  it('derives weight from volume in the requested unit without rounding', () => {
    expect(
      deriveDensityRange({ minimum: 1.5, maximum: null }, 'volume', 'cup', flourDensity, 'g'),
    ).toEqual({ minimum: 180, maximum: null });

    expect(
      deriveDensityRange({ minimum: 1, maximum: null }, 'volume', 'cup', flourDensity, 'oz')
        .minimum,
    ).toBeCloseTo(120 / 28.349523125, 10);
  });

  it('derives volume from weight and converts source units before applying density', () => {
    expect(
      deriveDensityRange({ minimum: 120, maximum: 240 }, 'weight', 'g', flourDensity, 'cup'),
    ).toEqual({ minimum: 1, maximum: 2 });

    expect(
      deriveDensityRange({ minimum: 1, maximum: null }, 'weight', 'oz', flourDensity, 'ml').minimum,
    ).toBeCloseTo((28.349523125 / 120) * 236.5882365, 10);
  });

  it('scales both range endpoints and retains single-amount shape', () => {
    expect(
      deriveDensityRange({ minimum: 1, maximum: 2.5 }, 'volume', 'cup', flourDensity, 'g'),
    ).toEqual({ minimum: 120, maximum: 300 });
    expect(
      deriveDensityRange({ minimum: 2, maximum: 3 }, 'volume', 'cup', flourDensity, 'g'),
    ).toEqual({ minimum: 240, maximum: 360 });
  });

  it('rejects invalid units, amounts, and non-finite derived results', () => {
    expect(() =>
      deriveDensityRange({ minimum: 1, maximum: null }, 'volume', 'g', flourDensity, 'g'),
    ).toThrow();
    expect(() =>
      deriveDensityRange({ minimum: 0, maximum: null }, 'volume', 'cup', flourDensity, 'g'),
    ).toThrow();
    expect(() =>
      deriveDensityRange(
        { minimum: Number.MAX_VALUE, maximum: null },
        'volume',
        'cup',
        { ...flourDensity, weightAmount: Number.MAX_VALUE },
        'g',
      ),
    ).toThrow();
  });

  it('derives and serializes the exact value while formatting the draft for display', () => {
    const measurements: MeasurementDraft[] = [
      {
        id: 'volume',
        type: 'volume',
        quantity: '1/7',
        unitCode: 'cup',
        picklistValueId: '',
      },
    ];
    const derived = deriveDensityCounterpart(measurements, 'volume', flourDensity);
    const weight = derived.find((measurement) => measurement.type === 'weight');

    expect(weight?.quantity).toBe('17.14');
    expect(weight?.derivedFromDensity).toBe(true);
    expect(serializeMeasurements(derived)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurement_type: 'weight',
          amount_min: 120 / 7,
          amount_max: null,
          unit_code: 'g',
        }),
      ]),
    );
  });

  it('updates only derived counterparts when source amount or target unit changes', () => {
    const measurements: MeasurementDraft[] = [
      {
        id: 'volume',
        type: 'volume',
        quantity: '1/7',
        unitCode: 'cup',
        picklistValueId: '',
      },
    ];
    const initial = deriveDensityCounterpart(measurements, 'volume', flourDensity);
    const updatedSource = initial.map((measurement) =>
      measurement.type === 'volume' ? { ...measurement, quantity: '2/7' } : measurement,
    );
    const updated = deriveDensityCounterpart(updatedSource, 'volume', flourDensity);
    const changedTargetUnit = updated.map((measurement) =>
      measurement.type === 'weight' ? { ...measurement, unitCode: 'oz' } : measurement,
    );
    const reconverted = deriveDensityCounterpart(changedTargetUnit, 'volume', flourDensity);
    const weight = reconverted.find((measurement) => measurement.type === 'weight');

    expect(weight?.derivedFromDensity).toBe(true);
    expect(weight?.derivedQuantity?.minimum).toBeCloseTo(240 / 7 / 28.349523125, 10);
  });

  it('clears invalid-source derivations and re-derives when the source becomes valid', () => {
    const initial = deriveDensityCounterpart(
      [
        {
          id: 'volume',
          type: 'volume',
          quantity: '1',
          unitCode: 'cup',
          picklistValueId: '',
        },
      ],
      'volume',
      flourDensity,
    );
    const invalidSource = initial.map((measurement) =>
      measurement.type === 'volume' ? { ...measurement, quantity: 'not an amount' } : measurement,
    );
    const cleared = deriveDensityCounterpart(invalidSource, 'volume', flourDensity);
    const invalidWeight = cleared.find((measurement) => measurement.type === 'weight');
    const restoredSource = cleared.map((measurement) =>
      measurement.type === 'volume' ? { ...measurement, quantity: '1' } : measurement,
    );
    const restored = deriveDensityCounterpart(restoredSource, 'volume', flourDensity);

    expect(invalidWeight?.quantity).toBe('');
    expect(invalidWeight?.derivedFromDensity).toBe(true);
    expect(restored.find((measurement) => measurement.type === 'weight')?.quantity).toBe('120');
  });

  it('preserves manual counterparts and replaces old derivations on ingredient change', () => {
    const manuallyMeasured: MeasurementDraft[] = [
      {
        id: 'volume',
        type: 'volume',
        quantity: '1',
        unitCode: 'cup',
        picklistValueId: '',
      },
      {
        id: 'weight',
        type: 'weight',
        quantity: '150',
        unitCode: 'g',
        picklistValueId: '',
      },
    ];
    expect(deriveDensityCounterpart(manuallyMeasured, 'volume', flourDensity)).toBe(
      manuallyMeasured,
    );

    const derived = deriveDensityCounterpart(manuallyMeasured.slice(0, 1), 'volume', flourDensity);
    const changedDensity = reconcileDensityIngredientChange(derived, {
      ...flourDensity,
      weightAmount: 240,
    });
    expect(changedDensity.find((measurement) => measurement.type === 'weight')?.quantity).toBe(
      '240',
    );

    const changedWithoutDensity = reconcileDensityIngredientChange(derived, null);
    expect(
      changedWithoutDensity.find((measurement) => measurement.type === 'volume')?.quantity,
    ).toBe('1');
    expect(
      changedWithoutDensity.find((measurement) => measurement.type === 'weight')?.quantity,
    ).toBe('');
  });
});
