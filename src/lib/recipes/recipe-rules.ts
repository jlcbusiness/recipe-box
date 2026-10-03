export type RecipeState = 'want_to_try' | 'tried' | 'will_not_try';

export type ConditionalRecipeValues = {
  verdictId: string | null;
  enthusiasmId: string | null;
  occasionDetails: string | null;
  reason: string | null;
};

export type RecipeComponentTimes = {
  prep: number | null;
  mixing: number | null;
  marinate: number | null;
  chill: number | null;
  freeze: number | null;
  cook: number | null;
  bake: number | null;
  cooling: number | null;
  rest: number | null;
  total: number | null;
};

export function clearConditionalValuesForStateChange(
  previousState: RecipeState,
  nextState: RecipeState,
  values: ConditionalRecipeValues,
): ConditionalRecipeValues {
  if (previousState === nextState) {
    return values;
  }

  return {
    verdictId: null,
    enthusiasmId: null,
    occasionDetails: null,
    reason: null,
  };
}

export function shouldShowOccasionDetails(selectedValue: string | null): boolean {
  return selectedValue === 'specific_occasion';
}

export function calculateTotalMinutes(times: RecipeComponentTimes): number {
  return (
    (times.prep ?? 0) +
    (times.mixing ?? 0) +
    (times.marinate ?? 0) +
    (times.chill ?? 0) +
    (times.freeze ?? 0) +
    (times.cook ?? 0) +
    (times.bake ?? 0) +
    (times.cooling ?? 0) +
    (times.rest ?? 0)
  );
}
