import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RecipeColumnFilter } from '../../src/app/recipes/find/recipe-column-filter';
import type { RecipeSearchFilter } from '../../src/lib/recipes/search';

afterEach(cleanup);

describe('recipe column comparison filters', () => {
  it('keeps the popover open for its portaled picklist and preserves unrelated filters', () => {
    const queryFilter: RecipeSearchFilter = {
      field: 'made_count',
      operator: 'equals',
      value: 1,
    };
    const { container } = render(
      <RecipeColumnFilter
        action="/recipes/find"
        baseFilters={[queryFilter]}
        baseQuery=""
        columnSelections={{}}
        comparisonKind="number"
        direction="asc"
        field="made_count"
        fieldLabel="Made"
        options={[]}
        sort="name"
        view="details"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Filter Made' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Made comparison' }));
    const atLeastOption = screen.getByRole('option', { name: 'At least' });
    fireEvent.pointerDown(atLeastOption, { pointerId: 1 });
    fireEvent.click(atLeastOption);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Made value' }), {
      target: { value: '2' },
    });

    expect(screen.getByRole('button', { name: 'Filter Made' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    const filters = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[name="filter"]'),
    ).map((input) => JSON.parse(input.value) as RecipeSearchFilter);
    expect(filters).toEqual([
      queryFilter,
      {
        field: 'column_made_count',
        operator: 'at_least',
        value: 2,
      },
    ]);
  });
});
