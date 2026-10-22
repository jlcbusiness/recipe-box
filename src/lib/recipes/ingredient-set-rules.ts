export type IngredientSetDraft = {
  id: string;
  label: string;
  position: number;
};

type IngredientSetLabelError =
  | 'at-least-one'
  | 'duplicate-id'
  | 'empty-label'
  | 'label-too-long'
  | 'duplicate-label';

export function createDefaultIngredientSet(id: string): IngredientSetDraft {
  return { id, label: 'Main', position: 0 };
}

export function validateIngredientSetLabels(
  sets: readonly IngredientSetDraft[],
): IngredientSetLabelError | null {
  if (sets.length === 0) {
    return 'at-least-one';
  }

  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const set of sets) {
    if (!set.id || ids.has(set.id)) {
      return 'duplicate-id';
    }
    ids.add(set.id);

    const label = set.label.trim();
    if (!label) {
      return 'empty-label';
    }
    if (label.length > 80) {
      return 'label-too-long';
    }

    const normalizedLabel = label.normalize('NFKC').toLocaleLowerCase();
    if (labels.has(normalizedLabel)) {
      return 'duplicate-label';
    }
    labels.add(normalizedLabel);
  }

  return null;
}

export function normalizeIngredientSets(
  sets: readonly IngredientSetDraft[],
): IngredientSetDraft[] | null {
  if (validateIngredientSetLabels(sets)) {
    return null;
  }

  return sets
    .map((set, index) => ({ set, index }))
    .sort((left, right) => left.set.position - right.set.position || left.index - right.index)
    .map(({ set }, position) => ({ ...set, label: set.label.trim(), position }));
}

export function moveIngredientRowToSet<TRow extends { id: string; ingredientSetId: string }>(
  rows: readonly TRow[],
  rowId: string,
  setId: string,
  sets: readonly IngredientSetDraft[],
): TRow[] {
  if (!sets.some((set) => set.id === setId)) {
    return rows as TRow[];
  }

  const rowIndex = rows.findIndex((row) => row.id === rowId);
  if (rowIndex < 0 || rows[rowIndex]?.ingredientSetId === setId) {
    return rows as TRow[];
  }

  return rows.map((row, index) => (index === rowIndex ? { ...row, ingredientSetId: setId } : row));
}

export function sortIngredientsBySet<
  TIngredient extends { ingredient_set_id: string; position: number },
>(
  sets: readonly IngredientSetDraft[],
  ingredients: readonly TIngredient[],
  compareWithinSet: (left: TIngredient, right: TIngredient) => number,
): TIngredient[] {
  const orderedSets = [...sets].sort((left, right) => left.position - right.position);
  return orderedSets.flatMap((set) =>
    ingredients
      .filter((ingredient) => ingredient.ingredient_set_id === set.id)
      .map((ingredient, index) => ({ ingredient, index }))
      .sort(
        (left, right) =>
          compareWithinSet(left.ingredient, right.ingredient) ||
          left.ingredient.position - right.ingredient.position ||
          left.index - right.index,
      )
      .map(({ ingredient }) => ingredient),
  );
}
