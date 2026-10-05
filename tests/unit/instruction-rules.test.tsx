import { describe, expect, it } from 'vitest';
import {
  ingredientSlug,
  instructionPlainText,
  parseIngredientMentions,
  resolveInstructionMentions,
  serializeInstructionSteps,
  unlinkIngredientMentions,
} from '../../src/lib/recipes/instruction-rules';

const flourId = '11111111-1111-4111-8111-111111111111';
const eggId = '22222222-2222-4222-8222-222222222222';

describe('instruction mention rules', () => {
  it('creates stable hyphenated slugs from ingredient names', () => {
    expect(ingredientSlug('  All-purpose flour! ')).toBe('all-purpose-flour');
    expect(ingredientSlug('Crème fraîche')).toBe('creme-fraiche');
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
      { recipeIngredientId: flourId, slug: 'all-purpose-flour' },
      { recipeIngredientId: eggId, slug: 'eggs' },
    ]);
    expect(parseIngredientMentions('Literal #all-purpose-flour stays plain.')).toEqual([]);
  });

  it('rejects malformed structured markers', () => {
    expect(() => parseIngredientMentions('[[ingredient:not-a-uuid|flour]]')).toThrow(
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
