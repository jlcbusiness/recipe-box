import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderAdminUpdateMarkdown } from '../../src/lib/admin-updates/markdown';

function render(markdown: string) {
  return renderToStaticMarkup(createElement(Fragment, null, renderAdminUpdateMarkdown(markdown)));
}

describe('admin update Markdown', () => {
  it('renders common Markdown blocks and preserves nested list structure', () => {
    const html = render(
      '## Fix\n\nUse **care** and [the guide](https://example.test).\n\n- Main\n  - Nested',
    );

    expect(html).toContain('<h2>Fix</h2>');
    expect(html).toContain('<strong>care</strong>');
    expect(html).toContain('<a href="https://example.test">the guide</a>');
    expect(html).toContain('<ul><li>Main<ul><li>Nested</li>');
  });

  it('escapes raw HTML, rejects unsafe link schemes, and never renders images', () => {
    const html = render(
      '<img src=x onerror=alert(1)>\n\n[bad](javascript:alert%281%29) ![photo](https://example.test/photo.png)',
    );

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/<[^>]*\sonerror=/u);
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('src="https://example.test/photo.png"');
  });

  it('allows safe relative and HTTPS links only', () => {
    const html = render(
      '[relative](/admin)\n\n[secure](https://example.test)\n\n[protocol relative](//example.test)',
    );

    expect(html).toContain('<a href="/admin">relative</a>');
    expect(html).toContain('<a href="https://example.test">secure</a>');
    expect(html).not.toContain('href="//example.test"');
  });
});
