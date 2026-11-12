import type { RecipeIngredient } from './data';
import { type IngredientDensity, resolveMeasureEquivalent } from './density-rules';
import type { MeasurementType } from './measurement-rules';
import type { NutritionEquivalent } from './nutrition-rules';
import type { MeasurementDimension } from './recipe-reader-rules';

export type MeasureEquivalentOverrides = {
  showEquivalentMeasures?: boolean;
  countDimensions?: Partial<Record<MeasurementDimension, boolean>>;
};

type EquivalentMeasurementIdentity = {
  type: MeasurementType;
  picklistValueId: string | null;
  picklistValue?: string | null;
};

function matchesMeasurement(
  measurement: EquivalentMeasurementIdentity,
  equivalent: NutritionEquivalent,
): boolean {
  if (measurement.type !== equivalent.measurementType) {
    return false;
  }
  if (measurement.type === 'count') {
    return measurement.picklistValueId === null && equivalent.picklistValueId === null;
  }
  if (measurement.type !== 'informal') {
    return false;
  }
  if (measurement.picklistValueId) {
    return measurement.picklistValueId === equivalent.picklistValueId;
  }
  return (
    measurement.picklistValue?.trim().toLocaleLowerCase() ===
    equivalent.picklistValue?.trim().toLocaleLowerCase()
  );
}

export function getResolvedEquivalentForMeasurement(
  measurement: EquivalentMeasurementIdentity,
  equivalent: NutritionEquivalent | null | undefined,
  density: IngredientDensity | null | undefined,
): NutritionEquivalent | null {
  if (
    !equivalent ||
    (measurement.type !== 'count' && measurement.type !== 'informal') ||
    !matchesMeasurement(measurement, equivalent)
  ) {
    return null;
  }
  return resolveMeasureEquivalent(equivalent, density);
}

export function getResolvedMeasureEquivalent(
  ingredient: RecipeIngredient,
): NutritionEquivalent | null {
  const measurement = ingredient.measurements.find(
    (candidate) =>
      candidate.measurement_type === 'count' || candidate.measurement_type === 'informal',
  );
  if (!measurement) {
    return null;
  }
  return getResolvedEquivalentForMeasurement(
    {
      type: measurement.measurement_type,
      picklistValueId: measurement.picklist_value_id,
      picklistValue: measurement.picklist_value,
    },
    ingredient.nutrition_equivalent,
    ingredient.density,
  );
}

export function applyMeasureEquivalent(
  ingredient: RecipeIngredient,
  overrides?: MeasureEquivalentOverrides,
): RecipeIngredient {
  const measurementIndex = ingredient.measurements.findIndex(
    (candidate) =>
      candidate.measurement_type === 'count' || candidate.measurement_type === 'informal',
  );
  const measurement = ingredient.measurements[measurementIndex];
  const sourceAmountMin = measurement?.amount_min;
  if (!measurement || sourceAmountMin == null) {
    return ingredient;
  }

  const equivalent = getResolvedMeasureEquivalent(ingredient);
  if (!equivalent) {
    return ingredient;
  }

  const dimensions: MeasurementDimension[] = [
    ...(equivalent.volume ? ['volume' as const] : []),
    ...(equivalent.weight ? ['weight' as const] : []),
  ];
  const hasBothDimensions = dimensions.length === 2;
  const showEquivalentMeasures = hasBothDimensions
    ? overrides?.showEquivalentMeasures === true
    : true;
  if (!showEquivalentMeasures) {
    return ingredient;
  }

  const countDimensions = dimensions.filter((dimension) => overrides?.countDimensions?.[dimension]);
  if (hasBothDimensions && countDimensions.length === dimensions.length) {
    return ingredient;
  }

  const equivalentMeasurements = dimensions.map((dimension) => {
    const equivalentForDimension = equivalent[dimension];
    if (!equivalentForDimension) {
      return null;
    }

    if (overrides?.countDimensions?.[dimension]) {
      return {
        ...measurement,
        id: `${measurement.id}-count-${dimension}`,
      };
    }

    const amountMin = sourceAmountMin * equivalentForDimension.amount;
    const amountMax =
      measurement.amount_max === null
        ? null
        : measurement.amount_max * equivalentForDimension.amount;
    if (
      !Number.isFinite(amountMin) ||
      amountMin <= 0 ||
      (amountMax !== null && (!Number.isFinite(amountMax) || amountMax < amountMin))
    ) {
      throw new Error('The equivalent produces an invalid recipe amount.');
    }

    return {
      ...measurement,
      id: `${measurement.id}-equivalent-${dimension}`,
      measurement_type: dimension,
      amount_min: amountMin,
      amount_max: amountMax,
      unit_code: equivalentForDimension.unitCode,
      picklist_value_id: null,
      picklist_value: null,
    };
  });
  const replacedDimensions = new Set<MeasurementDimension>(dimensions);
  const measurements = ingredient.measurements.filter(
    (candidate, index) =>
      index !== measurementIndex &&
      !(
        (candidate.measurement_type === 'volume' || candidate.measurement_type === 'weight') &&
        replacedDimensions.has(candidate.measurement_type)
      ),
  );
  measurements.push(
    ...equivalentMeasurements.filter(
      (candidate): candidate is NonNullable<typeof candidate> => candidate !== null,
    ),
  );
  return { ...ingredient, measurements };
}
