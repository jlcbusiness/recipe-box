export type ExplorerFilter = {
  field: string;
  operator: string;
  value?: string | number | (string | number)[];
  value_to?: string | number;
};

export type ExplorerStateContext =
  | 'recipes-find'
  | 'publications'
  | `publication-recipes:${string}`;

export type ExplorerState = {
  schema_version: 1;
  column_filters?: Record<string, string[]>;
  filters: ExplorerFilter[];
  sort: string;
  direction: 'asc' | 'desc';
  view: 'details' | 'list' | 'grid';
  type?: 'all' | 'book' | 'magazine' | 'site';
};

const recipeSortKeys = new Set([
  'relevance',
  'name',
  'state',
  'total_time_minutes',
  'created_at',
  'updated_at',
]);
const publicationSortKeys = new Set([
  'relevance',
  'name',
  'type',
  'author',
  'edition',
  'recipe_count',
  'created_at',
  'updated_at',
]);
const recipeFilterFields = new Set([
  'name',
  'notes_markdown',
  'reason',
  'occasion_details',
  'publication_author',
  'ingredient',
  'state',
  'food_type',
  'verdict',
  'enthusiasm',
  'publication_id',
  'meal_type',
  'cuisine',
  'equipment',
  'tag',
  'serves',
  'prep_time_minutes',
  'mixing_time_minutes',
  'marinate_time_minutes',
  'chill_time_minutes',
  'freeze_time_minutes',
  'cook_time_minutes',
  'bake_time_minutes',
  'cooling_time_minutes',
  'rest_time_minutes',
  'total_time_minutes',
  'created_at',
  'updated_at',
]);
const publicationFilterFields = new Set([
  'name',
  'author',
  'edition',
  'isbn',
  'retailer_url',
  'site_url',
  'publication_type',
  'tag',
  'recipe_count',
  'created_at',
  'updated_at',
]);
const filterOperators = new Set([
  'contains',
  'does_not_contain',
  'equals',
  'starts_with',
  'is_empty',
  'is_not_empty',
  'contains_any',
  'contains_all',
  'in',
  'not_in',
  'is',
  'is_not',
  'not_equals',
  'greater_than',
  'less_than',
  'at_least',
  'at_most',
  'between',
]);
const recipeFinderColumnFilterFields = new Set([
  'name',
  'publication',
  'state',
  'total_time_minutes',
]);
const publicationRecipeColumnFilterFields = new Set([
  'name',
  'state',
  'total_time_minutes',
  'opinion',
  'meal_type',
  'food_type',
  'publication_source',
]);
const stateKeys = new Set([
  'schema_version',
  'column_filters',
  'filters',
  'sort',
  'direction',
  'view',
  'type',
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFilterValue(value: unknown): value is ExplorerFilter['value'] {
  if (typeof value === 'string' || typeof value === 'number') return true;
  return (
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every((item) => typeof item === 'string' || typeof item === 'number')
  );
}

function isExplorerFilter(value: unknown): value is ExplorerFilter {
  if (!isRecord(value)) return false;
  const allowedKeys = new Set(['field', 'operator', 'value', 'value_to']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false;
  if (typeof value.field !== 'string' || typeof value.operator !== 'string') return false;
  if ('value' in value && !isFilterValue(value.value)) return false;
  return (
    !('value_to' in value) ||
    typeof value.value_to === 'string' ||
    typeof value.value_to === 'number'
  );
}

function isSupportedExplorerFilter(context: ExplorerStateContext, filter: ExplorerFilter): boolean {
  const fields = context === 'publications' ? publicationFilterFields : recipeFilterFields;
  return fields.has(filter.field) && filterOperators.has(filter.operator);
}

function isColumnFilterSelection(
  context: ExplorerStateContext,
  value: unknown,
): value is Record<string, string[]> {
  if (context === 'publications' || !isRecord(value)) return false;
  const fields =
    context === 'recipes-find'
      ? recipeFinderColumnFilterFields
      : publicationRecipeColumnFilterFields;
  return Object.entries(value).every(
    ([field, selections]) =>
      fields.has(field) &&
      Array.isArray(selections) &&
      selections.length <= 500 &&
      selections.every((selection) => typeof selection === 'string'),
  );
}

export function isExplorerStateContext(value: string): value is ExplorerStateContext {
  return (
    value === 'recipes-find' ||
    value === 'publications' ||
    (value.startsWith('publication-recipes:') && uuidPattern.test(value.slice(20)))
  );
}

export function createExplorerState(
  context: ExplorerStateContext,
  value: unknown,
): ExplorerState | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !stateKeys.has(key))) return null;
  if ('schema_version' in value && value.schema_version !== 1) return null;
  if (
    !Array.isArray(value.filters) ||
    value.filters.length > 10 ||
    !value.filters.every(
      (filter): filter is ExplorerFilter =>
        isExplorerFilter(filter) && isSupportedExplorerFilter(context, filter),
    )
  ) {
    return null;
  }
  if (value.direction !== 'asc' && value.direction !== 'desc') return null;
  if (
    value.view !== 'list' &&
    value.view !== 'grid' &&
    !(context.startsWith('publication-recipes:') && value.view === 'details')
  ) {
    return null;
  }
  const columnFilters = 'column_filters' in value ? value.column_filters : undefined;
  if (columnFilters !== undefined && !isColumnFilterSelection(context, columnFilters)) {
    return null;
  }

  const isPublications = context === 'publications';
  const sortKeys = isPublications ? publicationSortKeys : recipeSortKeys;
  if (typeof value.sort !== 'string' || !sortKeys.has(value.sort)) return null;
  if (isPublications) {
    if (
      'type' in value &&
      value.type !== 'all' &&
      value.type !== 'book' &&
      value.type !== 'magazine' &&
      value.type !== 'site'
    ) {
      return null;
    }
  } else if ('type' in value) {
    return null;
  }

  return {
    schema_version: 1,
    ...(columnFilters !== undefined ? { column_filters: columnFilters } : {}),
    filters: value.filters,
    sort: value.sort,
    direction: value.direction,
    view: value.view,
    ...(isPublications && 'type' in value ? { type: value.type as ExplorerState['type'] } : {}),
  };
}

function firstString(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : undefined;
}

export function hasPersistedExplorerUrlState(
  context: ExplorerStateContext,
  params: Record<string, unknown>,
): boolean {
  const sortKeys = context === 'publications' ? publicationSortKeys : recipeSortKeys;
  const sort = firstString(params.sort);
  if (sort && sortKeys.has(sort)) return true;

  const direction = firstString(params.direction);
  if (direction === 'asc' || direction === 'desc') return true;

  const view = firstString(params.view);
  if (
    view === 'list' ||
    view === 'grid' ||
    (context.startsWith('publication-recipes:') && view === 'details')
  ) {
    return true;
  }

  if (context === 'publications') {
    const type = firstString(params.type);
    if (type === 'all' || type === 'book' || type === 'magazine' || type === 'site') return true;
  }

  const filters = Array.isArray(params.filter)
    ? params.filter
    : params.filter === undefined
      ? []
      : [params.filter];
  return (
    filters.some((filter) => {
      if (typeof filter !== 'string') return false;
      try {
        const parsed = JSON.parse(filter);
        return isExplorerFilter(parsed) && isSupportedExplorerFilter(context, parsed);
      } catch {
        return false;
      }
    }) ||
    Object.entries(params).some(([key, value]) => {
      if (!key.startsWith('column_')) return false;
      return isColumnFilterSelection(context, {
        [key.slice(7)]: Array.isArray(value) ? value : [value],
      });
    })
  );
}

export function serializeExplorerState(
  path: string,
  state: ExplorerState,
  includeQueryTab = false,
): string {
  const params = new URLSearchParams();
  for (const filter of state.filters) params.append('filter', JSON.stringify(filter));
  for (const [field, selections] of Object.entries(state.column_filters ?? {})) {
    if (selections.length === 0) params.append(`column_${field}`, '__none__');
    else for (const selection of selections) params.append(`column_${field}`, selection);
  }
  if (state.type && state.type !== 'all') params.set('type', state.type);
  params.set('sort', state.sort);
  params.set('direction', state.direction);
  params.set('view', state.view);
  if (includeQueryTab && state.filters.length > 0) params.set('tab', 'query');
  return `${path}?${params.toString()}`;
}
