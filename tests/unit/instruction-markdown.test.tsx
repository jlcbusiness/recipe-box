import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
  createInstructionExtensions,
  getSafeInstructionHref,
  parseInstructionMarkdown,
} from '../../src/lib/recipes/instruction-markdown';

const ingredientId = '11111111-1111-4111-8111-111111111111';
const ingredients = [{ id: ingredientId, name: 'Cake flour' }];

describe('instruction Markdown', () => {
  it('allows safe instruction links and rejects executable URL schemes', () => {
    expect(getSafeInstructionHref('https://example.test/guide')).toBe('https://example.test/guide');
    expect(getSafeInstructionHref('mailto:chef@example.test')).toBe('mailto:chef@example.test');
    expect(getSafeInstructionHref('/recipes/guide')).toBe('/recipes/guide');
    expect(getSafeInstructionHref('example.test/guide')).toBe('https://example.test/guide');
    expect(getSafeInstructionHref('javascript:alert(1)')).toBeNull();
    expect(getSafeInstructionHref('//example.test/guide')).toBeNull();
  });

  it('parses headings, paragraphs, lists, emphasis, links, and linked ingredient tokens', () => {
    expect(
      parseInstructionMarkdown(
        `## Prepare\n\nStir **gently** with *care* and [the guide](https://example.test) and [[ingredient:${ingredientId}|cake-flour]].\n\n- Sift flour\n- Add \`water\`\n\n1. Mix\n2. Bake`,
      ),
    ).toEqual([
      { type: 'heading', level: 2, content: [{ type: 'text', value: 'Prepare' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', value: 'Stir ' },
          { type: 'strong', value: 'gently' },
          { type: 'text', value: ' with ' },
          { type: 'emphasis', value: 'care' },
          { type: 'text', value: ' and ' },
          { type: 'link', label: 'the guide', url: 'https://example.test' },
          { type: 'text', value: ' and ' },
          { type: 'mention', id: ingredientId, slug: 'cake-flour' },
          { type: 'text', value: '.' },
        ],
      },
      {
        type: 'list',
        ordered: false,
        items: [
          [{ type: 'text', value: 'Sift flour' }],
          [
            { type: 'text', value: 'Add ' },
            { type: 'code', value: 'water' },
          ],
        ],
      },
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', value: 'Mix' }], [{ type: 'text', value: 'Bake' }]],
      },
    ]);
  });

  it('round-trips structured mentions with the current ingredient label', () => {
    const editor = new Editor({
      extensions: createInstructionExtensions({ displayMode: 'editor', ingredients }),
      content: `Stir [[ingredient:${ingredientId}|old-flour-name]] with **warm water**.`,
      contentType: 'markdown',
    });

    try {
      expect(editor.getMarkdown()).toContain(`[[ingredient:${ingredientId}|cake-flour]]`);
      expect(editor.getText()).toBe('Stir #cake-flour with warm water.');
      expect(editor.getHTML()).toContain('#cake-flour');
      expect(editor.getHTML()).toContain('<strong>warm water</strong>');
      expect(editor.getHTML()).not.toContain('old-flour-name');
    } finally {
      editor.destroy();
    }
  });

  it('renders the current ingredient name without editor marker syntax in recipe view', () => {
    const editor = new Editor({
      extensions: createInstructionExtensions({ displayMode: 'reader', ingredients }),
      content: `Add [[ingredient:${ingredientId}|flour]] and stir.`,
      contentType: 'markdown',
    });

    try {
      expect(editor.getHTML()).toContain('Cake flour');
      expect(editor.getHTML()).not.toContain('#cake-flour');
      expect(editor.getHTML()).not.toContain('[[ingredient:');
    } finally {
      editor.destroy();
    }
  });
});
