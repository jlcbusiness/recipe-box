import { formatGroupedInteger, formatQuantity, parseGroupedInteger } from './measurement-rules';

export type RecipeState = 'want_to_try' | 'tried' | 'will_not_try';

export const recipeScoreValues = [-5, -3, -1, 0, 1, 2, 3, 4, 5] as const;
export type RecipeScore = (typeof recipeScoreValues)[number];

export type ConditionalRecipeValues = {
  verdictId: string | null;
  enthusiasmId: string | null;
  score: string | null;
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
    score: null,
    occasionDetails: null,
    reason: null,
  };
}

export function isRecipeScore(value: number): value is RecipeScore {
  return recipeScoreValues.some((score) => score === value);
}

export function shouldShowOccasionDetails(selectedValue: string | null): boolean {
  return selectedValue === 'specific_occasion';
}

export function parseMakesInput(
  quantityText: string,
  thingText: string,
): { quantity: number | null; thing: string | null } | { error: string } {
  const quantityValue = quantityText.trim();
  const hasThing = thingText.trim().length > 0;
  if (!quantityValue && !hasThing) {
    return { quantity: null, thing: null };
  }
  if (!quantityValue || !hasThing) {
    return { error: 'Enter both a Makes quantity and thing, or leave both blank.' };
  }

  const quantity = parseGroupedInteger(quantityValue);
  if (quantity === null || quantity <= 0) {
    return { error: 'Makes quantity must be a whole number greater than zero.' };
  }

  return { quantity, thing: thingText };
}

export function formatRecipeMakes(quantity: number, thing: string, multiplier = 1): string {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error('Makes quantity must be a positive safe integer.');
  }
  if (!thing.trim()) {
    throw new Error('Makes thing must not be blank.');
  }
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error('Recipe scale multiplier must be positive and finite.');
  }

  return `${formatQuantity(quantity * multiplier, 'us_customary')} ${thing}`;
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

export function formatRecipeDuration(minutes: number): string {
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    throw new Error('Recipe duration must be a non-negative safe integer.');
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) {
    return `${formatGroupedInteger(minutes)} min`;
  }

  return remainingMinutes === 0
    ? `${formatGroupedInteger(hours)} hr`
    : `${formatGroupedInteger(hours)} hr ${remainingMinutes} min`;
}
