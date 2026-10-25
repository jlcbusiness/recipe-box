import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
  continueInstructionListOnEnter,
  createInstructionExtensions,
  getSafeInstructionHref,
  parseInstructionMarkdown,
} from '../../src/lib/recipes/instruction-markdown';

const ingredientId = '11111111-1111-4111-8111-111111111111';
const photoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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

  it('parses explicit temperature tokens and marked durations without guessing prose', () => {
    expect(
      parseInstructionMarkdown(
        'Set the oven to F!400 and cool for =10 minutes=. Leave for 10 minutes.',
      ),
    ).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', value: 'Set the oven to ' },
          { type: 'temperature', value: '400°F' },
          { type: 'text', value: ' and cool for ' },
          { type: 'duration', value: '10 minutes' },
          { type: 'text', value: '. Leave for 10 minutes.' },
        ],
      },
    ]);
  });

  it('converts marked temperatures to the requested display system', () => {
    expect(parseInstructionMarkdown('Preheat to F!400.', 'celsius')[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', value: 'Preheat to ' },
        { type: 'temperature', value: '205°C' },
        { type: 'text', value: '.' },
      ],
    });
    expect(parseInstructionMarkdown('Preheat to C!200.', 'fahrenheit')[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', value: 'Preheat to ' },
        { type: 'temperature', value: '390°F' },
        { type: 'text', value: '.' },
      ],
    });
    expect(parseInstructionMarkdown('Preheat to F!400.')).toEqual(
      parseInstructionMarkdown('Preheat to F!400.', 'fahrenheit'),
    );
  });

  it('rounds displayed numeric temperatures to the nearest five degrees', () => {
    expect(parseInstructionMarkdown('Set to F!402 or C!201.')[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', value: 'Set to ' },
        { type: 'temperature', value: '400°F' },
        { type: 'text', value: ' or ' },
        { type: 'temperature', value: '200°C' },
        { type: 'text', value: '.' },
      ],
    });
    expect(parseInstructionMarkdown('Set to F!402 or C!201.', 'celsius')[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', value: 'Set to ' },
        { type: 'temperature', value: '205°C' },
        { type: 'text', value: ' or ' },
        { type: 'temperature', value: '200°C' },
        { type: 'text', value: '.' },
      ],
    });
  });

  it('converts and rounds temperatures in instruction lists', () => {
    expect(parseInstructionMarkdown('- Heat to F!402.', 'celsius')).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [
          [
            { type: 'text', value: 'Heat to ' },
            { type: 'temperature', value: '205°C' },
            { type: 'text', value: '.' },
          ],
        ],
      },
    ]);
  });

  it('parses explicit unitless stove heat labels without matching ordinary exclamations', () => {
    expect(
      parseInstructionMarkdown('Reduce to !medium low! and stir. Stop! Be careful!')[0],
    ).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', value: 'Reduce to ' },
        { type: 'temperature', value: 'medium low' },
        { type: 'text', value: ' and stir. Stop! Be careful!' },
      ],
    });
    expect(parseInstructionMarkdown("until it's !medium high!!")[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', value: "until it's " },
        { type: 'temperature', value: 'medium high' },
        { type: 'text', value: '!' },
      ],
    });
  });

  it('converts marked temperatures in headings to the requested display system', () => {
    expect(parseInstructionMarkdown('# Bake at F!400', 'celsius')).toEqual([
      {
        type: 'heading',
        level: 1,
        content: [
          { type: 'text', value: 'Bake at ' },
          { type: 'temperature', value: '205°C' },
        ],
      },
    ]);
  });

  it('keeps escaped duration delimiters literal and supports stored legacy markers', () => {
    expect(parseInstructionMarkdown('Rest for \\=5 minutes= or [[duration:10 minutes]].')).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', value: 'Rest for \\=5 minutes= or ' },
          { type: 'duration', value: '10 minutes' },
          { type: 'text', value: '.' },
        ],
      },
    ]);
  });

  it('parses stable photo references as separate readable instruction tokens', () => {
    expect(parseInstructionMarkdown(`Turn the dough. [[photo:${photoId}]]`)).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', value: 'Turn the dough. ' },
          { type: 'photo', id: photoId },
        ],
      },
    ]);
    expect(parseInstructionMarkdown(`Turn the dough. [[photo:${photoId}]]-200`)[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', value: 'Turn the dough. ' },
        { type: 'photo', id: photoId, width: 200 },
      ],
    });
    expect(parseInstructionMarkdown(`Turn the dough. [[photo:${photoId}]]-left-w240`)[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', value: 'Turn the dough. ' },
        { type: 'photo', id: photoId, width: 240, alignment: 'left' },
      ],
    });
    expect(parseInstructionMarkdown(`Turn the dough. [[photo:${photoId}]]-w240-left`)[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', value: 'Turn the dough. ' },
        { type: 'photo', id: photoId, width: 240, alignment: 'left' },
      ],
    });
  });

  it('treats whitespace after a photo reference as a delimiter before following prose', () => {
    expect(parseInstructionMarkdown(`Sizzles. [[photo:${photoId}]] For two minutes.`)).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', value: 'Sizzles. ' },
          { type: 'photo', id: photoId },
          { type: 'text', value: 'For two minutes.' },
        ],
      },
    ]);
  });

  it('parses portion-qualified and legacy ingredient markers as readable mentions', () => {
    expect(
      parseInstructionMarkdown(
        `Add [[ingredient:${ingredientId}:1|cake-flour-1]] and [[ingredient:${ingredientId}|2|cake-flour-2]].`,
      ),
    ).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', value: 'Add ' },
          { type: 'mention', id: ingredientId, slug: 'cake-flour-1', portionOrdinal: 1 },
          { type: 'text', value: ' and ' },
          { type: 'mention', id: ingredientId, slug: 'cake-flour-2', portionOrdinal: 2 },
          { type: 'text', value: '.' },
        ],
      },
    ]);
  });

  it('parses unordered and ordered lists separated from preceding text by a single newline', () => {
    expect(
      parseInstructionMarkdown(
        `Prep the aromatics:\n- Mince [[ingredient:${ingredientId}|cake-flour]]\n* Add **salt**\n+ Whisk well\nThen finish:\n1. Simmer\n2. Serve`,
      ),
    ).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', value: 'Prep the aromatics:' }],
      },
      {
        type: 'list',
        ordered: false,
        items: [
          [
            { type: 'text', value: 'Mince ' },
            { type: 'mention', id: ingredientId, slug: 'cake-flour' },
          ],
          [
            { type: 'text', value: 'Add ' },
            { type: 'strong', value: 'salt' },
          ],
          [{ type: 'text', value: 'Whisk well' }],
        ],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', value: 'Then finish:' }],
      },
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', value: 'Simmer' }], [{ type: 'text', value: 'Serve' }]],
      },
    ]);
  });

  it('continues unordered and ordered list items on Enter and exits on an empty list marker', () => {
    const unorderedSource = 'Prep:\n- Mince garlic';
    expect(
      continueInstructionListOnEnter(
        unorderedSource,
        unorderedSource.length,
        unorderedSource.length,
      ),
    ).toEqual({
      markdown: 'Prep:\n- Mince garlic\n- ',
      caret: 'Prep:\n- Mince garlic\n- '.length,
    });

    const orderedSource = '1. First item';
    expect(
      continueInstructionListOnEnter(orderedSource, orderedSource.length, orderedSource.length),
    ).toEqual({
      markdown: '1. First item\n2. ',
      caret: '1. First item\n2. '.length,
    });

    const emptyMarkerSource = 'Prep:\n- Mince garlic\n- ';
    expect(
      continueInstructionListOnEnter(
        emptyMarkerSource,
        emptyMarkerSource.length,
        emptyMarkerSource.length,
      ),
    ).toEqual({
      markdown: 'Prep:\n- Mince garlic\n',
      caret: 'Prep:\n- Mince garlic\n'.length,
    });

    const plainParagraph = 'Stir gently for 5 minutes.';
    expect(
      continueInstructionListOnEnter(plainParagraph, plainParagraph.length, plainParagraph.length),
    ).toBeNull();
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

  it('preserves portion ordinals when round-tripping structured mentions', () => {
    const editor = new Editor({
      extensions: createInstructionExtensions({ displayMode: 'reader', ingredients }),
      content: `Add [[ingredient:${ingredientId}:2|old-flour-name]].`,
      contentType: 'markdown',
    });

    try {
      expect(editor.getMarkdown()).toContain(`[[ingredient:${ingredientId}:2|cake-flour]]`);
      expect(editor.getHTML()).toContain('Cake flour');
      expect(editor.getHTML()).not.toContain('[[ingredient:');
    } finally {
      editor.destroy();
    }
  });
});
