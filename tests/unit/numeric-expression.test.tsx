import { describe, expect, it } from 'vitest';
import {
  parseArithmeticExpression,
  parseArithmeticInput,
  parseDecimalInput,
  rationalToNumber,
  roundRationalToInteger,
} from '../../src/lib/numeric-expression';

describe('numeric expressions', () => {
  it('evaluates decimal operands exactly before converting to a number', () => {
    const result = parseArithmeticExpression('0.1 + 0.2');

    expect(result).toEqual({ numerator: BigInt(3), denominator: BigInt(10) });
    expect(rationalToNumber(result)).toBe(0.3);
  });

  it('uses standard precedence, parentheses, unary signs, and exact division', () => {
    expect(parseArithmeticExpression('3.5 + 4 * 2 / (1 + 1)')).toEqual({
      numerator: BigInt(15),
      denominator: BigInt(2),
    });
    expect(parseArithmeticExpression('-(2 - 5) * +0.5')).toEqual({
      numerator: BigInt(3),
      denominator: BigInt(2),
    });
    expect(parseArithmeticExpression('1 / 3')).toEqual({
      numerator: BigInt(1),
      denominator: BigInt(3),
    });
  });

  it('rounds exact half values away from zero', () => {
    expect(roundRationalToInteger(parseArithmeticExpression('1 / 2'))).toBe(BigInt(1));
    expect(roundRationalToInteger(parseArithmeticExpression('-1 / 2'))).toBe(BigInt(-1));
    expect(roundRationalToInteger(parseArithmeticExpression('-3 / 2'))).toBe(BigInt(-2));
  });

  it('passes non-expression numeric literals to their field parsers', () => {
    expect(parseArithmeticInput('')).toBeNull();
    expect(parseArithmeticInput('1 1/2')).toBeNull();
    expect(parseArithmeticInput('½')).toBeNull();
    expect(parseArithmeticInput('1/2')).toBeNull();
    expect(parseArithmeticInput('1,234.5')).toBeNull();
  });

  it('resolves decimal-field input exactly and rejects invalid literals or expressions', () => {
    expect(parseDecimalInput('0.1 + 0.2')).toBe(0.3);
    expect(parseDecimalInput('150 / 3')).toBe(50);
    expect(parseDecimalInput('1/2')).toBeNull();
    expect(parseDecimalInput('1 +')).toBeNull();
  });

  it.each(['1 +', '(1 + 2', '1 + 2)', '1 / 0', '1,23 + 4', '2 ** 3'])(
    'rejects malformed attempted expression %j',
    (input) => {
      expect(() => parseArithmeticInput(input)).toThrow();
    },
  );
});
