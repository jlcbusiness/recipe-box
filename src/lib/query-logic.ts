export type QueryRule = {
  id: string;
  field: string;
  operator: string;
  value?: string | number | (string | number)[];
  value_to?: string | number;
};

export type QueryNode =
  | { id: string }
  | { op: 'not'; child: QueryNode }
  | { op: 'and' | 'or'; left: QueryNode; right: QueryNode };

type Reference = { start: number; end: number; id: string; number: number };
export type DeletedRuleReference = Pick<Reference, 'start' | 'end' | 'number'>;
export type BoundQueryExpression = {
  text: string;
  tree: QueryNode;
  references: Reference[];
};
export type AdvancedRules = { version: 1; text: string; rules: QueryRule[] };
type Filter = Omit<QueryRule, 'id'>;
export class QueryLogicError extends Error {}
type Token = {
  kind: 'rule' | '(' | ')' | 'and' | 'or' | 'not';
  text: string;
  start: number;
  end: number;
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class DeletedRuleReferenceError extends QueryLogicError {
  readonly references: DeletedRuleReference[];

  constructor(references: DeletedRuleReference[]) {
    super('Remove or replace the deleted rule.');
    this.name = 'DeletedRuleReferenceError';
    this.references = references;
  }
}

export function bindQueryExpression(
  text: string,
  ids: readonly (string | null)[],
): BoundQueryExpression | null {
  if (text.length > 1024) throw new Error('Advanced Rules allows at most 1,024 characters.');
  if (ids.filter((id) => id !== null).length > 10)
    throw new Error('Advanced Rules allows at most 10 rules.');
  if (!text.trim()) return null;
  const deletedReferences = [...text.matchAll(/\[deleted rule (\d+)\]/g)];
  if (deletedReferences.length) {
    throw new DeletedRuleReferenceError(
      deletedReferences.map((match) => {
        const start = match.index + match[0].lastIndexOf(match[1]);
        return { start, end: start + match[1].length, number: Number(match[1]) };
      }),
    );
  }
  const tokens: Token[] = [];
  const pattern = /\s+|&&?|\|\|?|!|-and\b|-or\b|-not\b|AND\b|OR\b|NOT\b|[()]|[1-9][0-9]*/iy;
  let offset = 0;
  while (offset < text.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(text);
    if (!match)
      throw new Error(
        `Unexpected token at character ${offset + 1}: ${text.slice(offset, offset + 12)}`,
      );
    offset = pattern.lastIndex;
    const value = match[0];
    if (/^\s+$/.test(value)) continue;
    const normalized = value.toLowerCase();
    const kind = /^\d+$/.test(value)
      ? 'rule'
      : ['and', '-and', '&', '&&'].includes(normalized)
        ? 'and'
        : ['or', '-or', '|', '||'].includes(normalized)
          ? 'or'
          : ['not', '-not', '!'].includes(normalized)
            ? 'not'
            : normalized === '('
              ? '('
              : ')';
    tokens.push({ kind, text: value, start: match.index, end: offset });
    if (tokens.length > 256) throw new Error('Advanced Rules allows at most 256 tokens.');
  }
  const deletedRuleReferences = tokens.flatMap((token) => {
    if (token.kind !== 'rule') return [];
    const number = Number(token.text);
    return ids[number - 1] === null ? [{ start: token.start, end: token.end, number }] : [];
  });
  if (deletedRuleReferences.length) throw new DeletedRuleReferenceError(deletedRuleReferences);
  let cursor = 0;
  const references: Reference[] = [];
  function primary(depth: number): QueryNode {
    const token = tokens[cursor++];
    if (!token) throw new Error('Expected a rule number or opening parenthesis.');
    if (token.kind === 'not') return { op: 'not', child: primary(depth) };
    if (token.kind === '(') {
      if (depth >= 16) throw new Error('Advanced Rules allows at most 16 parenthesis levels.');
      const node = expression('or', depth + 1);
      if (tokens[cursor++]?.kind !== ')') throw new Error('Missing closing parenthesis.');
      return node;
    }
    if (token.kind !== 'rule')
      throw new Error(`Expected a rule number at character ${token.start + 1}.`);
    const number = Number(token.text);
    const id = ids[number - 1];
    if (id === null)
      throw new DeletedRuleReferenceError([{ start: token.start, end: token.end, number }]);
    if (!id) throw new Error(`Rule ${token.text} does not exist.`);
    references.push({ start: token.start, end: token.end, id, number });
    return { id };
  }
  function expression(op: 'and' | 'or', depth: number): QueryNode {
    const next = () => (op === 'or' ? expression('and', depth) : primary(depth));
    let node = next();
    while (tokens[cursor]?.kind === op) {
      cursor++;
      node = { op, left: node, right: next() };
    }
    return node;
  }
  const tree = expression('or', 0);
  if (cursor !== tokens.length)
    throw new Error(`Expected AND or OR at character ${tokens[cursor].start + 1}.`);
  const used = new Set(references.map(({ id }) => id));
  const unused = ids.flatMap((id, index) => (id !== null && !used.has(id) ? [index + 1] : []));
  if (unused.length)
    throw new Error(`Unused rules: ${unused.join(', ')}. Include every rule in the expression.`);
  return { text, tree, references };
}

export function renumberQueryExpression(
  bound: BoundQueryExpression,
  ids: readonly string[],
): BoundQueryExpression {
  let text = '';
  let offset = 0;
  const references = bound.references.map((reference) => {
    text += bound.text.slice(offset, reference.start);
    const index = ids.indexOf(reference.id);
    const number = index < 0 ? reference.number : index + 1;
    const replacement = index < 0 ? `[deleted rule ${number}]` : String(number);
    const start = text.length;
    text += replacement;
    offset = reference.end;
    return { ...reference, number, start, end: text.length };
  });
  text += bound.text.slice(offset);
  return { text, references, tree: bound.tree };
}

export function encodeAdvancedRules(text: string, rules: QueryRule[]): Filter {
  if (
    !bindQueryExpression(
      text,
      rules.map(({ id }) => id),
    )
  )
    throw new Error('Advanced Rules expression is empty.');
  const filter = {
    field: 'advanced_rules',
    operator: 'matches',
    value: JSON.stringify({ version: 1, text, rules }),
  };
  decodeAdvancedRules(filter);
  return filter;
}

export function readAdvancedRules(filter: Filter): AdvancedRules {
  if (
    filter.field !== 'advanced_rules' ||
    filter.operator !== 'matches' ||
    typeof filter.value !== 'string'
  ) {
    throw new Error('Invalid Advanced Rules filter.');
  }
  if (new TextEncoder().encode(filter.value).byteLength > 65536) {
    throw new Error('Advanced Rules input exceeds 65,536 UTF-8 bytes.');
  }
  let value: unknown;
  try {
    value = JSON.parse(filter.value);
  } catch {
    throw new Error('Invalid Advanced Rules JSON.');
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.text !== 'string' ||
    Object.keys(value).some((key) => !['version', 'text', 'rules'].includes(key)) ||
    !Array.isArray(value.rules) ||
    !value.rules.length ||
    value.rules.length > 10
  ) {
    throw new Error('Invalid Advanced Rules version or rule list.');
  }
  const rules: QueryRule[] = [];
  const ids = new Set<string>();
  for (const rule of value.rules) {
    if (
      !isRecord(rule) ||
      typeof rule.id !== 'string' ||
      !uuidPattern.test(rule.id) ||
      ids.has(rule.id.toLowerCase()) ||
      typeof rule.field !== 'string' ||
      rule.field === 'advanced_rules' ||
      typeof rule.operator !== 'string' ||
      Object.keys(rule).some(
        (key) => !['id', 'field', 'operator', 'value', 'value_to'].includes(key),
      ) ||
      ('value' in rule && !isValue(rule.value)) ||
      ('value_to' in rule &&
        typeof rule.value_to !== 'string' &&
        !(typeof rule.value_to === 'number' && Number.isFinite(rule.value_to)))
    ) {
      throw new Error('Invalid Advanced Rules leaf or duplicate rule ID.');
    }
    ids.add(rule.id.toLowerCase());
    rules.push({
      id: rule.id,
      field: rule.field,
      operator: rule.operator,
      ...('value' in rule ? { value: rule.value as QueryRule['value'] } : {}),
      ...('value_to' in rule ? { value_to: rule.value_to as string | number } : {}),
    });
  }
  return { version: 1, text: value.text, rules };
}

export function decodeAdvancedRules(filter: Filter): AdvancedRules {
  const advanced = readAdvancedRules(filter);
  if (
    !bindQueryExpression(
      advanced.text,
      advanced.rules.map(({ id }) => id),
    )
  ) {
    throw new Error('Advanced Rules expression is empty.');
  }
  return advanced;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValue(value: unknown): value is QueryRule['value'] {
  return (
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) &&
      value.length <= 500 &&
      value.every(
        (item) => typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)),
      ))
  );
}
