export type MeasurementType = 'volume' | 'weight' | 'count' | 'informal' | 'unmeasured';
export type MeasurementSystem = 'us_customary' | 'metric';

export type MeasurementInput = {
  type: MeasurementType;
  quantity: string;
  unitCode: string | null;
  picklistValueId: string | null;
  parsedQuantity?: ParsedQuantity;
};

export type MeasurementDraft = {
  id: string;
  type: MeasurementType | '';
  quantity: string;
  unitCode: string;
  picklistValueId: string;
  derivedFromDensity?: boolean;
  derivedQuantity?: ParsedQuantity;
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

const unicodeFractionValues: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

const unicodeFractionGlyphs: Record<string, string> = {
  '1/2': '½',
  '1/3': '⅓',
  '2/3': '⅔',
  '1/4': '¼',
  '3/4': '¾',
  '1/8': '⅛',
  '3/8': '⅜',
  '5/8': '⅝',
  '7/8': '⅞',
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
  const wholeNumber = '(?:\\d+|\\d{1,3}(?:,\\d{3})+)';
  const decimal = value.match(new RegExp(`^(${wholeNumber})(?:\\.(\\d+))?$`));
  const leadingDecimal = value.match(/^\.(\d+)$/);
  if (decimal || leadingDecimal) {
    const integerPart = decimal ? decimal[1].replaceAll(',', '') : '0';
    const fractionalPart = decimal?.[2] ?? leadingDecimal?.[1];
    const parsed = Number(`${integerPart}${fractionalPart ? `.${fractionalPart}` : ''}`);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const mixed = value.match(new RegExp(`^(${wholeNumber})\\s+(\\d+)\\/(\\d+)$`));
  if (mixed) {
    const whole = Number(mixed[1].replaceAll(',', ''));
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (denominator === 0) {
      return null;
    }
    const parsed = whole + numerator / denominator;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const unicodeMixed = value.match(
    new RegExp(`^(${wholeNumber})\\s+(${Object.keys(unicodeFractionValues).join('|')})$`, 'u'),
  );
  if (unicodeMixed) {
    const whole = Number(unicodeMixed[1].replaceAll(',', ''));
    const parsed = whole + unicodeFractionValues[unicodeMixed[2]];
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const unicodeFraction = unicodeFractionValues[value];
  if (unicodeFraction !== undefined) {
    return unicodeFraction;
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

function fractionText(value: number, useUnicodeGlyphs: boolean): string | null {
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

  const fractionText = `${closest.numerator}/${closest.denominator}`;
  const fractionPart = useUnicodeGlyphs
    ? (unicodeFractionGlyphs[fractionText] ?? fractionText)
    : fractionText;
  return whole > 0 ? `${whole} ${fractionPart}` : fractionPart;
}

export function formatGroupedInteger(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function parseGroupedInteger(value: string): number | null {
  const normalized = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized.replaceAll(',', ''));
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function formatGroupedIntegerInput(value: string): string {
  const parsed = parseGroupedInteger(value);
  return parsed === null ? value : formatGroupedInteger(parsed);
}

function formatQuantityValue(
  value: number,
  system: MeasurementSystem,
  useUnicodeGlyphs: boolean,
): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  if (system === 'metric') {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(value);
  }

  const fraction = fractionText(value, useUnicodeGlyphs);
  if (fraction !== null) {
    return fraction.replace(/^\d+/, (whole) => formatGroupedInteger(Number(whole)));
  }

  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
    Number(value.toFixed(2)),
  );
}

export function formatQuantity(value: number, system: MeasurementSystem = 'us_customary'): string {
  return formatQuantityValue(value, system, true);
}

export function formatQuantityRange(
  minimum: number,
  maximum: number | null,
  system: MeasurementSystem = 'us_customary',
): string {
  const lower = formatQuantity(minimum, system);
  return maximum === null ? lower : `${lower}-${formatQuantity(maximum, system)}`;
}

export function formatQuantityInput(
  value: string,
  _system: MeasurementSystem = 'us_customary',
): string {
  const parsed = parseQuantityInput(value);
  if (!parsed) {
    return value;
  }
  const minimum = formatEditableQuantityValue(parsed.minimum);
  return parsed.maximum === null
    ? minimum
    : `${minimum}-${formatEditableQuantityValue(parsed.maximum)}`;
}

function formatEditableQuantityValue(value: number): string {
  const whole = Math.floor(value);
  const fraction = value - whole;
  if (fraction === 0) {
    return formatGroupedInteger(whole);
  }

  const fractionDenominators = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 20, 32, 64];
  for (const denominator of fractionDenominators) {
    const numerator = Math.round(fraction * denominator);
    const candidate = whole + numerator / denominator;
    if (numerator > 0 && numerator < denominator && value === candidate) {
      const fractionText = `${numerator}/${denominator}`;
      return whole > 0 ? `${formatGroupedInteger(whole)} ${fractionText}` : fractionText;
    }
  }

  const expanded = expandScientificNotation(value.toString());
  const [integerPart, fractionalPart] = expanded.split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fractionalPart ? `${groupedInteger}.${fractionalPart}` : groupedInteger;
}

function expandScientificNotation(value: string): string {
  const [coefficient, exponentText] = value.toLowerCase().split('e');
  if (exponentText === undefined) {
    return coefficient;
  }

  const exponent = Number(exponentText);
  const decimalPosition =
    coefficient.indexOf('.') < 0 ? coefficient.length : coefficient.indexOf('.');
  const digits = coefficient.replace('.', '');
  const expandedPosition = decimalPosition + exponent;
  if (expandedPosition <= 0) {
    return `0.${'0'.repeat(-expandedPosition)}${digits}`;
  }
  if (expandedPosition >= digits.length) {
    return `${digits}${'0'.repeat(expandedPosition - digits.length)}`;
  }
  return `${digits.slice(0, expandedPosition)}.${digits.slice(expandedPosition)}`;
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

    if (!(measurement.parsedQuantity ?? parseQuantityInput(measurement.quantity))) {
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
      parsedQuantity: draft.derivedFromDensity ? draft.derivedQuantity : undefined,
    };
  });

  const validationError = validateMeasurementSet(inputs);
  if (validationError) {
    throw new Error(validationError);
  }

  return inputs.map((input) => {
    const parsed =
      input.type === 'unmeasured'
        ? null
        : (input.parsedQuantity ?? parseQuantityInput(input.quantity));
    return {
      measurement_type: input.type,
      amount_min: parsed?.minimum ?? null,
      amount_max: parsed?.maximum ?? null,
      unit_code: input.unitCode,
      picklist_value_id: input.picklistValueId,
    };
  });
}
