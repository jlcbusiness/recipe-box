import {
  formatQuantityRange,
  type MeasurementDraft,
  type MeasurementPayload,
  type MeasurementType,
  serializeMeasurements,
  volumeUnits,
  weightUnits,
} from './measurement-rules';

export type IngredientRowDraft = {
  id: string;
  ingredientId: string | null;
  ingredientName: string;
  isMain: boolean;
  detail: string;
  preparation: string;
  measurements: MeasurementDraft[];
};

export type IngredientRowPayload = {
  ingredient_id: string | null;
  ingredient_name: string | null;
  is_main: boolean;
  detail: string;
  preparation: string;
  measurements: MeasurementPayload[];
};

export function isEmptyIngredientRow(row: IngredientRowDraft): boolean {
  return (
    !row.ingredientId &&
    !row.ingredientName.trim() &&
    !row.isMain &&
    !row.detail.trim() &&
    !row.preparation.trim() &&
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

function uppercaseFirst(value: string): string {
  return value ? `${value[0].toLocaleUpperCase()}${value.slice(1)}` : '';
}

function lowercaseFirst(value: string): string {
  return value ? `${value[0].toLocaleLowerCase()}${value.slice(1)}` : '';
}

export function formatIngredientDisplay(ingredient: {
  ingredient_name: string;
  detail: string;
  preparation: string;
  measurements?: {
    measurement_type: MeasurementType;
    amount_min: number | null;
    amount_max: number | null;
    unit_code: string | null;
    picklist_value: string | null;
  }[];
}): string {
  const name = ingredient.ingredient_name.trim();
  const detail = ingredient.detail.trim();
  const preparation = ingredient.preparation.trim();
  const displayName = /^[\p{Lu}][\p{Ll}]+$/u.test(name) ? lowercaseFirst(name) : name;
  const mainText = [detail ? uppercaseFirst(detail) : '', displayName].filter(Boolean).join(' ');
  const amountText = [...(ingredient.measurements ?? [])]
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
      const quantity = formatQuantityRange(measurement.amount_min, measurement.amount_max);
      const unitCode = measurement.unit_code;
      const unit =
        measurement.measurement_type === 'volume'
          ? volumeUnits.find((option) => option.code === unitCode)?.abbreviation
          : measurement.measurement_type === 'weight'
            ? weightUnits.find((option) => option.code === unitCode)?.abbreviation
            : measurement.picklist_value;
      return [[quantity, unit ? lowercaseFirst(unit) : ''].filter(Boolean).join(' ')];
    })
    .join(' / ');
  const unmeasuredPhrase = (ingredient.measurements ?? []).find(
    (measurement) => measurement.measurement_type === 'unmeasured',
  )?.picklist_value;
  const measuredText = [amountText, mainText].filter(Boolean).join(' ');
  const phraseText = unmeasuredPhrase
    ? `${measuredText} ${lowercaseFirst(unmeasuredPhrase.trim())}`
    : measuredText;

  return preparation ? `${phraseText}, ${lowercaseFirst(preparation)}` : phraseText;
}

export function moveIngredientRow(
  rows: IngredientRowDraft[],
  rowId: string,
  direction: 'up' | 'down',
): IngredientRowDraft[] {
  const index = rows.findIndex((row) => row.id === rowId);
  const targetIndex = index + (direction === 'up' ? -1 : 1);
  if (index < 0 || targetIndex < 0 || targetIndex >= rows.length) {
    return rows;
  }

  const movedRows = [...rows];
  [movedRows[index], movedRows[targetIndex]] = [movedRows[targetIndex], movedRows[index]];
  return movedRows;
}

export function moveIngredientRowTo(
  rows: IngredientRowDraft[],
  rowId: string,
  targetRowId: string,
): IngredientRowDraft[] {
  const sourceIndex = rows.findIndex((row) => row.id === rowId);
  const targetIndex = rows.findIndex((row) => row.id === targetRowId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return rows;
  }

  const movedRows = [...rows];
  const [movedRow] = movedRows.splice(sourceIndex, 1);
  movedRows.splice(targetIndex, 0, movedRow);
  return movedRows;
}

export function serializeIngredientRows(rows: IngredientRowDraft[]): IngredientRowPayload[] {
  const payload: IngredientRowPayload[] = [];

  for (const row of rows) {
    const ingredientName = row.ingredientName.trim();
    const detail = row.detail.trim();
    const preparation = row.preparation.trim();
    const measurements = serializeMeasurements(row.measurements);

    if (!row.ingredientId && !ingredientName) {
      if (row.isMain || detail || preparation || measurements.length > 0) {
        throw new Error('Choose an ingredient for each edited row.');
      }
      continue;
    }

    payload.push({
      ingredient_id: row.ingredientId,
      ingredient_name: row.ingredientId ? null : ingredientName,
      is_main: row.isMain,
      detail,
      preparation,
      measurements,
    });
  }

  return payload;
}
