import { describe, expect, it, vi } from 'vitest';
import { explorerColumnDefinitions } from '../../src/lib/explorer-state';
import {
  parsePublicationSearchFilters,
  searchPublications,
} from '../../src/lib/publications/search';
import type { RecipeSupabaseClient } from '../../src/lib/recipes/data';
import {
  getRecipeSearchSortOptions,
  parseRecipeSearchColumnFilters,
  parseRecipeSearchFilters,
  searchRecipes,
} from '../../src/lib/recipes/search';

function createSupabase(data: unknown = [], error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { client: { rpc } as unknown as RecipeSupabaseClient, rpc };
}

describe('recipe search URL contract', () => {
  it('offers only visible recipe display columns as sort options', () => {
    const visibleSearchColumns = explorerColumnDefinitions['recipes-find'].filter(
      ({ defaultVisible, required }) => required || defaultVisible,
    );
    const visiblePublicationColumns = explorerColumnDefinitions['publication-recipes'].filter(
      ({ defaultVisible, required }) => required || defaultVisible,
    );
    const searchOptions = getRecipeSearchSortOptions(visibleSearchColumns, true);
    const publicationOptions = getRecipeSearchSortOptions(visiblePublicationColumns);

    expect(searchOptions.map(({ value }) => value)).toEqual([
      'relevance',
      ...visibleSearchColumns.map(({ key }) => key),
    ]);
    expect(publicationOptions.map(({ value }) => value)).toEqual(
      visiblePublicationColumns.map(({ key }) => key),
    );
    expect(searchOptions.some(({ value }) => value === 'opinion')).toBe(false);
  });

  it('ignores malformed filters and limits repeated filter values to ten', () => {
    const filters = Array.from({ length: 12 }, (_, index) =>
      JSON.stringify({ field: `field-${index}`, operator: 'contains', value: 'x' }),
    );

    expect(parseRecipeSearchFilters(['not json', JSON.stringify(null), ...filters])).toEqual(
      filters.slice(0, 8).map((filter) => JSON.parse(filter)),
    );
  });

  it('maps column selection sentinels and typed values to filter rules', () => {
    expect(
      parseRecipeSearchColumnFilters({
        column_name: '__all__',
        column_state: '__none__',
        column_meal_type: ['meal-a', 'meal-b'],
        column_total_time_minutes: ['__blank__', '20'],
      }),
    ).toEqual({
      filters: [
        { field: 'state', operator: 'in', value: [] },
        { field: 'total_time_minutes', operator: 'in', value: ['__blank__', 20] },
        { field: 'meal_type', operator: 'contains_any', value: ['meal-a', 'meal-b'] },
      ],
      selections: {
        state: [],
        meal_type: ['meal-a', 'meal-b'],
        total_time_minutes: ['__blank__', '20'],
      },
    });
  });

  it('keeps Page, URL, and Citation column selections independent', () => {
    expect(
      parseRecipeSearchColumnFilters({
        column_publication_page: ['142-145'],
        column_recipe_url: ['https://recipes.example.test/soup'],
        column_citation: ['The Home Cook'],
      }),
    ).toEqual({
      filters: [
        { field: 'publication_page', operator: 'in', value: ['142-145'] },
        { field: 'recipe_url', operator: 'in', value: ['https://recipes.example.test/soup'] },
        { field: 'citation', operator: 'in', value: ['The Home Cook'] },
      ],
      selections: {
        publication_page: ['142-145'],
        recipe_url: ['https://recipes.example.test/soup'],
        citation: ['The Home Cook'],
      },
    });
  });

  it('normalizes the query and forwards bounded search options to the RPC', async () => {
    const { client, rpc } = createSupabase();

    await searchRecipes(client, '  saffron\n rice  ', {
      filters: [{ field: 'name', operator: 'contains', value: 'saffron' }],
      sortKey: 'name',
      sortDirection: 'desc',
      limit: 12,
      offset: 24,
      publicationId: 'publication-id',
    });

    expect(rpc).toHaveBeenCalledWith('search_recipes', {
      p_query: 'saffron rice',
      p_limit: 12,
      p_offset: 24,
      p_filters: [{ field: 'name', operator: 'contains', value: 'saffron' }],
      p_sort_key: 'name',
      p_sort_direction: 'desc',
      p_publication_id: 'publication-id',
    });
  });

  it('throws a stable error when the search RPC fails', async () => {
    const { client } = createSupabase(null, { message: 'database details' });

    await expect(searchRecipes(client, '', {})).rejects.toThrow('Unable to search recipes.');
  });
});

describe('publication search URL contract', () => {
  it('ignores malformed filters and limits repeated filter values to ten', () => {
    const filters = Array.from({ length: 12 }, (_, index) =>
      JSON.stringify({ field: `field-${index}`, operator: 'contains', value: 'x' }),
    );

    expect(parsePublicationSearchFilters(['not json', ...filters])).toEqual(
      filters.slice(0, 9).map((filter) => JSON.parse(filter)),
    );
  });

  it('normalizes the query and forwards publication options to the RPC', async () => {
    const { client, rpc } = createSupabase();

    await searchPublications(client, '  food\n magazine  ', {
      filters: [{ field: 'publication_type', operator: 'in', value: ['book'] }],
      publicationType: 'book',
      sortKey: 'author',
      sortDirection: 'desc',
      limit: 12,
      offset: 24,
    });

    expect(rpc).toHaveBeenCalledWith('search_publications', {
      p_query: 'food magazine',
      p_limit: 12,
      p_offset: 24,
      p_filters: [{ field: 'publication_type', operator: 'in', value: ['book'] }],
      p_sort_key: 'author',
      p_sort_direction: 'desc',
      p_publication_type: 'book',
    });
  });

  it('throws a stable error when the search RPC fails', async () => {
    const { client } = createSupabase(null, { message: 'database details' });

    await expect(searchPublications(client, '', {})).rejects.toThrow(
      'Unable to search publications.',
    );
  });
});
