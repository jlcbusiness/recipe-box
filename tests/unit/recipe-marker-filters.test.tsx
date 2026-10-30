import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecipeMarkerFilters } from '../../src/app/recipes/recipe-marker-filters';

describe('recipe marker filters', () => {
  it('preserves existing search state and filters while toggling one marker', () => {
    render(
      <RecipeMarkerFilters
        action="/recipes/find"
        columnSelections={{ name: ['Lemon cake'] }}
        direction="desc"
        filters={[
          { field: 'score', operator: 'greater_than', value: 2 },
          { field: 'starred', operator: 'is', value: ['true'] },
        ]}
        query="lemon"
        sort="score"
        tab="query"
        view="details"
      />,
    );

    const starButton = screen.getByRole('button', { name: 'Filter recipes by Star' });
    const heartButton = screen.getByRole('button', { name: 'Filter recipes by Heart' });
    expect(starButton.getAttribute('aria-pressed')).toBe('true');
    expect(heartButton.getAttribute('aria-pressed')).toBe('false');
    expect(starButton.querySelector('svg[data-marker="star"]')).not.toBeNull();
    expect(heartButton.querySelector('svg[data-marker="heart"]')).not.toBeNull();
    expect(starButton.querySelector('svg')?.getAttribute('width')).toBe('19');
    expect(heartButton.querySelector('svg')?.getAttribute('width')).toBe('19');

    const starForm = starButton.closest('form');
    const heartForm = heartButton.closest('form');
    if (!(starForm instanceof HTMLFormElement) || !(heartForm instanceof HTMLFormElement)) {
      throw new Error('Each marker filter should be a GET form.');
    }

    const starFilters = Array.from(
      starForm.querySelectorAll<HTMLInputElement>('input[name="filter"]'),
    ).map(({ value }) => JSON.parse(value));
    expect(starFilters).toEqual([{ field: 'score', operator: 'greater_than', value: 2 }]);

    expect(
      Array.from(heartForm.querySelectorAll<HTMLInputElement>('input[name="filter"]')).map(
        ({ value }) => JSON.parse(value),
      ),
    ).toEqual([
      { field: 'score', operator: 'greater_than', value: 2 },
      { field: 'starred', operator: 'is', value: ['true'] },
      { field: 'hearted', operator: 'is', value: ['true'] },
    ]);
    expect(starForm.querySelector<HTMLInputElement>('input[name="q"]')?.value).toBe('lemon');
    expect(starForm.querySelector<HTMLInputElement>('input[name="tab"]')?.value).toBe('query');
    expect(starForm.querySelector<HTMLInputElement>('input[name="sort"]')?.value).toBe('score');
    expect(starForm.querySelector<HTMLInputElement>('input[name="column_name"]')?.value).toBe(
      'Lemon cake',
    );
  });
});
