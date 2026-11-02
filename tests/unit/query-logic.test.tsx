import { describe, expect, it } from 'vitest';
import { createExplorerState, getQueryAutoSelectColumns } from '../../src/lib/explorer-state';
import {
  bindQueryExpression,
  DeletedRuleReferenceError,
  decodeAdvancedRules,
  encodeAdvancedRules,
  renumberQueryExpression,
} from '../../src/lib/query-logic';

const ids = [1, 2, 3, 4].map(
  (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
);
const rules = ids.map((id, index) => ({
  id,
  field: 'name',
  operator: 'contains',
  value: String(index + 1),
}));

describe('Advanced Rules grammar', () => {
  it.each([
    ['AND', '&&', '&', '-and'],
    ['OR', '||', '|', '-or'],
  ])('accepts each binary alias %s', (...aliases) => {
    for (const alias of aliases) {
      expect(bindQueryExpression(`1 ${alias.toLowerCase()} 2`, ids.slice(0, 2))).not.toBeNull();
    }
  });

  it.each(['NOT', 'not', '!', '-not'])('accepts unary %s', (alias) => {
    const bound = bindQueryExpression(`${alias} 1`, ids.slice(0, 1));
    expect(bound?.tree).toEqual({ op: 'not', child: { id: ids[0] } });
  });

  it('parses precedence and parentheses without changing entered text', () => {
    const text = ' (1 aNd 2) OR (3 || !4) ';
    const bound = bindQueryExpression(text, ids);
    expect(bound?.text).toBe(text);
    expect(bound?.tree).toEqual({
      op: 'or',
      left: { op: 'and', left: { id: ids[0] }, right: { id: ids[1] } },
      right: { op: 'or', left: { id: ids[2] }, right: { op: 'not', child: { id: ids[3] } } },
    });
    expect(bindQueryExpression('1 OR 2 AND NOT 3', ids.slice(0, 3))?.tree).toEqual({
      op: 'or',
      left: { id: ids[0] },
      right: { op: 'and', left: { id: ids[1] }, right: { op: 'not', child: { id: ids[2] } } },
    });
  });

  it('lists every unused rule', () => {
    expect(() => bindQueryExpression('1', ids)).toThrow('Unused rules: 2, 3, 4');
  });

  it('preserves sparse rule numbers and reports deleted references without retargeting', () => {
    const slots = [ids[0], null, ids[2]];
    const bound = bindQueryExpression('1 OR 3', slots);
    expect(bound?.references.map(({ id, number }) => ({ id, number }))).toEqual([
      { id: ids[0], number: 1 },
      { id: ids[2], number: 3 },
    ]);
    expect(() => bindQueryExpression('1 OR 2 OR 3', slots)).toThrow(
      'Remove or replace the deleted rule.',
    );
    expect(() => bindQueryExpression('1', slots)).toThrow('Unused rules: 3');
    expect(() => bindQueryExpression('1 OR 4', slots)).toThrow('Rule 4 does not exist.');
  });

  it('identifies every deleted rule number for inline highlighting', () => {
    const text = '1 OR 2 OR NOT 3 OR 2';
    let failure: unknown;
    try {
      bindQueryExpression(text, [ids[0], null, ids[2]]);
    } catch (caught) {
      failure = caught;
    }

    expect(failure).toBeInstanceOf(DeletedRuleReferenceError);
    if (!(failure instanceof DeletedRuleReferenceError))
      throw new Error('Expected deleted rule error.');
    expect(failure.references.map(({ start, end }) => text.slice(start, end))).toEqual(['2', '2']);
  });

  it.each(['0', '5', '1 2', '1 XOR 2', '(1 AND 2', '1 OR', '1; alert(2)', '1.2', '01'])(
    'rejects invalid expression %s explicitly',
    (text) => expect(() => bindQueryExpression(text, ids.slice(0, 2))).toThrow(),
  );

  it('allows repeats and empty logic', () => {
    expect(bindQueryExpression('1 OR NOT 1', ids.slice(0, 1))?.references).toHaveLength(2);
    expect(bindQueryExpression(' \t ', ids)).toBeNull();
  });

  it('enforces exact character, token, nesting and rule boundaries', () => {
    expect(bindQueryExpression(`1${' '.repeat(1023)}`, ids.slice(0, 1))).not.toBeNull();
    expect(() => bindQueryExpression(`1${' '.repeat(1024)}`, ids.slice(0, 1))).toThrow('1,024');
    expect(
      bindQueryExpression(`${'('.repeat(16)}1${')'.repeat(16)}`, ids.slice(0, 1)),
    ).not.toBeNull();
    expect(() =>
      bindQueryExpression(`${'('.repeat(17)}1${')'.repeat(17)}`, ids.slice(0, 1)),
    ).toThrow('16');
    expect(bindQueryExpression(`${'!'.repeat(255)}1`, ids.slice(0, 1))).not.toBeNull();
    expect(() => bindQueryExpression(`${'!'.repeat(256)}1`, ids.slice(0, 1))).toThrow('256');
    expect(() =>
      bindQueryExpression(
        '1',
        Array.from({ length: 11 }, (_, i) => `${i}`),
      ),
    ).toThrow('10');
    const sparseSlots = Array.from({ length: 11 }, (_, index) =>
      index === 1 ? null : `rule-${index}`,
    );
    const activeNumbers = sparseSlots.flatMap((id, index) => (id ? [index + 1] : []));
    expect(bindQueryExpression(activeNumbers.join(' OR '), sparseSlots)).not.toBeNull();
  });

  it('renumbers references by identity and exposes deleted IDs without retargeting', () => {
    const bound = bindQueryExpression('1 && (2 OR !3)', ids.slice(0, 3));
    if (!bound) throw new Error('Expected bound expression');
    const updated = renumberQueryExpression(bound, [ids[0], ids[2]]);
    expect(updated.text).toBe('1 && ([deleted rule 2] OR !2)');
    expect(updated.references[1].id).toBe(ids[1]);
    expect(updated.references[2].id).toBe(ids[2]);
    expect(renumberQueryExpression(updated, [ids[0], ids[2], ids[3]]).text).toContain(
      '[deleted rule 2]',
    );
  });

  it('round-trips a versioned envelope without auto-selecting required columns', () => {
    const filter = encodeAdvancedRules('1 OR NOT 2', rules.slice(0, 2));
    expect(decodeAdvancedRules(filter)).toEqual({
      version: 1,
      text: '1 OR NOT 2',
      rules: rules.slice(0, 2),
    });
    expect(
      getQueryAutoSelectColumns(
        [filter],
        [
          {
            key: 'name',
            label: 'Name',
            defaultVisible: true,
            required: true,
            minWidth: 1,
            maxWidth: 100,
          },
        ],
      ),
    ).toEqual([]);
    const state = {
      schema_version: 1,
      filters: [filter],
      sort: 'name',
      direction: 'asc',
      view: 'list',
    };
    expect(createExplorerState('recipes-find', state)?.filters).toEqual([filter]);
    expect(createExplorerState('publications', state)).toBeNull();
  });

  it('rejects mismatched, oversized, nested and duplicate-ID envelopes', () => {
    const valid = encodeAdvancedRules('1', rules.slice(0, 1));
    for (const value of [
      '{}',
      JSON.stringify({ version: 2, text: '1', rules: rules.slice(0, 1) }),
      JSON.stringify({ version: 1, text: '1 OR 2', rules: [rules[0], rules[0]] }),
      JSON.stringify({ version: 1, text: '1', rules: [{ ...rules[0], field: 'advanced_rules' }] }),
    ]) {
      expect(() => decodeAdvancedRules({ ...valid, value })).toThrow();
    }
  });

  it('enforces the exact UTF-8 payload boundary for non-ASCII values', () => {
    const filter = encodeAdvancedRules('1', [{ ...rules[0], value: '\u{1f345}' }]);
    const value = `${filter.value}${' '.repeat(65536 - new TextEncoder().encode(String(filter.value)).byteLength)}`;
    expect(decodeAdvancedRules({ ...filter, value }).rules[0].value).toBe('\u{1f345}');
    expect(() => decodeAdvancedRules({ ...filter, value: `${value} ` })).toThrow(
      '65,536 UTF-8 bytes',
    );
  });
});
