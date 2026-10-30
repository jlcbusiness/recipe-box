import { describe, expect, it } from 'vitest';
import {
  calculateTotalMinutes,
  clearConditionalValuesForStateChange,
  formatRecipeDuration,
  shouldShowOccasionDetails,
} from '../../src/lib/recipes/recipe-rules';

describe('recipe metadata rules', () => {
  it('clears conditional values when State changes', () => {
    expect(
      clearConditionalValuesForStateChange('want_to_try', 'tried', {
        verdictId: null,
        enthusiasmId: 'enthusiasm-specific-occasion',
        score: '4',
        occasionDetails: 'Birthday dinner',
        reason: null,
      }),
    ).toEqual({
      verdictId: null,
      enthusiasmId: null,
      score: null,
      occasionDetails: null,
      reason: null,
    });

    expect(
      clearConditionalValuesForStateChange('will_not_try', 'want_to_try', {
        verdictId: null,
        enthusiasmId: null,
        score: null,
        occasionDetails: null,
        reason: 'Ingredient allergy',
      }),
    ).toEqual({
      verdictId: null,
      enthusiasmId: null,
      score: null,
      occasionDetails: null,
      reason: null,
    });
  });

  it('shows Occasion Details only for Specific occasion', () => {
    expect(shouldShowOccasionDetails('specific_occasion')).toBe(true);
    expect(shouldShowOccasionDetails('favorite')).toBe(false);
    expect(shouldShowOccasionDetails(null)).toBe(false);
  });

  it('sums component durations only when explicitly requested', () => {
    expect(
      calculateTotalMinutes({
        prep: 15,
        mixing: 10,
        marinate: 60,
        chill: null,
        freeze: 0,
        cook: 30,
        bake: 45,
        cooling: 20,
        rest: 10,
        total: 999,
      }),
    ).toBe(190);
  });

  it.each([
    [0, '0 min'],
    [1, '1 min'],
    [59, '59 min'],
    [60, '1 hr'],
    [61, '1 hr 1 min'],
    [120, '2 hr'],
    [1056, '17 hr 36 min'],
  ])('formats %s minutes for recipe reading', (minutes, expected) => {
    expect(formatRecipeDuration(minutes)).toBe(expected);
  });
});
