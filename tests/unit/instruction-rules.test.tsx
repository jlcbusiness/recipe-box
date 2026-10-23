import { describe, expect, it } from 'vitest';
import {
  buildIngredientMentionOptions,
  getInstructionEditorValue,
  ingredientMentionMarker,
  ingredientSlug,
  instructionPlainText,
  parseIngredientMentions,
  replaceInstructionEditorRange,
  resolveInstructionMentions,
  serializeInstructionSteps,
  unlinkIngredientMentions,
  updateInstructionMarkdownFromEditor,
} from '../../src/lib/recipes/instruction-rules';

const flourId = '11111111-1111-4111-8111-111111111111';
const eggId = '22222222-2222-4222-8222-222222222222';

describe('instruction mention rules', () => {
  it('creates stable hyphenated slugs from ingredient names', () => {
    expect(ingredientSlug('  All-purpose flour! ')).toBe('all-purpose-flour');
    expect(ingredientSlug('Crème fraîche')).toBe('creme-fraiche');
  });

  it('shows mentions as readable editor text while preserving structured markers', () => {
    const flourMention = `[[ingredient:${flourId}|all-purpose-flour]]`;
    const eggPortionMention = `[[ingredient:${eggId}:2|eggs-sauce-2]]`;
    expect(getInstructionEditorValue(`Add ${flourMention} and ${eggPortionMention}.`)).toBe(
      'Add #all-purpose-flour and #eggs-sauce-2.',
    );
    expect(
      updateInstructionMarkdownFromEditor(`Add ${flourMention}.`, 'Add #all-purpose-flour gently.'),
    ).toBe(`Add ${flourMention} gently.`);
    expect(updateInstructionMarkdownFromEditor(`Add ${flourMention}.`, 'Add flour.')).toBe(
      'Add flour.',
    );
    expect(updateInstructionMarkdownFromEditor('', 'A literal #flour stays plain.')).toBe(
      'A literal #flour stays plain.',
    );
  });

  it('normalizes legacy portion markers when editing readable mention text', () => {
    const legacyMention = `[[ingredient:${flourId}|1|flour-main-1]]`;
    expect(getInstructionEditorValue(`Use ${legacyMention}.`)).toBe('Use #flour-main-1.');
    expect(
      updateInstructionMarkdownFromEditor(`Use ${legacyMention}.`, 'Stir #flour-main-1.'),
    ).toBe(`Stir [[ingredient:${flourId}:1|flour-main-1]].`);
  });

  it('replaces a visible suggestion range without shifting existing mention markers', () => {
    const flourMention = `[[ingredient:${flourId}|flour]]`;
    const source = `Add ${flourMention} and #egg`;
    const editorValue = getInstructionEditorValue(source);
    const start = editorValue.indexOf('#egg');
    expect(
      replaceInstructionEditorRange(
        source,
        start,
        editorValue.length,
        `[[ingredient:${eggId}|egg]]`,
      ),
    ).toBe(`Add ${flourMention} and [[ingredient:${eggId}|egg]]`);
  });

  it('labels mention options with only the set and portion detail needed to distinguish them', () => {
    const options = buildIngredientMentionOptions([
      {
        id: '33333333-3333-4333-8333-333333333333',
        ingredientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'Carrot',
        setId: 'main-set',
        setLabel: 'Main',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        ingredientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        name: 'Salt',
        setId: 'sauce-set',
        setLabel: 'Sauce',
        portionAmounts: ['1 tsp', '1/2 tsp'],
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        ingredientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        name: 'Sugar',
        setId: 'main-set',
        setLabel: 'Main',
        portionAmounts: ['1 cup', '1 cup'],
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        ingredientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        name: 'Sugar',
        setId: 'sauce-set',
        setLabel: 'Sauce',
        portionAmounts: ['1 tbsp', '3 tbsp'],
      },
    ]);

    expect(
      options.map(({ label, recipeIngredientId, portionOrdinal, slug }) => ({
        label,
        recipeIngredientId,
        portionOrdinal,
        slug,
      })),
    ).toEqual([
      {
        label: 'Carrot',
        recipeIngredientId: '33333333-3333-4333-8333-333333333333',
        portionOrdinal: null,
        slug: 'carrot-main',
      },
      {
        label: 'Salt (1 tsp)',
        recipeIngredientId: '44444444-4444-4444-8444-444444444444',
        portionOrdinal: 1,
        slug: 'salt-sauce-1',
      },
      {
        label: 'Salt (1/2 tsp)',
        recipeIngredientId: '44444444-4444-4444-8444-444444444444',
        portionOrdinal: 2,
        slug: 'salt-sauce-2',
      },
      {
        label: 'Sugar (Main) (1st 1 cup)',
        recipeIngredientId: '55555555-5555-4555-8555-555555555555',
        portionOrdinal: 1,
        slug: 'sugar-main-1',
      },
      {
        label: 'Sugar (Main) (2nd 1 cup)',
        recipeIngredientId: '55555555-5555-4555-8555-555555555555',
        portionOrdinal: 2,
        slug: 'sugar-main-2',
      },
      {
        label: 'Sugar (Sauce) (1 tbsp)',
        recipeIngredientId: '66666666-6666-4666-8666-666666666666',
        portionOrdinal: 1,
        slug: 'sugar-sauce-1',
      },
      {
        label: 'Sugar (Sauce) (3 tbsp)',
        recipeIngredientId: '66666666-6666-4666-8666-666666666666',
        portionOrdinal: 2,
        slug: 'sugar-sauce-2',
      },
    ]);
  });

  it('projects Markdown and confirmed markers to readable search text', () => {
    expect(
      instructionPlainText(
        `## Prepare\n\n- Stir **gently** with [[ingredient:${flourId}|old-flour]].`,
      ),
    ).toBe('Prepare Stir gently with #old-flour.');
  });

  it('extracts only confirmed markers in their occurrence order', () => {
    expect(
      parseIngredientMentions(
        `Add [[ingredient:${flourId}|all-purpose-flour]], then [[ingredient:${eggId}|eggs]]. #salt stays literal.`,
      ),
    ).toEqual([
      { recipeIngredientId: flourId, slug: 'all-purpose-flour', portionOrdinal: null },
      { recipeIngredientId: eggId, slug: 'eggs', portionOrdinal: null },
    ]);
    expect(parseIngredientMentions('Literal #all-purpose-flour stays plain.')).toEqual([]);
  });

  it('parses stable portion ordinals and serializes whole-row compatibility markers', () => {
    expect(
      parseIngredientMentions(
        `Use [[ingredient:${flourId}:1|flour-main-1]] and [[ingredient:${eggId}:2|eggs-sauce-2]].`,
      ),
    ).toEqual([
      { recipeIngredientId: flourId, slug: 'flour-main-1', portionOrdinal: 1 },
      { recipeIngredientId: eggId, slug: 'eggs-sauce-2', portionOrdinal: 2 },
    ]);
    expect(
      ingredientMentionMarker({
        recipeIngredientId: flourId,
        portionOrdinal: 2,
        slug: 'sugar-main-2',
      }),
    ).toBe(`[[ingredient:${flourId}:2|sugar-main-2]]`);
    expect(
      ingredientMentionMarker({
        recipeIngredientId: flourId,
        portionOrdinal: null,
        slug: 'flour-main',
      }),
    ).toBe(`[[ingredient:${flourId}|flour-main]]`);
  });

  it('rejects malformed structured markers', () => {
    expect(() => parseIngredientMentions('[[ingredient:not-a-uuid|flour]]')).toThrow(
      'Instruction contains an invalid ingredient mention.',
    );
    expect(() => parseIngredientMentions(`[[ingredient:${flourId}:3|flour-main-3]]`)).toThrow(
      'Instruction contains an invalid ingredient mention.',
    );
  });

  it('resolves display labels from current ingredient rows instead of stale slugs', () => {
    expect(
      resolveInstructionMentions(`Use [[ingredient:${flourId}|old-flour-name]].`, [
        { id: flourId, name: 'Cake flour' },
      ]),
    ).toBe('Use Cake flour.');
  });

  it('unlinks every occurrence as readable plain text when an ingredient is removed', () => {
    expect(
      unlinkIngredientMentions(
        `Add [[ingredient:${flourId}|flour]] and reserve [[ingredient:${flourId}|flour]].`,
        flourId,
        'All-purpose flour',
      ),
    ).toBe('Add #all-purpose-flour and reserve #all-purpose-flour.');
  });

  it('serializes non-empty steps in order and validates every mentioned row', () => {
    expect(
      serializeInstructionSteps(
        [
          {
            id: 'step-1',
            markdown: `First [[ingredient:${flourId}|flour]].`,
            plainText: 'First #flour.',
          },
          { id: 'step-empty', markdown: '  ', plainText: '' },
          { id: 'step-2', markdown: 'Then mix.', plainText: 'Then mix.' },
        ],
        [flourId],
      ),
    ).toEqual([
      {
        id: 'step-1',
        position: 0,
        content_markdown: `First [[ingredient:${flourId}|flour]].`,
        plain_text: 'First #flour.',
      },
      {
        id: 'step-2',
        position: 1,
        content_markdown: 'Then mix.',
        plain_text: 'Then mix.',
      },
    ]);
  });

  it('rejects duplicate step IDs and mention targets outside the recipe', () => {
    expect(() =>
      serializeInstructionSteps(
        [
          { id: 'step-1', markdown: 'First.', plainText: 'First.' },
          { id: 'step-1', markdown: 'Second.', plainText: 'Second.' },
        ],
        [],
      ),
    ).toThrow('Instruction step IDs must be unique.');
    expect(() =>
      serializeInstructionSteps(
        [
          {
            id: 'step-1',
            markdown: `Use [[ingredient:${eggId}|eggs]].`,
            plainText: 'Use #eggs.',
          },
        ],
        [flourId],
      ),
    ).toThrow('Instruction mentions must reference an ingredient row in this recipe.');
  });
});
