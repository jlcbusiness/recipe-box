import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PrepAheadCallout } from '../../src/app/recipes/prep-ahead-callout';

describe('Prep ahead callout', () => {
  it('renders safe Markdown, ingredient references, and duration emphasis', () => {
    const markup = renderToStaticMarkup(
      <PrepAheadCallout
        markdown={[
          'Thaw **overnight**.',
          '',
          '## Before cooking',
          '- Drain and rinse.',
          '- Read [the guide](https://example.test/guide).',
          '',
          '<script>alert(1)</script>',
          '[unsafe](javascript:alert(1))',
          '[[ingredient:11111111-1111-4111-8111-111111111111|salt]]',
          'Rest for =10 minutes=.',
          'Set F!400.',
          '[[photo:22222222-2222-4222-8222-222222222222]]',
        ].join('\n')}
      />,
    );

    expect(markup).toContain('<h3>Pre-recipe Prep</h3>');
    expect(markup).toContain('<strong>overnight</strong>');
    expect(markup).toContain('<ul>');
    expect(markup).toContain('href="https://example.test/guide"');
    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markup).not.toContain('href="javascript:');
    expect(markup).toContain('#salt');
    expect(markup).toContain('class="recipe-instruction-duration"');
    expect(markup).toContain('10 minutes');
    expect(markup).toContain('Set F!400.');
    expect(markup).toContain('[[photo:22222222-2222-4222-8222-222222222222]]');
    expect(markup).not.toContain('<img');
  });

  it('renders nothing for empty Markdown', () => {
    expect(renderToStaticMarkup(<PrepAheadCallout markdown={' \n '} />)).toBe('');
  });
});
