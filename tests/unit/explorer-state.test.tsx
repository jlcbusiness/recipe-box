import { describe, expect, it } from 'vitest';
import {
  createExplorerState,
  defaultExplorerDisplayPreferences,
  defaultRecipeColumnOrder,
  explorerColumnDefinitions,
  getExplorerColumns,
  hasPersistedExplorerUrlState,
  isExplorerStateContext,
  serializeExplorerState,
} from '../../src/lib/explorer-state';

describe('explorer state contract', () => {
  it('uses the saved recipe-column order in both recipe explorer contexts', () => {
    const reversedOrder = [...defaultRecipeColumnOrder].reverse();

    expect(getExplorerColumns('recipes-find', reversedOrder).map(({ key }) => key)).toEqual(
      reversedOrder,
    );
    expect(
      getExplorerColumns(
        'publication-recipes:cf1130fe-6225-4fd7-b6fc-3711ae656315',
        reversedOrder,
      ).map(({ key }) => key),
    ).toEqual(reversedOrder.filter((key) => key !== 'publication'));
    expect(getExplorerColumns('recipes-find', ['name', 'name']).map(({ key }) => key)).toEqual(
      defaultRecipeColumnOrder,
    );
  });

  it('uses shared hidden columns as defaults and omits Publication from publication recipes', () => {
    const hiddenColumns = ['name', 'publication', 'unknown', 'publication'];
    const recipeFindColumns = getExplorerColumns(
      'recipes-find',
      defaultRecipeColumnOrder,
      hiddenColumns,
    );
    const publicationRecipeColumns = getExplorerColumns(
      'publication-recipes:cf1130fe-6225-4fd7-b6fc-3711ae656315',
      defaultRecipeColumnOrder,
      hiddenColumns,
    );

    expect(recipeFindColumns.map(({ key }) => key)).toEqual(defaultRecipeColumnOrder);
    expect(publicationRecipeColumns.map(({ key }) => key)).toEqual(
      defaultRecipeColumnOrder.filter((key) => key !== 'publication'),
    );
    expect(recipeFindColumns.find(({ key }) => key === 'recipe_url')?.defaultVisible).toBe(true);
    expect(publicationRecipeColumns.find(({ key }) => key === 'recipe_url')?.defaultVisible).toBe(
      true,
    );
    expect(recipeFindColumns.find(({ key }) => key === 'publication')?.defaultVisible).toBe(false);
    expect(publicationRecipeColumns.find(({ key }) => key === 'publication')).toBeUndefined();
    expect(
      defaultExplorerDisplayPreferences('recipes-find', recipeFindColumns).visible_columns,
    ).not.toContain('publication');
    expect(
      defaultExplorerDisplayPreferences(
        'publication-recipes:cf1130fe-6225-4fd7-b6fc-3711ae656315',
        publicationRecipeColumns,
      ).visible_columns,
    ).not.toContain('publication');
    expect(getExplorerColumns('publications', undefined, hiddenColumns)).toEqual(
      explorerColumnDefinitions.publications,
    );
  });

  it('offers the full recipe field catalog in recipe list preferences', () => {
    const recipeColumns = explorerColumnDefinitions['recipes-find'].map(({ key }) => key);

    expect(recipeColumns).toContain('opinion');
    expect(recipeColumns).not.toEqual(expect.arrayContaining(['enthusiasm', 'verdict', 'reason']));
    expect(recipeColumns).toEqual(
      expect.arrayContaining([
        'publication_page',
        'recipe_url',
        'citation',
        'visibility',
        'occasion_details',
        'serves',
        'equipment',
        'cuisine',
        'tags',
        'main_ingredients',
        'prep_time_minutes',
        'mixing_time_minutes',
        'marinate_time_minutes',
        'chill_time_minutes',
        'freeze_time_minutes',
        'cook_time_minutes',
        'bake_time_minutes',
        'cooling_time_minutes',
        'rest_time_minutes',
        'created_at',
        'updated_at',
        'pairs_with',
      ]),
    );
  });

  it('accepts supported recipe explorer state and excludes transient search and pagination', () => {
    const state = createExplorerState('recipes-find', {
      direction: 'desc',
      filters: [{ field: 'state', operator: 'in', value: ['tried'] }],
      sort: 'updated_at',
      view: 'grid',
    });

    if (!state) {
      throw new Error('Expected valid recipe explorer state.');
    }

    expect(state).toEqual({
      direction: 'desc',
      filters: [{ field: 'state', operator: 'in', value: ['tried'] }],
      schema_version: 1,
      sort: 'updated_at',
      view: 'grid',
    });
    expect(serializeExplorerState('/recipes/find', state)).toBe(
      '/recipes/find?filter=%7B%22field%22%3A%22state%22%2C%22operator%22%3A%22in%22%2C%22value%22%3A%5B%22tried%22%5D%7D&sort=updated_at&direction=desc&view=grid',
    );
  });

  it('accepts a recipe display column as the persisted sort key', () => {
    expect(
      createExplorerState('recipes-find', {
        direction: 'asc',
        filters: [],
        sort: 'opinion',
        view: 'details',
      })?.sort,
    ).toBe('opinion');
  });

  it('preserves supported recipe column-filter selections without treating them as List columns', () => {
    const state = createExplorerState('recipes-find', {
      column_filters: { state: ['tried'] },
      direction: 'asc',
      filters: [],
      sort: 'name',
      view: 'list',
    });

    if (!state) {
      throw new Error('Expected valid recipe column-filter state.');
    }

    expect(serializeExplorerState('/recipes/find', state)).toBe(
      '/recipes/find?column_state=tried&sort=name&direction=asc&view=list',
    );
  });

  it('persists visibility filters and column selections', () => {
    const state = createExplorerState('recipes-find', {
      column_filters: { visibility: ['private'] },
      direction: 'asc',
      filters: [{ field: 'visibility', operator: 'not_in', value: ['linkable'] }],
      sort: 'visibility',
      view: 'details',
    });

    expect(state?.column_filters).toEqual({ visibility: ['private'] });
    expect(state?.filters).toEqual([
      { field: 'visibility', operator: 'not_in', value: ['linkable'] },
    ]);
    expect(state?.sort).toBe('visibility');
  });

  it('accepts the Library type filter but rejects unsupported state values and extra payload keys', () => {
    expect(
      createExplorerState('publications', {
        direction: 'asc',
        filters: [],
        sort: 'name',
        type: 'magazine',
        view: 'list',
      }),
    ).toEqual({
      direction: 'asc',
      filters: [],
      schema_version: 1,
      sort: 'name',
      type: 'magazine',
      view: 'list',
    });
    expect(
      createExplorerState('publications', {
        direction: 'asc',
        filters: [],
        page: 2,
        sort: 'not-a-sort',
        view: 'list',
      }),
    ).toBeNull();
    expect(
      createExplorerState('recipes-find', {
        direction: 'asc',
        filters: [{ field: 'unrecognized', operator: 'in', value: ['x'] }],
        sort: 'name',
        view: 'list',
      }),
    ).toBeNull();
  });

  it('accepts version 2 display preferences with context-specific columns and bounded widths', () => {
    expect(
      createExplorerState('recipes-find', {
        schema_version: 2,
        display_preferences: {
          visible_columns: ['publication', 'total_time_minutes'],
          column_widths: { name: 320, publication: 180 },
        },
        direction: 'asc',
        filters: [],
        sort: 'name',
        view: 'list',
      }),
    ).toEqual({
      schema_version: 2,
      display_preferences: {
        visible_columns: ['publication', 'total_time_minutes'],
        column_widths: { name: 320, publication: 180 },
      },
      direction: 'asc',
      filters: [],
      sort: 'name',
      view: 'list',
    });
    expect(
      createExplorerState('publication-recipes:cf1130fe-6225-4fd7-b6fc-3711ae656315', {
        schema_version: 2,
        display_preferences: {
          visible_columns: ['opinion', 'citation'],
          column_widths: { name: 360, citation: 240 },
        },
        direction: 'desc',
        filters: [],
        sort: 'name',
        view: 'details',
      })?.display_preferences,
    ).toEqual({
      visible_columns: ['opinion', 'citation'],
      column_widths: { name: 360, citation: 240 },
    });
    expect(
      createExplorerState('recipes-find', {
        schema_version: 2,
        display_preferences: { visible_columns: [], column_widths: {} },
        direction: 'asc',
        filters: [],
        sort: 'name',
        view: 'details',
      })?.view,
    ).toBe('details');
  });

  it('rejects unsupported display columns, duplicate visibility, invalid widths, and version mismatches', () => {
    const base = {
      direction: 'asc',
      filters: [],
      sort: 'name',
      view: 'list',
    };
    expect(
      createExplorerState('recipes-find', {
        ...base,
        schema_version: 2,
        display_preferences: { visible_columns: ['not_a_recipe_column'], column_widths: {} },
      }),
    ).toBeNull();
    expect(
      createExplorerState('recipes-find', {
        ...base,
        schema_version: 2,
        display_preferences: { visible_columns: ['state', 'state'], column_widths: {} },
      }),
    ).toBeNull();
    expect(
      createExplorerState('recipes-find', {
        ...base,
        schema_version: 2,
        display_preferences: { visible_columns: [], column_widths: { name: 79 } },
      }),
    ).toBeNull();
    expect(
      createExplorerState('recipes-find', {
        ...base,
        schema_version: 1,
        display_preferences: { visible_columns: [], column_widths: {} },
      }),
    ).toBeNull();
  });

  it('recognizes only valid explorer contexts', () => {
    expect(isExplorerStateContext('recipes-find')).toBe(true);
    expect(isExplorerStateContext('publications')).toBe(true);
    expect(isExplorerStateContext('publication-recipes:cf1130fe-6225-4fd7-b6fc-3711ae656315')).toBe(
      true,
    );
    expect(isExplorerStateContext('publication-recipes:not-a-uuid')).toBe(false);
    expect(isExplorerStateContext('recipes-find:other')).toBe(false);
  });

  it('treats valid durable URL values as authoritative but ignores search, pagination, and malformed state', () => {
    expect(hasPersistedExplorerUrlState('recipes-find', { q: 'saffron', page: '2' })).toBe(false);
    expect(hasPersistedExplorerUrlState('recipes-find', { sort: 'updated_at' })).toBe(true);
    expect(hasPersistedExplorerUrlState('publications', { type: 'magazine' })).toBe(true);
    expect(
      hasPersistedExplorerUrlState('recipes-find', {
        filter: '{"field":"state","operator":"in"}',
      }),
    ).toBe(true);
    expect(hasPersistedExplorerUrlState('recipes-find', { sort: 'not-a-sort' })).toBe(false);
    expect(hasPersistedExplorerUrlState('recipes-find', { type: 'magazine' })).toBe(false);
  });
});

  it('persists visibility filters and column selections', () => {
    const state = createExplorerState('recipes-find', {
      column_filters: { visibility: ['private'] },
      direction: 'asc',
      filters: [{ field: 'visibility', operator: 'not_in', value: ['linkable'] }],
      sort: 'visibility',
      view: 'details',
    });

    expect(state?.column_filters).toEqual({ visibility: ['private'] });
    expect(state?.filters).toEqual([
      { field: 'visibility', operator: 'not_in', value: ['linkable'] },
    ]);
    expect(state?.sort).toBe('visibility');
  });
