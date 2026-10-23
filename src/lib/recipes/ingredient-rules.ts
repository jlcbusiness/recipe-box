import {
  formatQuantity,
  formatQuantityRange,
  type MeasurementDraft,
  type MeasurementPayload,
  type MeasurementType,
  parseQuantityInput,
  serializeMeasurements,
  volumeUnits,
  weightUnits,
} from './measurement-rules';

export type IngredientRowDraft = {
  id: string;
  ingredientSetId: string;
  ingredientId: string | null;
  ingredientName: string;
  isMain: boolean;
  detail: string;
  preparation: string;
  measurements: MeasurementDraft[];
  portionOneRatio?: number | null;
  portionOneAmount?: string;
  portionMeasurementType?: MeasurementType;
  sizeValue?: string;
  sizeUnit?: string;
};

export type IngredientRowPayload = {
  recipe_ingredient_id: string;
  ingredient_set_id: string;
  ingredient_id: string | null;
  ingredient_name: string | null;
  is_main: boolean;
  detail: string;
  preparation: string;
  portion_one_ratio: number | null;
  size_value: number | null;
  size_unit: 'in' | 'cm' | null;
  measurements: MeasurementPayload[];
};

export type IngredientDisplayInput = {
  ingredient_name: string;
  detail: string;
  preparation: string;
  portion_one_ratio?: number | null;
  size_value?: number | null;
  size_unit?: 'in' | 'cm' | null;
  measurements?: {
    measurement_type: MeasurementType;
    amount_min: number | null;
    amount_max: number | null;
    unit_code: string | null;
    picklist_value: string | null;
  }[];
};

export type IngredientDisplayParts = {
  name: string;
  specifics: string | null;
  amount: string;
  measurements: {
    quantity: string;
    unitLabel: string | null;
    measurementType: MeasurementType;
    unitCode: string | null;
  }[];
  unmeasuredPhrase: string | null;
  preparation: string | null;
  size: string | null;
};

export type IngredientDisplayOptions = {
  aliasPinch?: boolean;
};

export function getPortionRatio(firstAmount: number, total: number): number | null {
  if (
    !Number.isFinite(firstAmount) ||
    !Number.isFinite(total) ||
    firstAmount <= 0 ||
    total <= 0 ||
    firstAmount >= total
  ) {
    return null;
  }
  return firstAmount / total;
}

export function allocatePortions(total: number, firstRatio: number): [number, number] | null {
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(firstRatio) ||
    total <= 0 ||
    firstRatio <= 0 ||
    firstRatio >= 1
  ) {
    return null;
  }
  const firstAmount = total * firstRatio;
  const secondAmount = total - firstAmount;
  return firstAmount > 0 && secondAmount > 0 ? [firstAmount, secondAmount] : null;
}

export function getIngredientDisplayInputForPortion(
  ingredient: IngredientDisplayInput,
  portionRatio: number | null | undefined,
  portionOrdinal: 1 | 2,
): IngredientDisplayInput {
  if (portionRatio == null) {
    return ingredient;
  }

  return {
    ...ingredient,
    measurements: ingredient.measurements?.map((measurement) => {
      if (measurement.amount_min === null || measurement.amount_max !== null) {
        return measurement;
      }
      const portions = allocatePortions(measurement.amount_min, portionRatio);
      return portions ? { ...measurement, amount_min: portions[portionOrdinal - 1] } : measurement;
    }),
  };
}

export function validatePortionMeasurements(
  measurements: readonly Pick<
    MeasurementPayload,
    'measurement_type' | 'amount_min' | 'amount_max'
  >[],
  firstRatio: number,
): string | null {
  if (!Number.isFinite(firstRatio) || firstRatio <= 0 || firstRatio >= 1) {
    return 'Enter a first portion greater than zero and less than the total.';
  }
  if (
    measurements.length === 0 ||
    measurements.some(
      (measurement) =>
        !['volume', 'weight', 'count', 'informal'].includes(measurement.measurement_type) ||
        measurement.amount_min === null ||
        measurement.amount_max !== null,
    )
  ) {
    return 'Only scalar Unit, Count, and Things amounts can be divided.';
  }
  return null;
}

export function validateIngredientRowUniqueness(
  rows: readonly {
    ingredientSetId: string;
    ingredientId: string | null;
    ingredientName: string;
  }[],
): string | null {
  const seen = new Set<string>();
  for (const row of rows) {
    const identity = row.ingredientId
      ? `id:${row.ingredientId.toLocaleLowerCase()}`
      : `name:${row.ingredientName.trim().normalize('NFKC').toLocaleLowerCase()}`;
    if (identity === 'name:') {
      continue;
    }
    const key = `${row.ingredientSetId.toLocaleLowerCase()}|${identity}`;
    if (seen.has(key)) {
      return 'An ingredient can appear only once in each section.';
    }
    seen.add(key);
  }
  return null;
}

export function validateIngredientSize(
  preparation: string,
  sizeValue: string,
  sizeUnit: string,
): string | null {
  const value = sizeValue.trim();
  const unit = sizeUnit.trim();
  if (!value) {
    return null;
  }
  if (preparation.trim().toLocaleLowerCase() !== 'cubed') {
    return 'Size is available only when Preparation is cubed.';
  }
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value) || !Number.isFinite(Number(value))) {
    return 'Enter a positive decimal Size.';
  }
  if (Number(value) <= 0 || !['in', 'cm'].includes(unit)) {
    return 'Enter a positive Size in inches or centimeters.';
  }
  return null;
}

export function isEmptyIngredientRow(row: IngredientRowDraft): boolean {
  return (
    !row.ingredientId &&
    !row.ingredientName.trim() &&
    !row.isMain &&
    !row.detail.trim() &&
    !row.preparation.trim() &&
    row.portionOneRatio == null &&
    !row.sizeValue?.trim() &&
    !row.sizeUnit?.trim() &&
    row.measurements.length === 0
  );
}

export function ensureTrailingIngredientRow(
  rows: IngredientRowDraft[],
  createEmptyRow: () => IngredientRowDraft,
): IngredientRowDraft[] {
  const trailingEmptyRow = rows.findLast(isEmptyIngredientRow);
  const populatedRows = rows.filter((row) => !isEmptyIngredientRow(row));
  return [...populatedRows, trailingEmptyRow ?? createEmptyRow()];
}

function lowercaseFirst(value: string): string {
  return value ? `${value[0].toLocaleLowerCase()}${value.slice(1)}` : '';
}

function pluralizeUnit(value: string): string {
  const displayValue = lowercaseFirst(value.trim());
  const words = [...displayValue.matchAll(/\p{L}+/gu)];
  const ofIndex = words.findIndex((match) => match[0].toLocaleLowerCase() === 'of');
  const wordMatch = words[ofIndex > 0 ? ofIndex - 1 : words.length - 1];
  if (!wordMatch) {
    return displayValue;
  }

  const word = wordMatch[0];
  const lowerWord = word.toLocaleLowerCase();
  let plural: string;
  if (/(?:s|x|z|ch|sh)$/u.test(lowerWord)) {
    plural = `${word}es`;
  } else if (/[^aeiou]y$/u.test(lowerWord)) {
    plural = `${word.slice(0, -1)}ies`;
  } else {
    plural = `${word}s`;
  }

  const start = wordMatch.index;
  return `${displayValue.slice(0, start)}${plural}${displayValue.slice(start + word.length)}`;
}

export function getIngredientDisplayParts(
  ingredient: IngredientDisplayInput,
  options: IngredientDisplayOptions = {},
): IngredientDisplayParts {
  const name = ingredient.ingredient_name.trim();
  const detail = ingredient.detail.trim();
  const preparation = ingredient.preparation.trim();
  const size =
    ingredient.size_value != null && ingredient.size_unit
      ? `${formatQuantity(ingredient.size_value, ingredient.size_unit === 'cm' ? 'metric' : 'us_customary')} ${ingredient.size_unit}`
      : null;
  const displayName = /^[\p{Lu}][\p{Ll}]+$/u.test(name) ? lowercaseFirst(name) : name;
  const displayedMeasurements = [...(ingredient.measurements ?? [])]
    .filter((measurement) => measurement.measurement_type !== 'unmeasured')
    .sort((left, right) => {
      const order: Record<MeasurementType, number> = {
        volume: 0,
        weight: 1,
        count: 2,
        informal: 3,
        unmeasured: 4,
      };
      return order[left.measurement_type] - order[right.measurement_type];
    })
    .flatMap((measurement) => {
      if (measurement.amount_min === null) {
        return [];
      }
      const unitCode = measurement.unit_code;
      const unit =
        measurement.measurement_type === 'volume'
          ? volumeUnits.find((option) => option.code === unitCode)
          : measurement.measurement_type === 'weight'
            ? weightUnits.find((option) => option.code === unitCode)
            : undefined;
      const isPinch =
        options.aliasPinch === true &&
        measurement.measurement_type === 'volume' &&
        unitCode === 'tsp' &&
        measurement.amount_max === null &&
        measurement.amount_min > 1 / 32 &&
        measurement.amount_min < 3 / 32;
      const quantity = isPinch
        ? ''
        : formatQuantityRange(measurement.amount_min, measurement.amount_max, unit?.system);
      const unitLabel = isPinch ? 'pinch' : (unit?.abbreviation ?? measurement.picklist_value);
      const unitText = isPinch
        ? 'pinch'
        : unitLabel && measurement.measurement_type === 'informal'
          ? (measurement.amount_max ?? measurement.amount_min) > 1
            ? pluralizeUnit(unitLabel)
            : lowercaseFirst(unitLabel)
          : unitLabel &&
              measurement.measurement_type === 'volume' &&
              unitCode === 'cup' &&
              (measurement.amount_max ?? measurement.amount_min) > 1
            ? 'cups'
            : unitLabel
              ? (unit?.abbreviation ?? lowercaseFirst(unitLabel))
              : '';
      return [
        {
          quantity,
          unitLabel: unitText || null,
          measurementType: measurement.measurement_type,
          unitCode,
        },
      ];
    });
  const amountText = displayedMeasurements
    .map(({ quantity, unitLabel }) => [quantity, unitLabel].filter(Boolean).join(' '))
    .join(' / ');
  const unmeasuredPhrase = (ingredient.measurements ?? []).find(
    (measurement) => measurement.measurement_type === 'unmeasured',
  )?.picklist_value;
  return {
    name: displayName,
    specifics: detail ? detail.toLocaleLowerCase() : null,
    amount: amountText,
    measurements: displayedMeasurements,
    unmeasuredPhrase: unmeasuredPhrase ? lowercaseFirst(unmeasuredPhrase.trim()) : null,
    preparation: preparation ? lowercaseFirst(preparation) : null,
    size,
  };
}

export function getPortionDisplayAmounts(
  measurements: IngredientDisplayInput['measurements'],
  firstRatio: number,
  measurementType: MeasurementType,
): [string, string] | null {
  const measurement = measurements?.find((item) => item.measurement_type === measurementType);
  if (!measurement || measurement.amount_min === null || measurement.amount_max !== null) {
    return null;
  }
  const portions = allocatePortions(measurement.amount_min, firstRatio);
  if (!portions) {
    return null;
  }
  return portions.map(
    (amount) =>
      getIngredientDisplayParts({
        ingredient_name: '',
        detail: '',
        preparation: '',
        measurements: [{ ...measurement, amount_min: amount, amount_max: null }],
      }).amount,
  ) as [string, string];
}

export function formatIngredientDisplay(ingredient: IngredientDisplayInput): string {
  const parts = getIngredientDisplayParts(ingredient);
  const mainText = [parts.specifics, parts.name].filter(Boolean).join(' ');
  const measuredText = [parts.amount, mainText].filter(Boolean).join(' ');
  const displayText = parts.unmeasuredPhrase
    ? `${measuredText} ${parts.unmeasuredPhrase}`
    : measuredText;
  const preparationText = [parts.preparation, parts.size].filter(Boolean).join(' ');
  return preparationText ? `${displayText}, ${preparationText}` : displayText;
}

export function moveIngredientRow(
  rows: IngredientRowDraft[],
  rowId: string,
  direction: 'up' | 'down',
): IngredientRowDraft[] {
  const index = rows.findIndex((row) => row.id === rowId);
  const sourceRow = rows[index];
  if (index < 0 || !sourceRow || isEmptyIngredientRow(sourceRow)) {
    return rows;
  }

  const directionStep = direction === 'up' ? -1 : 1;
  let targetIndex = index + directionStep;
  while (targetIndex >= 0 && targetIndex < rows.length) {
    const candidate = rows[targetIndex];
    if (
      candidate &&
      (!isEmptyIngredientRow(candidate) || candidate.ingredientSetId !== sourceRow.ingredientSetId)
    ) {
      break;
    }
    targetIndex += directionStep;
  }
  const targetRow = rows[targetIndex];
  if (!targetRow) {
    return rows;
  }

  const movedRows = [...rows];
  const [movingRow] = movedRows.splice(index, 1);
  if (!movingRow) {
    return rows;
  }
  const remainingTargetIndex = movedRows.findIndex((row) => row.id === targetRow.id);
  const insertionIndex = direction === 'up' ? remainingTargetIndex : remainingTargetIndex + 1;
  movedRows.splice(insertionIndex, 0, {
    ...movingRow,
    ingredientSetId: targetRow.ingredientSetId,
  });
  return movedRows;
}

export function moveIngredientRowTo(
  rows: IngredientRowDraft[],
  rowId: string,
  targetRowId: string,
  insertBeforeTarget = false,
): IngredientRowDraft[] {
  const sourceIndex = rows.findIndex((row) => row.id === rowId);
  const targetIndex = rows.findIndex((row) => row.id === targetRowId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return rows;
  }

  const movedRows = [...rows];
  const [movingRow] = movedRows.splice(sourceIndex, 1);
  const targetRow = rows[targetIndex];
  if (!movingRow || !targetRow) {
    return rows;
  }
  const targetPosition = movedRows.findIndex((row) => row.id === targetRowId);
  const insertionIndex =
    insertBeforeTarget || isEmptyIngredientRow(targetRow) ? targetPosition : targetIndex;
  movedRows.splice(insertionIndex, 0, {
    ...movingRow,
    ingredientSetId: targetRow.ingredientSetId,
  });
  return movedRows;
}

export function serializeIngredientRows(rows: IngredientRowDraft[]): IngredientRowPayload[] {
  const uniquenessError = validateIngredientRowUniqueness(rows);
  if (uniquenessError) {
    throw new Error(uniquenessError);
  }

  const payload: IngredientRowPayload[] = [];

  for (const row of rows) {
    const ingredientName = row.ingredientName.trim();
    const detail = row.detail.trim();
    const preparation = row.preparation.trim();
    const measurements = serializeMeasurements(row.measurements);
    let portionOneRatio = row.portionOneRatio ?? null;
    const sizeValue = row.sizeValue?.trim() ?? '';
    const sizeUnit = sizeValue ? (row.sizeUnit?.trim() ?? '') : '';

    if (portionOneRatio !== null && row.portionOneAmount !== undefined) {
      const firstAmount = parseQuantityInput(row.portionOneAmount);
      const measurement = measurements.find(
        (item) => item.measurement_type === row.portionMeasurementType,
      );
      portionOneRatio =
        firstAmount && firstAmount.maximum === null && measurement?.amount_min !== null
          ? getPortionRatio(firstAmount.minimum, measurement?.amount_min ?? 0)
          : null;
      if (portionOneRatio === null) {
        throw new Error('Enter a first portion greater than zero and less than the total.');
      }
    }

    if (portionOneRatio !== null) {
      const divisionError = validatePortionMeasurements(measurements, portionOneRatio);
      if (divisionError) {
        throw new Error(divisionError);
      }
    }
    if (preparation.toLocaleLowerCase() === 'divided' && portionOneRatio === null) {
      const divisionError = validatePortionMeasurements(measurements, 0.5);
      throw new Error(
        divisionError ?? 'Enter a first portion greater than zero and less than the total.',
      );
    }
    const sizeError = validateIngredientSize(preparation, sizeValue, sizeUnit);
    if (sizeError) {
      throw new Error(sizeError);
    }

    if (!row.ingredientId && !ingredientName) {
      if (
        row.isMain ||
        detail ||
        preparation ||
        portionOneRatio !== null ||
        sizeValue ||
        sizeUnit ||
        measurements.length > 0
      ) {
        throw new Error('Choose an ingredient for each edited row.');
      }
      continue;
    }

    payload.push({
      recipe_ingredient_id: row.id,
      ingredient_set_id: row.ingredientSetId,
      ingredient_id: row.ingredientId,
      ingredient_name: row.ingredientId ? null : ingredientName,
      is_main: row.isMain,
      detail,
      preparation,
      portion_one_ratio: portionOneRatio,
      size_value: sizeValue ? Number(sizeValue) : null,
      size_unit: sizeUnit ? (sizeUnit as 'in' | 'cm') : null,
      measurements,
    });
  }

  return payload;
}
