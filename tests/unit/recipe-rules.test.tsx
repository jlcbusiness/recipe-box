import { describe, expect, it } from 'vitest';
import {
  calculateTotalMinutes,
  clearConditionalValuesForStateChange,
  formatRecipeDuration,
  formatRecipeMakes,
  parseMakesInput,
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

  it('validates Makes as an optional pair and preserves authored thing text', () => {
    expect(parseMakesInput('', '')).toEqual({ quantity: null, thing: null });
    expect(parseMakesInput('1,200', '  baby cakes  ')).toEqual({
      quantity: 1200,
      thing: '  baby cakes  ',
    });
    expect(parseMakesInput('', 'cookies')).toEqual({
      error: 'Enter both a Makes quantity and thing, or leave both blank.',
    });
    expect(parseMakesInput('2', '   ')).toEqual({
      error: 'Enter both a Makes quantity and thing, or leave both blank.',
    });
  });

  it.each(['0', '-1', '1.5', '12,00'])('rejects invalid Makes quantity %s', (quantity) => {
    expect(parseMakesInput(quantity, 'cookies')).toEqual({
      error: 'Makes quantity must be a whole number greater than zero.',
    });
  });

  it('formats scaled Makes quantities without rewriting the authored thing', () => {
    expect(formatRecipeMakes(3, 'baby')).toBe('3 baby');
    expect(formatRecipeMakes(1, 'cookies', 0.5)).toBe('½ cookies');
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
