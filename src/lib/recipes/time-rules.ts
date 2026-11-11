export const MAX_RECIPE_MINUTES = 2_147_483_647;
const maximumRecipeMinutes = BigInt(MAX_RECIPE_MINUTES);
const zero = BigInt(0);
const one = BigInt(1);
const two = BigInt(2);
const maximumExpressionLength = 256;
const tokenPattern = /\s*(\d{1,3}(?:,\d{3})+|\d+|[()+*/-])/y;

type Rational = {
  numerator: bigint;
  denominator: bigint;
};

type Token = {
  kind: 'number' | 'operator' | 'left-paren' | 'right-paren';
  value: string;
};

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < zero ? -left : left;
  let b = right < zero ? -right : right;
  while (b !== zero) {
    [a, b] = [b, a % b];
  }
  return a;
}

function rational(numerator: bigint, denominator = one): Rational {
  if (denominator === zero) {
    throw new Error('Time expression cannot divide by zero.');
  }
  if (denominator < zero) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

function tokenize(expression: string): Token[] {
  const input = expression.trim();
  if (!input) {
    throw new Error('Enter a time expression.');
  }
  if (input.length > maximumExpressionLength) {
    throw new Error('Time expression is too long.');
  }

  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    tokenPattern.lastIndex = index;
    const match = tokenPattern.exec(input);
    if (!match) {
      throw new Error('Use whole numbers, +, -, *, /, and parentheses.');
    }
    const value = match[1];
    const kind: Token['kind'] =
      value === '('
        ? 'left-paren'
        : value === ')'
          ? 'right-paren'
          : /^[0-9]/u.test(value)
            ? 'number'
            : 'operator';
    tokens.push({ kind, value });
    index = tokenPattern.lastIndex;
  }
  return tokens;
}

export function parseTimeExpression(expression: string): number {
  const tokens = tokenize(expression);
  let index = 0;

  function parsePrimary(): Rational {
    const token = tokens[index];
    if (!token) {
      throw new Error('Complete the time expression.');
    }
    if (token.kind === 'number') {
      index += 1;
      return rational(BigInt(token.value.replaceAll(',', '')));
    }
    if (token.kind === 'left-paren') {
      index += 1;
      const value = parseExpression();
      if (tokens[index]?.kind !== 'right-paren') {
        throw new Error('Close the parentheses in the time expression.');
      }
      index += 1;
      return value;
    }
    throw new Error('Enter a whole number or an opening parenthesis.');
  }

  function parseUnary(): Rational {
    const token = tokens[index];
    if (token?.kind === 'operator' && (token.value === '+' || token.value === '-')) {
      index += 1;
      const value = parseUnary();
      return token.value === '-' ? rational(-value.numerator, value.denominator) : value;
    }
    return parsePrimary();
  }

  function parseTerm(): Rational {
    let value = parseUnary();
    while (
      tokens[index]?.kind === 'operator' &&
      (tokens[index].value === '*' || tokens[index].value === '/')
    ) {
      const operator = tokens[index].value;
      index += 1;
      const right = parseUnary();
      value =
        operator === '*'
          ? rational(value.numerator * right.numerator, value.denominator * right.denominator)
          : rational(value.numerator * right.denominator, value.denominator * right.numerator);
    }
    return value;
  }

  function parseExpression(): Rational {
    let value = parseTerm();
    while (
      tokens[index]?.kind === 'operator' &&
      (tokens[index].value === '+' || tokens[index].value === '-')
    ) {
      const operator = tokens[index].value;
      index += 1;
      const right = parseTerm();
      const rightNumerator = operator === '+' ? right.numerator : -right.numerator;
      value = rational(
        value.numerator * right.denominator + rightNumerator * value.denominator,
        value.denominator * right.denominator,
      );
    }
    return value;
  }

  const result = parseExpression();
  if (index !== tokens.length) {
    throw new Error('Check the time expression syntax.');
  }
  if (result.numerator < zero) {
    throw new Error('Time must not be negative.');
  }

  let rounded = result.numerator / result.denominator;
  const remainder = result.numerator % result.denominator;
  if (remainder * two >= result.denominator) {
    rounded += one;
  }
  if (rounded > maximumRecipeMinutes) {
    throw new Error('Time exceeds the supported whole-minute limit.');
  }
  return Number(rounded);
}
