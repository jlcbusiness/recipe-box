import { getResolvedEquivalentForMeasurement } from './measure-equivalent-rules';
import type { MeasurementType } from './measurement-rules';
import { convertUnitAmount } from './recipe-reader-rules';

export type NutritionDimension = 'volume' | 'weight';

export type NutritionBasis = {
  amount: number;
  dimension: NutritionDimension;
  unitCode: string;
};

export const NUTRIENT_DEFINITIONS = [
  { key: 'calories', label: 'Calories', unit: '', dailyValue: null, optional: false },
  { key: 'total_fat', label: 'Total Fat', unit: 'g', dailyValue: 78, optional: false },
  { key: 'saturated_fat', label: 'Saturated Fat', unit: 'g', dailyValue: 20, optional: false },
  { key: 'trans_fat', label: 'Trans Fat', unit: 'g', dailyValue: null, optional: false },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', dailyValue: 300, optional: false },
  { key: 'sodium', label: 'Sodium', unit: 'mg', dailyValue: 2300, optional: false },
  {
    key: 'total_carbohydrate',
    label: 'Total Carbohydrate',
    unit: 'g',
    dailyValue: 275,
    optional: false,
  },
  { key: 'dietary_fiber', label: 'Dietary Fiber', unit: 'g', dailyValue: 28, optional: false },
  { key: 'total_sugars', label: 'Total Sugars', unit: 'g', dailyValue: null, optional: false },
  { key: 'added_sugars', label: 'Added Sugars', unit: 'g', dailyValue: 50, optional: false },
  { key: 'protein', label: 'Protein', unit: 'g', dailyValue: null, optional: false },
  { key: 'vitamin_d', label: 'Vitamin D', unit: 'mcg', dailyValue: 20, optional: false },
  { key: 'calcium', label: 'Calcium', unit: 'mg', dailyValue: 1300, optional: false },
  { key: 'iron', label: 'Iron', unit: 'mg', dailyValue: 18, optional: false },
  { key: 'potassium', label: 'Potassium', unit: 'mg', dailyValue: 4700, optional: false },
  { key: 'vitamin_a', label: 'Vitamin A', unit: 'mcg RAE', dailyValue: 900, optional: true },
  { key: 'vitamin_c', label: 'Vitamin C', unit: 'mg', dailyValue: 90, optional: true },
  { key: 'vitamin_e', label: 'Vitamin E', unit: 'mg', dailyValue: 15, optional: true },
  { key: 'vitamin_k', label: 'Vitamin K', unit: 'mcg', dailyValue: 120, optional: true },
  { key: 'thiamin', label: 'Thiamin', unit: 'mg', dailyValue: 1.2, optional: true },
  { key: 'riboflavin', label: 'Riboflavin', unit: 'mg', dailyValue: 1.3, optional: true },
  { key: 'niacin', label: 'Niacin', unit: 'mg NE', dailyValue: 16, optional: true },
  { key: 'vitamin_b6', label: 'Vitamin B6', unit: 'mg', dailyValue: 1.7, optional: true },
  { key: 'folate', label: 'Folate', unit: 'mcg DFE', dailyValue: 400, optional: true },
  { key: 'vitamin_b12', label: 'Vitamin B12', unit: 'mcg', dailyValue: 2.4, optional: true },
  { key: 'biotin', label: 'Biotin', unit: 'mcg', dailyValue: 30, optional: true },
  {
    key: 'pantothenic_acid',
    label: 'Pantothenic Acid',
    unit: 'mg',
    dailyValue: 5,
    optional: true,
  },
  { key: 'choline', label: 'Choline', unit: 'mg', dailyValue: 550, optional: true },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg', dailyValue: 1250, optional: true },
  { key: 'iodine', label: 'Iodine', unit: 'mcg', dailyValue: 150, optional: true },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', dailyValue: 420, optional: true },
  { key: 'zinc', label: 'Zinc', unit: 'mg', dailyValue: 11, optional: true },
  { key: 'selenium', label: 'Selenium', unit: 'mcg', dailyValue: 55, optional: true },
  { key: 'copper', label: 'Copper', unit: 'mg', dailyValue: 0.9, optional: true },
  { key: 'manganese', label: 'Manganese', unit: 'mg', dailyValue: 2.3, optional: true },
  { key: 'chromium', label: 'Chromium', unit: 'mcg', dailyValue: 35, optional: true },
  { key: 'molybdenum', label: 'Molybdenum', unit: 'mcg', dailyValue: 45, optional: true },
  { key: 'chloride', label: 'Chloride', unit: 'mg', dailyValue: 2300, optional: true },
] as const;

export type NutrientKey = (typeof NUTRIENT_DEFINITIONS)[number]['key'];
export type NutrientValues = Partial<Record<NutrientKey, number>>;

export const STANDARD_NUTRIENT_KEYS = [
  'calories',
  'total_fat',
  'saturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'total_carbohydrate',
  'dietary_fiber',
  'total_sugars',
  'added_sugars',
  'protein',
  'vitamin_d',
  'calcium',
  'iron',
  'potassium',
] as const satisfies readonly NutrientKey[];

export type StandardNutrientKey = (typeof STANDARD_NUTRIENT_KEYS)[number];

export const STANDARD_NUTRIENT_FIELDS = STANDARD_NUTRIENT_KEYS.map((key) => {
  const definition = NUTRIENT_DEFINITIONS.find((nutrient) => nutrient.key === key);
  if (!definition) throw new Error(`Missing standard nutrient definition: ${key}`);
  return { key, label: definition.label, unit: definition.unit };
});

export type NutritionProfile = {
  servingSize: NutritionBasis;
  nutrients: NutrientValues;
};

export type NutritionFieldOverride = {
  value: number;
  basisSignature: string;
  acknowledgedBasisSignature: string | null;
};

export type NutritionFieldOverrides = Partial<Record<NutrientKey, NutritionFieldOverride>>;

export type NutritionMeasurement = {
  type: MeasurementType;
  amount: number | null;
  maximum: number | null;
  unitCode: string | null;
  picklistValueId: string | null;
  picklistValue: string | null;
};

export type NutritionDensity = {
  volumeAmount: number;
  volumeUnitCode: string;
  weightAmount: number;
  weightUnitCode: string;
};

export type NutritionEquivalent = {
  measurementType: 'count' | 'informal';
  picklistValueId: string | null;
  picklistValue: string | null;
  volume: { amount: number; unitCode: string } | null;
  weight: { amount: number; unitCode: string } | null;
};

export type NutritionIngredientInput = {
  ingredientId?: string;
  ingredientName?: string;
  measurements: NutritionMeasurement[];
  profile: NutritionProfile | null;
  servingSizeOverride: NutritionBasis | null;
  nutrientOverrides: NutritionFieldOverrides;
  density: NutritionDensity | null;
  equivalent: NutritionEquivalent | null;
};

export type NutritionIngredientContribution = {
  ingredientId: string;
  ingredientName: string;
  multiplier: number | null;
  listedValues: NutrientValues;
  values: NutrientValues | null;
  reason: string | null;
  hasData: boolean;
};

export type RecipeNutritionResult = {
  complete: boolean;
  total: NutrientValues;
  perServing: NutrientValues | null;
  reasons: string[];
  hasData: boolean;
  contributions: NutritionIngredientContribution[];
};

const volumeUnitCodes = new Set(['tsp', 'tbsp', 'fl_oz', 'cup', 'pt', 'qt', 'gal', 'ml', 'l']);
const weightUnitCodes = new Set(['oz', 'lb', 'g', 'kg']);
const nutrientKeys = new Set<string>(NUTRIENT_DEFINITIONS.map(({ key }) => key));

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNonnegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function isNutritionBasis(value: unknown): value is NutritionBasis {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const basis = value as Record<string, unknown>;
  return (
    isPositiveFinite(Number(basis.amount)) &&
    (basis.dimension === 'volume' || basis.dimension === 'weight') &&
    typeof basis.unitCode === 'string' &&
    (basis.dimension === 'volume'
      ? volumeUnitCodes.has(basis.unitCode)
      : weightUnitCodes.has(basis.unitCode))
  );
}

export function getNutritionBasisSignature(basis: NutritionBasis): string {
  return JSON.stringify({
    amount: Number(basis.amount.toPrecision(14)),
    dimension: basis.dimension,
    unitCode: basis.unitCode,
  });
}

export function isNutritionFieldOverrideStale(
  override: NutritionFieldOverride,
  currentBasis: NutritionBasis,
): boolean {
  const currentSignature = getNutritionBasisSignature(currentBasis);
  return (
    override.basisSignature !== currentSignature &&
    override.acknowledgedBasisSignature !== currentSignature
  );
}

export function validateNutritionProfile(profile: NutritionProfile): string | null {
  if (!isNutritionBasis(profile.servingSize)) {
    return 'Enter a positive serving size and supported Volume or Weight unit.';
  }
  const valueError = validateNutritionValues(profile.nutrients);
  if (valueError) return valueError;
  const values = profile.nutrients as Record<string, unknown>;
  if (!Object.hasOwn(values, 'calories')) {
    return 'Enter Calories.';
  }
  return null;
}

export function validateNutritionValues(values: unknown): string | null {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return 'Enter valid nutrition values.';
  }
  const nutrientValues = values as Record<string, unknown>;
  for (const [key, value] of Object.entries(nutrientValues)) {
    if (!nutrientKeys.has(key)) {
      return 'The nutrition profile contains an unsupported nutrient.';
    }
    if (typeof value !== 'number' || !isNonnegativeFinite(value)) {
      return 'Enter a finite, nonnegative amount for every nutrient.';
    }
  }
  return null;
}

export function validateNutritionFieldOverrides(values: unknown): string | null {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return 'Enter valid recipe ingredient nutrition overrides.';
  }
  for (const [key, value] of Object.entries(values)) {
    if (!nutrientKeys.has(key) || !value || typeof value !== 'object' || Array.isArray(value)) {
      return 'The recipe ingredient contains an unsupported nutrition field.';
    }
    const override = value as Record<string, unknown>;
    if (
      Object.keys(override).length !== 3 ||
      typeof override.value !== 'number' ||
      !isNonnegativeFinite(override.value) ||
      typeof override.basisSignature !== 'string' ||
      !override.basisSignature.trim() ||
      !(
        override.acknowledgedBasisSignature === null ||
        (typeof override.acknowledgedBasisSignature === 'string' &&
          Boolean(override.acknowledgedBasisSignature.trim()))
      )
    ) {
      return 'Enter valid values for every recipe ingredient nutrition override.';
    }
  }
  return null;
}

function physicalAmount(
  amount: number,
  fromDimension: NutritionDimension,
  fromUnitCode: string,
  toDimension: NutritionDimension,
  toUnitCode: string,
  density: NutritionDensity | null,
): number | null {
  try {
    if (fromDimension === toDimension) {
      return convertUnitAmount(amount, fromDimension, fromUnitCode, toUnitCode);
    }
    if (!density) return null;
    if (fromDimension === 'volume') {
      const sourceMl = convertUnitAmount(amount, 'volume', fromUnitCode, 'ml');
      const densityMl = convertUnitAmount(
        density.volumeAmount,
        'volume',
        density.volumeUnitCode,
        'ml',
      );
      const densityGrams = convertUnitAmount(
        density.weightAmount,
        'weight',
        density.weightUnitCode,
        'g',
      );
      const grams = (sourceMl / densityMl) * densityGrams;
      return convertUnitAmount(grams, 'weight', 'g', toUnitCode);
    }
    const sourceGrams = convertUnitAmount(amount, 'weight', fromUnitCode, 'g');
    const densityGrams = convertUnitAmount(
      density.weightAmount,
      'weight',
      density.weightUnitCode,
      'g',
    );
    const densityMl = convertUnitAmount(
      density.volumeAmount,
      'volume',
      density.volumeUnitCode,
      'ml',
    );
    const milliliters = (sourceGrams / densityGrams) * densityMl;
    return convertUnitAmount(milliliters, 'volume', 'ml', toUnitCode);
  } catch {
    return null;
  }
}

function amountInBasis(
  measurement: NutritionMeasurement,
  basis: NutritionBasis,
  density: NutritionDensity | null,
  equivalent: NutritionEquivalent | null,
): number | null {
  if (
    measurement.amount === null ||
    !isPositiveFinite(measurement.amount) ||
    measurement.maximum !== null
  ) {
    return null;
  }

  if (measurement.type === basis.dimension) {
    if (!measurement.unitCode) return null;
    try {
      return convertUnitAmount(
        measurement.amount,
        basis.dimension,
        measurement.unitCode,
        basis.unitCode,
      );
    } catch {
      return null;
    }
  }

  if (measurement.type === 'volume' || measurement.type === 'weight') {
    if (!measurement.unitCode) return null;
    return physicalAmount(
      measurement.amount,
      measurement.type,
      measurement.unitCode,
      basis.dimension,
      basis.unitCode,
      density,
    );
  }

  if (measurement.type !== 'count' && measurement.type !== 'informal') return null;
  const matchedEquivalent = getResolvedEquivalentForMeasurement(measurement, equivalent, density);
  if (!matchedEquivalent) return null;
  const directEquivalent = matchedEquivalent[basis.dimension];
  if (directEquivalent) {
    const equivalentAmount = physicalAmount(
      directEquivalent.amount,
      basis.dimension,
      directEquivalent.unitCode,
      basis.dimension,
      basis.unitCode,
      density,
    );
    return equivalentAmount === null ? null : measurement.amount * equivalentAmount;
  }
  const otherDimension: NutritionDimension = basis.dimension === 'volume' ? 'weight' : 'volume';
  const crossDimensionEquivalent = matchedEquivalent[otherDimension];
  if (!crossDimensionEquivalent) return null;
  const converted = physicalAmount(
    crossDimensionEquivalent.amount,
    otherDimension,
    crossDimensionEquivalent.unitCode,
    basis.dimension,
    basis.unitCode,
    density,
  );
  return converted === null ? null : measurement.amount * converted;
}

export function getNutritionValuesForBasis(
  profile: NutritionProfile,
  basis: NutritionBasis,
  density: NutritionDensity | null,
): NutrientValues {
  const servingInBasis = physicalAmount(
    profile.servingSize.amount,
    profile.servingSize.dimension,
    profile.servingSize.unitCode,
    basis.dimension,
    basis.unitCode,
    density,
  );
  if (!servingInBasis) return {};
  const multiplier = basis.amount / servingInBasis;
  if (!isPositiveFinite(multiplier)) return {};
  return Object.fromEntries(
    Object.entries(profile.nutrients).map(([key, value]) => [key, value * multiplier]),
  ) as NutrientValues;
}

function calculateIngredient(
  input: NutritionIngredientInput,
  ingredientIndex: number,
): NutritionIngredientContribution {
  const ingredientId = input.ingredientId ?? `ingredient-${ingredientIndex}`;
  const ingredientName = input.ingredientName?.trim() || 'Ingredient';
  const basis = input.servingSizeOverride ?? input.profile?.servingSize ?? null;
  const hasData = Boolean(
    input.profile || input.servingSizeOverride || Object.keys(input.nutrientOverrides).length > 0,
  );
  if (!basis) {
    return {
      ingredientId,
      ingredientName,
      multiplier: null,
      listedValues: {},
      values: null,
      reason: 'Missing serving-size basis.',
      hasData,
    };
  }

  const amount = input.measurements.find((measurement) => measurement.type === basis.dimension);
  const fallbackAmount = input.measurements.find(
    (measurement) => measurement.type === (basis.dimension === 'volume' ? 'weight' : 'volume'),
  );
  const otherAmount = input.measurements.find(
    (measurement) => measurement.type === 'count' || measurement.type === 'informal',
  );
  const measurement = amount ?? fallbackAmount ?? otherAmount;
  if (!measurement) {
    return {
      ingredientId,
      ingredientName,
      multiplier: null,
      listedValues: {},
      values: null,
      reason: 'Missing or unsupported ingredient amount.',
      hasData,
    };
  }
  const amountInServing = amountInBasis(measurement, basis, input.density, input.equivalent);
  if (amountInServing === null) {
    return {
      ingredientId,
      ingredientName,
      multiplier: null,
      listedValues: {},
      values: null,
      reason:
        measurement.maximum !== null
          ? 'Ingredient amount is a range.'
          : 'Ingredient amount cannot be matched to the serving-size basis.',
      hasData,
    };
  }

  const values = input.profile
    ? getNutritionValuesForBasis(input.profile, basis, input.density)
    : {};
  for (const [key, override] of Object.entries(input.nutrientOverrides)) {
    if (!override) continue;
    if (isNutritionFieldOverrideStale(override, basis)) {
      return {
        ingredientId,
        ingredientName,
        multiplier: amountInServing / basis.amount,
        listedValues: values,
        values: null,
        reason: `Stale ${key} override serving-size basis.`,
        hasData,
      };
    }
    values[key as NutrientKey] = override.value;
  }
  const missing = REQUIRED_NUTRIENT_KEYS.filter((key) => values[key] === undefined);
  if (missing.length > 0) {
    const labels = missing.map(
      (key) => NUTRIENT_DEFINITIONS.find((definition) => definition.key === key)?.label ?? key,
    );
    return {
      ingredientId,
      ingredientName,
      multiplier: amountInServing / basis.amount,
      listedValues: values,
      values: null,
      reason: `Missing nutrition values: ${labels.join(', ')}. Enter 0 for nutrients the ingredient does not contain.`,
      hasData,
    };
  }

  const multiplier = amountInServing / basis.amount;
  return {
    ingredientId,
    ingredientName,
    multiplier,
    listedValues: values,
    values: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, value * multiplier]),
    ) as NutrientValues,
    reason: null,
    hasData,
  };
}

export function calculateRecipeNutrition(
  ingredients: readonly NutritionIngredientInput[],
  serves: number | null,
  recipeOverrides: NutrientValues = {},
): RecipeNutritionResult {
  const contributions = ingredients.map(calculateIngredient);
  const reasons = contributions.flatMap((entry) => (entry.reason ? [entry.reason] : []));
  const complete = ingredients.length > 0 && contributions.every((entry) => entry.values !== null);
  const totals: NutrientValues = {};
  if (complete) {
    for (const { key } of NUTRIENT_DEFINITIONS) {
      const values = contributions.map((entry) => entry.values?.[key]);
      if (values.every((value) => value !== undefined)) {
        totals[key] = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      }
    }
  }

  for (const [key, value] of Object.entries(recipeOverrides)) {
    if (typeof value === 'number' && isNonnegativeFinite(value)) {
      totals[key as NutrientKey] = value;
    }
  }

  const hasData = Object.keys(totals).length > 0 || contributions.some((entry) => entry.hasData);
  const perServing =
    serves && Number.isInteger(serves) && serves > 0
      ? Object.fromEntries(
          Object.entries(totals).map(([key, value]) => [key, (value as number) / serves]),
        )
      : null;

  return {
    complete,
    total: totals,
    perServing,
    reasons: [...new Set(reasons)],
    hasData,
    contributions,
  };
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function roundNutrientValues(values: NutrientValues): NutrientValues {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, Math.round(value as number)]),
  ) as NutrientValues;
}

// Sections are joined with " | ", groups with " ~ ", and items within a group with " - ".
export const NUTRITION_LABEL_SECTIONS: readonly (readonly (readonly NutrientKey[])[])[] = [
  [['calories']],
  [
    ['total_fat', 'saturated_fat', 'trans_fat'],
    ['cholesterol'],
    ['sodium'],
    ['total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars'],
    ['protein'],
  ],
  NUTRIENT_DEFINITIONS.filter(
    (definition) =>
      definition.optional || ['vitamin_d', 'calcium', 'iron', 'potassium'].includes(definition.key),
  ).map((definition) => [definition.key]),
];

export const REQUIRED_NUTRIENT_KEYS: readonly StandardNutrientKey[] = STANDARD_NUTRIENT_KEYS;

export type NutritionFactsRow = { key: NutrientKey; level: 0 | 1 | 2; bold: boolean };

export const NUTRITION_FACTS_MACRO_ROWS: readonly NutritionFactsRow[] = [
  { key: 'total_fat', level: 0, bold: true },
  { key: 'saturated_fat', level: 1, bold: false },
  { key: 'trans_fat', level: 1, bold: false },
  { key: 'cholesterol', level: 0, bold: true },
  { key: 'sodium', level: 0, bold: true },
  { key: 'total_carbohydrate', level: 0, bold: true },
  { key: 'dietary_fiber', level: 1, bold: false },
  { key: 'total_sugars', level: 1, bold: false },
  { key: 'added_sugars', level: 2, bold: false },
  { key: 'protein', level: 0, bold: true },
];

export type NutrientDisplay = {
  key: NutrientKey;
  label: string;
  amountText: string;
  percentText: string | null;
};

export function getNutrientDisplay(key: NutrientKey, amount: number): NutrientDisplay | null {
  const definition = NUTRIENT_DEFINITIONS.find((entry) => entry.key === key);
  if (!definition || !Number.isFinite(amount)) return null;
  return {
    key,
    label: definition.label,
    amountText: `${formatAmount(amount)}${definition.unit}`,
    percentText:
      definition.dailyValue === null
        ? null
        : `${Math.round((amount / definition.dailyValue) * 100)}%`,
  };
}

function formatNutrient(key: NutrientKey, amount: number): string {
  const display = getNutrientDisplay(key, amount);
  if (!display) return '';
  const percent = display.percentText ? ` (${display.percentText})` : '';
  return `${display.label}: ${display.amountText}${percent}`;
}

export function formatNutritionString(values: NutrientValues): string {
  return NUTRITION_LABEL_SECTIONS.map((section) =>
    section
      .map((group) =>
        group
          .flatMap((key) => {
            const amount = values[key];
            return amount === undefined || !Number.isFinite(amount)
              ? []
              : [formatNutrient(key, amount)];
          })
          .join(' - '),
      )
      .filter(Boolean)
      .join(' ~ '),
  )
    .filter(Boolean)
    .join(' | ');
}
