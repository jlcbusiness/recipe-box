import { describe, expect, it } from 'vitest';
import {
  createExplorerState,
  hasPersistedExplorerUrlState,
  isExplorerStateContext,
  serializeExplorerState,
} from '../../src/lib/explorer-state';

describe('explorer state contract', () => {
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
