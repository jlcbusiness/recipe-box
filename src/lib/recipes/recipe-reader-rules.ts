import type { IngredientDisplayInput } from './ingredient-rules';
import {
  type MeasurementSystem,
  type MeasurementType,
  volumeUnits,
  weightUnits,
} from './measurement-rules';

export type MeasurementDimension = 'volume' | 'weight';

export type RecipeScale =
  | { mode: 'servings'; baseServings: number | null; targetServings: number }
  | { mode: 'multiply'; factor: number }
  | { mode: 'divide'; divisor: number };

export type MeasurementUnitSystems = Record<MeasurementDimension, MeasurementSystem>;

export type IngredientUnitOverrides = Partial<Record<MeasurementDimension, string>>;

export type IngredientDisplayOptions = {
  multiplier: number;
  unitSystems: MeasurementUnitSystems;
  unitOverrides?: IngredientUnitOverrides;
};

const usFluidOunceMilliliters = 29.5735295625;

// NIST SP 811 Appendix B.9; US liquid units use exact customary definitions.
const unitsByDimension: Record<MeasurementDimension, Record<string, number>> = {
  volume: {
    tsp: usFluidOunceMilliliters / 6,
    tbsp: usFluidOunceMilliliters / 2,
    fl_oz: usFluidOunceMilliliters,
    cup: usFluidOunceMilliliters * 8,
    pt: usFluidOunceMilliliters * 16,
    qt: usFluidOunceMilliliters * 32,
    gal: usFluidOunceMilliliters * 128,
    ml: 1,
    l: 1000,
  },
  weight: {
    oz: 28.349523125,
    lb: 453.59237,
    g: 1,
    kg: 1000,
  },
};

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isMeasurementSystem(value: unknown): value is MeasurementSystem {
  return value === 'us_customary' || value === 'metric';
}

function unitsFor(dimension: MeasurementDimension) {
  return dimension === 'volume' ? volumeUnits : weightUnits;
}

function measurementDimension(type: MeasurementType): MeasurementDimension | null {
  return type === 'volume' || type === 'weight' ? type : null;
}

function systemForUnit(dimension: MeasurementDimension, unitCode: string): MeasurementSystem {
  const unit = unitsFor(dimension).find((candidate) => candidate.code === unitCode);
  if (!unit) {
    throw new Error(`Unsupported ${dimension} unit: ${unitCode}`);
  }
  return unit.system;
}

export function getScaleMultiplier(scale: RecipeScale): number {
  if (scale.mode === 'servings') {
    if (
      scale.baseServings === null ||
      !Number.isInteger(scale.baseServings) ||
      !Number.isInteger(scale.targetServings) ||
      !isPositiveFinite(scale.baseServings) ||
      !isPositiveFinite(scale.targetServings)
    ) {
      throw new Error('Serving scaling requires positive whole-number base and target servings.');
    }
    return scale.targetServings / scale.baseServings;
  }

  if (scale.mode === 'multiply') {
    if (!isPositiveFinite(scale.factor)) {
      throw new Error('The multiplication factor must be a positive finite number.');
    }
    return scale.factor;
  }

  if (!Number.isInteger(scale.divisor) || !isPositiveFinite(scale.divisor)) {
    throw new Error('The division factor must be a positive whole number.');
  }
  return 1 / scale.divisor;
}

export function scaleAmountRange(
  minimum: number,
  maximum: number | null,
  multiplier: number,
): { minimum: number; maximum: number | null } {
  if (!isPositiveFinite(minimum) || !isPositiveFinite(multiplier)) {
    throw new Error('A measurement and multiplier must be positive finite numbers.');
  }
  if (maximum !== null && (!isPositiveFinite(maximum) || maximum < minimum)) {
    throw new Error('A measurement range must have a valid upper endpoint.');
  }

  const scaledMinimum = minimum * multiplier;
  const scaledMaximum = maximum === null ? null : maximum * multiplier;
  if (
    !isPositiveFinite(scaledMinimum) ||
    (scaledMaximum !== null && !isPositiveFinite(scaledMaximum))
  ) {
    throw new Error('The scaled measurement is outside the supported numeric range.');
  }

  return {
    minimum: scaledMinimum,
    maximum: scaledMaximum,
  };
}

export function convertUnitAmount(
  amount: number,
  dimension: MeasurementDimension,
  fromUnitCode: string,
  toUnitCode: string,
): number {
  if (!isPositiveFinite(amount)) {
    throw new Error('A converted amount must be a positive finite number.');
  }

  const unitFactors = unitsByDimension[dimension];
  const fromFactor = unitFactors[fromUnitCode];
  const toFactor = unitFactors[toUnitCode];
  if (!fromFactor || !toFactor) {
    throw new Error(`Unsupported ${dimension} conversion: ${fromUnitCode} to ${toUnitCode}`);
  }
  if (fromUnitCode === toUnitCode) {
    return amount;
  }

  const converted = (amount * fromFactor) / toFactor;
  if (!isPositiveFinite(converted)) {
    throw new Error('The converted amount is outside the supported numeric range.');
  }
  return converted;
}

function resolveDisplayUnit(
  dimension: MeasurementDimension,
  sourceUnitCode: string,
  targetSystem: MeasurementSystem,
  scaledMinimum: number,
): string {
  if (systemForUnit(dimension, sourceUnitCode) === targetSystem) {
    return sourceUnitCode;
  }

  const targetUnits = unitsFor(dimension)
    .filter((unit) => unit.system === targetSystem)
    .sort(
      (left, right) =>
        unitsByDimension[dimension][left.code] - unitsByDimension[dimension][right.code],
    );
  const eligibleUnits = targetUnits.filter(
    (unit) => convertUnitAmount(scaledMinimum, dimension, sourceUnitCode, unit.code) >= 1,
  );
  return eligibleUnits.at(-1)?.code ?? targetUnits[0]?.code ?? sourceUnitCode;
}

export function transformIngredientForDisplay(
  ingredient: IngredientDisplayInput,
  options: IngredientDisplayOptions,
): IngredientDisplayInput {
  if (!isPositiveFinite(options.multiplier)) {
    throw new Error('The recipe multiplier must be a positive finite number.');
  }
  if (
    !isMeasurementSystem(options.unitSystems.volume) ||
    !isMeasurementSystem(options.unitSystems.weight)
  ) {
    throw new Error('Volume and weight systems must be supported measurement systems.');
  }

  return {
    ...ingredient,
    measurements: (ingredient.measurements ?? []).map((measurement) => {
      const dimension = measurementDimension(measurement.measurement_type);
      if (measurement.amount_min === null || measurement.measurement_type === 'unmeasured') {
        return { ...measurement };
      }

      const scaled = scaleAmountRange(
        measurement.amount_min,
        measurement.amount_max,
        options.multiplier,
      );
      if (!dimension) {
        return { ...measurement, amount_min: scaled.minimum, amount_max: scaled.maximum };
      }

      const sourceUnitCode = measurement.unit_code;
      if (!sourceUnitCode) {
        throw new Error(`A ${dimension} measurement must have a unit.`);
      }
      const targetUnitCode =
        options.unitOverrides?.[dimension] ??
        resolveDisplayUnit(
          dimension,
          sourceUnitCode,
          options.unitSystems[dimension],
          scaled.minimum,
        );
      const amountMin = convertUnitAmount(
        scaled.minimum,
        dimension,
        sourceUnitCode,
        targetUnitCode,
      );
      const amountMax =
        scaled.maximum === null
          ? null
          : convertUnitAmount(scaled.maximum, dimension, sourceUnitCode, targetUnitCode);

      return {
        ...measurement,
        amount_min: amountMin,
        amount_max: amountMax,
        unit_code: targetUnitCode,
      };
    }),
  };
}
