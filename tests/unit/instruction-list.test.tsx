import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { InstructionList } from '../../src/app/recipes/instruction-list';
import { parseInstructionMarkdown } from '../../src/lib/recipes/instruction-markdown';

afterEach(cleanup);

describe('shared instruction list rendering', () => {
  it('renders mixed nesting and repeated siblings as semantic list items', () => {
    const [list] = parseInstructionMarkdown(
      '- Repeat\n- Repeat\n  1. Ordered child\n    - Detail\n- Last',
    );
    if (list.type !== 'list') throw new Error('Expected a parsed list.');
    const { container } = render(
      <InstructionList
        list={list}
        prefix="step"
        renderInline={(tokens) =>
          tokens.map((token) => (token.type === 'text' ? token.value : '')).join('')
        }
      />,
    );
    expect(container.querySelectorAll(':scope > ul > li')).toHaveLength(3);
    expect(container.querySelector('ul > li > ol > li > ul > li')?.textContent).toBe('Detail');
    expect(container.querySelectorAll(':scope > ul > li')[2].textContent).toBe('Last');
  });

  it('retains photo clearing on nested photo-bearing items', () => {
    const [list] = parseInstructionMarkdown(
      '- Parent\n  - [[photo:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]]-w800',
    );
    if (list.type !== 'list') throw new Error('Expected a parsed list.');
    const { container } = render(
      <InstructionList list={list} prefix="step" renderInline={() => 'Photo'} />,
    );
    expect(container.querySelector('ul > li > ul > li')?.className).toBe(
      'recipe-instruction-with-photo',
    );
    expect(container.querySelector(':scope > ul > li')?.className).toBe('');
  });
});
