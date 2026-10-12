import {
  formatQuantityRange,
  type MeasurementDraft,
  type ParsedQuantity,
  parseQuantityInput,
  volumeUnits,
  weightUnits,
} from './measurement-rules';
import { convertUnitAmount, type MeasurementDimension } from './recipe-reader-rules';

export type IngredientDensity = {
  volumeAmount: number;
  volumeUnitCode: string;
  weightAmount: number;
  weightUnitCode: string;
};

function measurementFor(
  measurements: MeasurementDraft[],
  type: MeasurementDimension,
): MeasurementDraft {
  return (
    measurements.find((measurement) => measurement.type === type) ?? {
      id: crypto.randomUUID(),
      type,
      quantity: '',
      unitCode: type === 'volume' ? 'cup' : 'g',
      picklistValueId: '',
    }
  );
}

export function deriveDensityCounterpart(
  measurements: MeasurementDraft[],
  sourceType: MeasurementDimension,
  density: IngredientDensity | null | undefined,
): MeasurementDraft[] {
  if (!density) {
    return measurements;
  }

  const targetType = sourceType === 'volume' ? 'weight' : 'volume';
  const source = measurements.find((measurement) => measurement.type === sourceType);
  if (!source) {
    return measurements;
  }

  const target = measurementFor(measurements, targetType);
  if (target.quantity.trim() && !target.derivedFromDensity) {
    return measurements;
  }

  const sourceQuantity = parseQuantityInput(source.quantity);
  if (!sourceQuantity || !source.unitCode) {
    if (!target.derivedFromDensity) {
      return measurements;
    }
    const clearedTarget = {
      ...target,
      quantity: '',
      derivedQuantity: undefined,
    };
    return measurements.some((measurement) => measurement.type === targetType)
      ? measurements.map((measurement) =>
          measurement.type === targetType ? clearedTarget : measurement,
        )
      : [...measurements, clearedTarget];
  }

  try {
    const targetUnitCode = target.unitCode || (targetType === 'volume' ? 'cup' : 'g');
    const derivedQuantity = deriveDensityRange(
      sourceQuantity,
      sourceType,
      source.unitCode,
      density,
      targetUnitCode,
    );
    const units = targetType === 'volume' ? volumeUnits : weightUnits;
    const unit = units.find((candidate) => candidate.code === targetUnitCode);
    const derivedTarget: MeasurementDraft = {
      ...target,
      quantity: formatQuantityRange(derivedQuantity.minimum, derivedQuantity.maximum, unit?.system),
      unitCode: targetUnitCode,
      derivedFromDensity: true,
      derivedQuantity,
    };
    return measurements.some((measurement) => measurement.type === targetType)
      ? measurements.map((measurement) =>
          measurement.type === targetType ? derivedTarget : measurement,
        )
      : [...measurements, derivedTarget];
  } catch {
    if (!target.derivedFromDensity) {
      return measurements;
    }
    const clearedTarget = { ...target, quantity: '', derivedQuantity: undefined };
    return measurements.map((measurement) =>
      measurement.type === targetType ? clearedTarget : measurement,
    );
  }
}

export function reconcileDensityIngredientChange(
  measurements: MeasurementDraft[],
  density: IngredientDensity | null | undefined,
): MeasurementDraft[] {
  const manualMeasurements = measurements.map((measurement) =>
    measurement.derivedFromDensity
      ? {
          ...measurement,
          quantity: '',
          derivedFromDensity: undefined,
          derivedQuantity: undefined,
        }
      : measurement,
  );
  if (!density) {
    return manualMeasurements;
  }

  const volume = manualMeasurements.find((measurement) => measurement.type === 'volume');
  const weight = manualMeasurements.find((measurement) => measurement.type === 'weight');
  const hasVolume = Boolean(volume?.quantity.trim());
  const hasWeight = Boolean(weight?.quantity.trim());
  if (hasVolume === hasWeight) {
    return manualMeasurements;
  }

  return deriveDensityCounterpart(manualMeasurements, hasVolume ? 'volume' : 'weight', density);
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}

function convertThroughDensity(
  amount: number,
  sourceDimension: MeasurementDimension,
  sourceUnitCode: string,
  density: IngredientDensity,
  targetUnitCode: string,
): number {
  if (sourceDimension === 'volume') {
    const volumeInDensityUnit = convertUnitAmount(
      amount,
      'volume',
      sourceUnitCode,
      density.volumeUnitCode,
    );
    const weightInDensityUnit = (volumeInDensityUnit * density.weightAmount) / density.volumeAmount;
    return convertUnitAmount(weightInDensityUnit, 'weight', density.weightUnitCode, targetUnitCode);
  }

  const weightInDensityUnit = convertUnitAmount(
    amount,
    'weight',
    sourceUnitCode,
    density.weightUnitCode,
  );
  const volumeInDensityUnit = (weightInDensityUnit * density.volumeAmount) / density.weightAmount;
  return convertUnitAmount(volumeInDensityUnit, 'volume', density.volumeUnitCode, targetUnitCode);
}

export function deriveDensityRange(
  quantity: ParsedQuantity,
  sourceDimension: MeasurementDimension,
  sourceUnitCode: string,
  density: IngredientDensity,
  targetUnitCode: string,
): ParsedQuantity {
  assertPositiveFinite(quantity.minimum, 'The source amount');
  if (
    quantity.maximum !== null &&
    (!Number.isFinite(quantity.maximum) || quantity.maximum < quantity.minimum)
  ) {
    throw new Error('The source amount range is invalid.');
  }
  assertPositiveFinite(density.volumeAmount, 'The density volume amount');
  assertPositiveFinite(density.weightAmount, 'The density weight amount');

  const minimum = convertThroughDensity(
    quantity.minimum,
    sourceDimension,
    sourceUnitCode,
    density,
    targetUnitCode,
  );
  const maximum =
    quantity.maximum === null
      ? null
      : convertThroughDensity(
          quantity.maximum,
          sourceDimension,
          sourceUnitCode,
          density,
          targetUnitCode,
        );

  assertPositiveFinite(minimum, 'The derived amount');
  if (maximum !== null) {
    assertPositiveFinite(maximum, 'The derived range endpoint');
    if (maximum < minimum) {
      throw new Error('The derived amount range is invalid.');
    }
  }

  return { minimum, maximum };
}
