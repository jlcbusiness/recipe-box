export type MeasurementType = 'volume' | 'weight' | 'count' | 'informal' | 'unmeasured';
export type MeasurementSystem = 'us_customary' | 'metric';

export type MeasurementInput = {
  type: MeasurementType;
  quantity: string;
  unitCode: string | null;
  picklistValueId: string | null;
};

export type MeasurementDraft = {
  id: string;
  type: MeasurementType | '';
  quantity: string;
  unitCode: string;
  picklistValueId: string;
};

export type MeasurementPayload = {
  measurement_type: MeasurementType;
  amount_min: number | null;
  amount_max: number | null;
  unit_code: string | null;
  picklist_value_id: string | null;
};

export type ParsedQuantity = {
  minimum: number;
  maximum: number | null;
};

export type MeasurementUnit = {
  code: string;
  label: string;
  abbreviation: string;
  system: MeasurementSystem;
};

export const volumeUnits: MeasurementUnit[] = [
  { code: 'tsp', label: 'Teaspoon', abbreviation: 'tsp', system: 'us_customary' },
  { code: 'tbsp', label: 'Tablespoon', abbreviation: 'TBSP', system: 'us_customary' },
  { code: 'fl_oz', label: 'Fluid ounce', abbreviation: 'fl oz', system: 'us_customary' },
  { code: 'cup', label: 'Cup', abbreviation: 'cup', system: 'us_customary' },
  { code: 'pt', label: 'Pint', abbreviation: 'pt', system: 'us_customary' },
  { code: 'qt', label: 'Quart', abbreviation: 'qt', system: 'us_customary' },
  { code: 'gal', label: 'Gallon', abbreviation: 'gal', system: 'us_customary' },
  { code: 'ml', label: 'Milliliter', abbreviation: 'ml', system: 'metric' },
  { code: 'l', label: 'Liter', abbreviation: 'L', system: 'metric' },
];

export const weightUnits: MeasurementUnit[] = [
  { code: 'oz', label: 'Ounce', abbreviation: 'oz', system: 'us_customary' },
  { code: 'lb', label: 'Pound', abbreviation: 'lb', system: 'us_customary' },
  { code: 'g', label: 'Gram', abbreviation: 'g', system: 'metric' },
  { code: 'kg', label: 'Kilogram', abbreviation: 'kg', system: 'metric' },
];

function parsePositiveNumber(value: string): number | null {
  const decimal = value.match(/^(\d+)(?:\.(\d+))?$/);
  if (decimal) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (denominator === 0) {
      return null;
    }
    const parsed = whole + numerator / denominator;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const fraction = value.match(/^(\d+)\/(\d+)$/);
  if (!fraction) {
    return null;
  }

  const numerator = Number(fraction[1]);
  const denominator = Number(fraction[2]);
  if (denominator === 0) {
    return null;
  }
  const parsed = numerator / denominator;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseQuantityInput(value: string): ParsedQuantity | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const rangeSeparator = normalized.indexOf('-');
  if (rangeSeparator < 0) {
    const minimum = parsePositiveNumber(normalized);
    return minimum === null ? null : { minimum, maximum: null };
  }

  if (normalized.indexOf('-', rangeSeparator + 1) >= 0) {
    return null;
  }

  const minimum = parsePositiveNumber(normalized.slice(0, rangeSeparator).trim());
  const maximum = parsePositiveNumber(normalized.slice(rangeSeparator + 1).trim());
  if (minimum === null || maximum === null || maximum < minimum) {
    return null;
  }

  return { minimum, maximum };
}

function fractionText(value: number): string | null {
  const whole = Math.floor(value);
  const fraction = value - whole;
  if (fraction < 0.000001) {
    return whole.toString();
  }

  let closest: { numerator: number; denominator: number; difference: number } | null = null;
  for (const denominator of [2, 3, 4, 8]) {
    for (let numerator = 1; numerator < denominator; numerator += 1) {
      const difference = Math.abs(fraction - numerator / denominator);
      if (!closest || difference < closest.difference) {
        closest = { numerator, denominator, difference };
      }
    }
  }

  if (!closest || closest.difference > 0.03) {
    return null;
  }

  const fractionPart = `${closest.numerator}/${closest.denominator}`;
  return whole > 0 ? `${whole} ${fractionPart}` : fractionPart;
}

export function formatQuantity(value: number, system: MeasurementSystem = 'us_customary'): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  if (system === 'metric') {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
      useGrouping: false,
    }).format(value);
  }

  const fraction = fractionText(value);
  if (fraction !== null) {
    return fraction;
  }

  return Number(value.toFixed(2)).toString();
}

export function formatQuantityRange(
  minimum: number,
  maximum: number | null,
  system: MeasurementSystem = 'us_customary',
): string {
  const lower = formatQuantity(minimum, system);
  return maximum === null ? lower : `${lower}-${formatQuantity(maximum, system)}`;
}

export function validateMeasurementSet(measurements: MeasurementInput[]): string | null {
  if (measurements.length > 2) {
    return 'An ingredient can have at most two measurements.';
  }

  if (new Set(measurements.map((measurement) => measurement.type)).size !== measurements.length) {
    return 'Measurement types must be unique for an ingredient.';
  }

  if (
    measurements.length === 2 &&
    !(
      measurements.some((measurement) => measurement.type === 'volume') &&
      measurements.some((measurement) => measurement.type === 'weight')
    )
  ) {
    return 'Only Volume and Weight can be paired.';
  }

  for (const measurement of measurements) {
    if (measurement.type === 'unmeasured') {
      if (measurement.quantity.trim() || measurement.unitCode || !measurement.picklistValueId) {
        return 'Choose an Unmeasured phrase without a numeric amount or unit.';
      }
      continue;
    }

    if (!parseQuantityInput(measurement.quantity)) {
      return 'Enter a positive whole number, decimal, fraction, mixed number, or range.';
    }

    if (measurement.type === 'volume') {
      if (
        !volumeUnits.some((unit) => unit.code === measurement.unitCode) ||
        measurement.picklistValueId
      ) {
        return 'Choose a valid Volume unit.';
      }
    } else if (measurement.type === 'weight') {
      if (
        !weightUnits.some((unit) => unit.code === measurement.unitCode) ||
        measurement.picklistValueId
      ) {
        return 'Choose a valid Weight unit.';
      }
    } else if (measurement.type === 'count') {
      if (measurement.unitCode || measurement.picklistValueId) {
        return 'Count does not use a unit.';
      }
    } else if (measurement.type === 'informal') {
      if (measurement.unitCode || !measurement.picklistValueId) {
        return 'Choose an Informal unit.';
      }
    } else {
      return 'Choose a valid measurement type.';
    }
  }

  return null;
}

export function serializeMeasurements(drafts: MeasurementDraft[]): MeasurementPayload[] {
  const unitDrafts = drafts.filter((draft) => draft.type === 'volume' || draft.type === 'weight');
  const enteredUnitDrafts = unitDrafts.filter((draft) => draft.quantity.trim());
  if (unitDrafts.length > 0 && enteredUnitDrafts.length === 0) {
    throw new Error('Enter a volume or weight amount.');
  }

  const selected = [
    ...enteredUnitDrafts,
    ...drafts.filter(
      (draft) =>
        draft.type !== 'volume' &&
        draft.type !== 'weight' &&
        (draft.type || draft.quantity.trim() || draft.unitCode || draft.picklistValueId),
    ),
  ];
  const inputs: MeasurementInput[] = selected.map((draft) => {
    if (!draft.type) {
      throw new Error('Choose a measurement type.');
    }
    return {
      type: draft.type,
      quantity: draft.quantity,
      unitCode: draft.unitCode || null,
      picklistValueId: draft.picklistValueId || null,
    };
  });

  const validationError = validateMeasurementSet(inputs);
  if (validationError) {
    throw new Error(validationError);
  }

  return inputs.map((input) => {
    const parsed = input.type === 'unmeasured' ? null : parseQuantityInput(input.quantity);
    return {
      measurement_type: input.type,
      amount_min: parsed?.minimum ?? null,
      amount_max: parsed?.maximum ?? null,
      unit_code: input.unitCode,
      picklist_value_id: input.picklistValueId,
    };
  });
}
