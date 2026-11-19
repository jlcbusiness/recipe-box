export type ExactRational = {
  numerator: bigint;
  denominator: bigint;
};

type Token = {
  kind: 'number' | 'operator' | 'left-paren' | 'right-paren';
  value: string;
};

const zero = BigInt(0);
const one = BigInt(1);
const two = BigInt(2);
const maximumExpressionLength = 256;
const maximumRationalBits = 4096;
const tokenPattern = /\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?|\s*(\.\d+)|\s*([()+*/-])/y;
const fractionGlyphPattern = /^[½⅓⅔¼¾⅛⅜⅝⅞]$/u;
const simpleFractionPattern = /^(?:\d{1,3}(?:,\d{3})+|\d+)\s+\d+\/\d+$|^\d+\/\d+$/u;
const decimalLiteralPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < zero ? -left : left;
  let b = right < zero ? -right : right;
  while (b !== zero) {
    [a, b] = [b, a % b];
  }
  return a;
}

function rational(numerator: bigint, denominator = one): ExactRational {
  if (denominator === zero) {
    throw new Error('An expression cannot divide by zero.');
  }
  if (denominator < zero) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = greatestCommonDivisor(numerator, denominator);
  const normalized = {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
  if (
    normalized.numerator.toString(2).length > maximumRationalBits ||
    normalized.denominator.toString(2).length > maximumRationalBits
  ) {
    throw new Error('Expression result exceeds the supported precision.');
  }
  return normalized;
}

function tokenize(expression: string): Token[] {
  const input = expression.trim();
  if (!input) {
    throw new Error('Enter a numeric expression.');
  }
  if (input.length > maximumExpressionLength) {
    throw new Error('Expression is too long.');
  }

  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    if (!input.slice(index).trim()) {
      break;
    }
    tokenPattern.lastIndex = index;
    const match = tokenPattern.exec(input);
    if (!match) {
      throw new Error('Use numbers, +, -, *, /, and parentheses.');
    }

    const groupedNumber = match[1];
    const decimalFraction = match[2];
    const leadingDecimal = match[3];
    const operator = match[4];
    if (groupedNumber !== undefined) {
      const integerDigits = groupedNumber.replaceAll(',', '');
      const fractionDigits = decimalFraction ?? '';
      const numerator = BigInt(`${integerDigits}${fractionDigits}`);
      const denominator = BigInt(10) ** BigInt(fractionDigits.length);
      tokens.push({ kind: 'number', value: rational(numerator, denominator).numerator.toString() });
      if (denominator !== BigInt(1)) {
        const parsed = rational(numerator, denominator);
        tokens[tokens.length - 1].value = `${parsed.numerator}/${parsed.denominator}`;
      }
    } else if (leadingDecimal !== undefined) {
      const fractionDigits = leadingDecimal.slice(1);
      const parsed = rational(BigInt(fractionDigits), BigInt(10) ** BigInt(fractionDigits.length));
      tokens.push({
        kind: 'number',
        value: `${parsed.numerator}/${parsed.denominator}`,
      });
    } else if (operator !== undefined) {
      const kind = operator === '(' ? 'left-paren' : operator === ')' ? 'right-paren' : 'operator';
      tokens.push({ kind, value: operator });
    } else {
      throw new Error('Enter a valid numeric expression.');
    }
    index = tokenPattern.lastIndex;
  }
  return tokens;
}

function tokenRational(value: string): ExactRational {
  const [numerator, denominator] = value.split('/');
  return rational(BigInt(numerator), denominator ? BigInt(denominator) : one);
}

export function parseArithmeticExpression(expression: string): ExactRational {
  const tokens = tokenize(expression);
  let index = 0;

  function parsePrimary(): ExactRational {
    const token = tokens[index];
    if (!token) {
      throw new Error('Complete the numeric expression.');
    }
    if (token.kind === 'number') {
      index += 1;
      return tokenRational(token.value);
    }
    if (token.kind === 'left-paren') {
      index += 1;
      const value = parseExpression();
      if (tokens[index]?.kind !== 'right-paren') {
        throw new Error('Close the parentheses in the numeric expression.');
      }
      index += 1;
      return value;
    }
    throw new Error('Enter a number or an opening parenthesis.');
  }

  function parseUnary(): ExactRational {
    const token = tokens[index];
    if (token?.kind === 'operator' && (token.value === '+' || token.value === '-')) {
      index += 1;
      const value = parseUnary();
      return token.value === '-' ? rational(-value.numerator, value.denominator) : value;
    }
    return parsePrimary();
  }

  function parseTerm(): ExactRational {
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

  function parseExpression(): ExactRational {
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
    throw new Error('Check the numeric expression syntax.');
  }
  return result;
}

export function parseArithmeticInput(input: string): ExactRational | null {
  const value = input.trim();
  if (!value || fractionGlyphPattern.test(value) || simpleFractionPattern.test(value)) {
    return null;
  }
  return /[()+*/-]/u.test(value) ? parseArithmeticExpression(value) : null;
}

export function parseNumericInput<T>(
  input: string,
  parseLiteral: (value: string) => T | null,
  normalizeExpression: (value: ExactRational) => T | null,
): T | null {
  try {
    const expression = parseArithmeticInput(input);
    return expression ? normalizeExpression(expression) : parseLiteral(input);
  } catch {
    return null;
  }
}

export function parseDecimalInput(input: string): number | null {
  return parseNumericInput(
    input,
    (literal) => {
      const normalized = literal.trim();
      if (!decimalLiteralPattern.test(normalized)) {
        return null;
      }
      const value = Number(normalized);
      return Number.isFinite(value) ? value : null;
    },
    rationalToNumber,
  );
}

export function rationalToNumber(value: ExactRational): number {
  const negative = value.numerator < zero;
  const numerator = negative ? -value.numerator : value.numerator;
  const integer = numerator / value.denominator;
  let remainder = numerator % value.denominator;
  let fraction = '';
  for (let digit = 0; digit < 1300 && remainder !== zero; digit += 1) {
    remainder *= BigInt(10);
    fraction += (remainder / value.denominator).toString();
    remainder %= value.denominator;
  }
  const result = Number(`${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`);
  if (!Number.isFinite(result)) {
    throw new Error('Expression result is outside the supported numeric range.');
  }
  return result;
}

export function roundRationalToInteger(value: ExactRational): bigint {
  const negative = value.numerator < zero;
  const numerator = negative ? -value.numerator : value.numerator;
  let rounded = numerator / value.denominator;
  if ((numerator % value.denominator) * two >= value.denominator) {
    rounded += one;
  }
  return negative ? -rounded : rounded;
}
