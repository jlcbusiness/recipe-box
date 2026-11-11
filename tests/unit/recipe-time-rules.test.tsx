import { describe, expect, it } from 'vitest';
import { parseTimeExpression } from '../../src/lib/recipes/time-rules';

describe('parseTimeExpression', () => {
  it('evaluates arithmetic with ordinary precedence and parentheses', () => {
    expect(parseTimeExpression('3 + 4 * 2 / (1 + 1)')).toBe(7);
    expect(parseTimeExpression('(20 - 3 - 4) * 2')).toBe(26);
    expect(parseTimeExpression(' 8 / 4 * 3 ')).toBe(6);
    expect(parseTimeExpression('1,000 + 2')).toBe(1002);
  });

  it('rounds fractional results to the nearest minute with halves up', () => {
    expect(parseTimeExpression('1 / 3')).toBe(0);
    expect(parseTimeExpression('1 / 2')).toBe(1);
    expect(parseTimeExpression('3 / 2')).toBe(2);
    expect(parseTimeExpression('5 / 2')).toBe(3);
  });

  it('permits negative intermediate results when the final result is non-negative', () => {
    expect(parseTimeExpression('2 - 4 + 3')).toBe(1);
  });

  it('accepts the largest supported database integer', () => {
    expect(parseTimeExpression('2147483647')).toBe(2147483647);
  });

  it.each([
    '',
    '   ',
    '1 +',
    '(1 + 2',
    '1 + 2)',
    '1 / 0',
    '1 / (2 - 2)',
    '1 - 2',
    '2147483648',
    '1.5',
    '12,00',
    '2 ** 3',
    'globalThis.__timeExpressionProbe = 1',
  ])('rejects invalid or unsupported expression %j', (expression) => {
    expect(() => parseTimeExpression(expression)).toThrow();
  });

  it('does not execute input as JavaScript', () => {
    const probe = '__timeExpressionProbe';
    Reflect.deleteProperty(globalThis, probe);

    expect(() => parseTimeExpression(`globalThis.${probe} = 1`)).toThrow();
    expect(Reflect.has(globalThis, probe)).toBe(false);
  });
});
