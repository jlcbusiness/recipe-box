import { parseArithmeticExpression, roundRationalToInteger } from '../numeric-expression';

export const MAX_RECIPE_MINUTES = 2_147_483_647;
const maximumRecipeMinutes = BigInt(MAX_RECIPE_MINUTES);
const zero = BigInt(0);

export function parseTimeExpression(expression: string): number {
  const result = parseArithmeticExpression(expression);
  if (result.numerator < zero) {
    throw new Error('Time must not be negative.');
  }

  const rounded = roundRationalToInteger(result);
  if (rounded > maximumRecipeMinutes) {
    throw new Error('Time exceeds the supported whole-minute limit.');
  }
  return Number(rounded);
}
