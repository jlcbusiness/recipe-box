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

export type ExplorerColumnDefinition = {
  key: string;
  label: string;
  defaultVisible: boolean;
  required?: boolean;
  minWidth: number;
  maxWidth: number;
};

export type ExplorerDisplayPreferences = {
  visible_columns: string[];
  column_widths: Record<string, number>;
};

const nameColumn: ExplorerColumnDefinition = {
  key: 'name',
  label: 'Name',
  defaultVisible: true,
  required: true,
  minWidth: 180,
  maxWidth: 720,
};

const recipeColumnDefinitions: ExplorerColumnDefinition[] = [
  { key: 'publication', label: 'Publication', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  {
    key: 'publication_page',
    label: 'Page',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  { key: 'recipe_url', label: 'URL', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  { key: 'state', label: 'State', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  { key: 'visibility', label: 'Visibility', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  {
    key: 'occasion_details',
    label: 'Occasion Details',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  { key: 'serves', label: 'Serves', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  { key: 'equipment', label: 'Equipment', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  { key: 'food_type', label: 'Food Type', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  { key: 'meal_type', label: 'Meal Type', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  { key: 'cuisine', label: 'Cuisine', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  { key: 'tags', label: 'Tags', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  {
    key: 'main_ingredients',
    label: 'Main Ingredients',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  {
    key: 'prep_time_minutes',
    label: 'Prep Time',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  {
    key: 'mixing_time_minutes',
    label: 'Mixing Time',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  {
    key: 'marinate_time_minutes',
    label: 'Marinate Time',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  {
    key: 'chill_time_minutes',
    label: 'Chill Time',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  {
    key: 'freeze_time_minutes',
    label: 'Freeze Time',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  {
    key: 'cook_time_minutes',
    label: 'Cook Time',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  {
    key: 'bake_time_minutes',
    label: 'Bake Time',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  {
    key: 'cooling_time_minutes',
    label: 'Cooling Time',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  {
    key: 'rest_time_minutes',
    label: 'Rest Time',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  {
    key: 'total_time_minutes',
    label: 'Total Time',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
  { key: 'created_at', label: 'Date Added', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  { key: 'updated_at', label: 'Date Changed', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  { key: 'pairs_with', label: 'Pairs With', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  { key: 'opinion', label: 'Opinion', defaultVisible: false, minWidth: 96, maxWidth: 600 },
  {
    key: 'citation',
    label: 'Citation',
    defaultVisible: false,
    minWidth: 96,
    maxWidth: 600,
  },
];

function recipeColumns(defaultVisible: string[]): ExplorerColumnDefinition[] {
  return [
    nameColumn,
    ...recipeColumnDefinitions.map((definition) => ({
      ...definition,
      defaultVisible: defaultVisible.includes(definition.key),
    })),
  ];
}

export const explorerColumnDefinitions: Record<
  'recipes-find' | 'publications' | 'publication-recipes',
  ExplorerColumnDefinition[]
> = {
  'recipes-find': recipeColumns(['publication', 'state', 'visibility', 'total_time_minutes']),
  publications: [
    nameColumn,
    { key: 'author', label: 'Author', defaultVisible: true, minWidth: 96, maxWidth: 600 },
    { key: 'edition', label: 'Edition / Issue', defaultVisible: true, minWidth: 96, maxWidth: 600 },
    { key: 'recipe_count', label: 'Recipes', defaultVisible: true, minWidth: 96, maxWidth: 600 },
    { key: 'tags', label: 'Tags', defaultVisible: false, minWidth: 96, maxWidth: 600 },
    { key: 'created_at', label: 'Date Added', defaultVisible: false, minWidth: 96, maxWidth: 600 },
    {
      key: 'updated_at',
      label: 'Date Changed',
      defaultVisible: false,
      minWidth: 96,
      maxWidth: 600,
    },
  ],
  'publication-recipes': recipeColumns(['publication', 'state', 'visibility']).filter(
    ({ key }) => key !== 'publication',
  ),
};

export const defaultRecipeColumnOrder = ['name', ...recipeColumnDefinitions.map(({ key }) => key)];

export function normalizeHiddenRecipeColumns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const allowedColumns = new Set(defaultRecipeColumnOrder);
  const hiddenColumns = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string' && allowedColumns.has(item)) hiddenColumns.add(item);
  }
  return [...hiddenColumns];
}

export function normalizeRecipeColumnOrder(value: unknown): string[] {
  if (!Array.isArray(value) || value.length !== defaultRecipeColumnOrder.length) {
    return [...defaultRecipeColumnOrder];
  }
  const keys = value.filter((item): item is string => typeof item === 'string');
  if (
    keys.length !== defaultRecipeColumnOrder.length ||
    new Set(keys).size !== defaultRecipeColumnOrder.length ||
    keys.some((key) => !defaultRecipeColumnOrder.includes(key))
  ) {
    return [...defaultRecipeColumnOrder];
  }
  return keys;
}

export function getExplorerColumns(
  context: ExplorerStateContext,
  recipeColumnOrder?: unknown,
  hiddenRecipeColumns?: unknown,
): ExplorerColumnDefinition[] {
  const contextKey =
    context === 'publications'
      ? 'publications'
      : context === 'recipes-find'
        ? 'recipes-find'
        : 'publication-recipes';
  const definitions = explorerColumnDefinitions[contextKey];
  if (contextKey === 'publications') return definitions;

  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const hiddenColumns =
    hiddenRecipeColumns === undefined
      ? null
      : new Set(normalizeHiddenRecipeColumns(hiddenRecipeColumns));
  return normalizeRecipeColumnOrder(recipeColumnOrder).flatMap((key) => {
    const definition = definitionsByKey.get(key);
    return definition
      ? [
          {
            ...definition,
            defaultVisible: hiddenColumns ? !hiddenColumns.has(key) : definition.defaultVisible,
          },
        ]
      : [];
  });
}

export type ExplorerState = {
  schema_version: 1 | 2;
  display_preferences?: ExplorerDisplayPreferences;
  column_filters?: Record<string, string[]>;
  filters: ExplorerFilter[];
  sort: string;
  direction: 'asc' | 'desc';
  view: 'details' | 'list' | 'grid';
  type?: 'all' | 'book' | 'magazine' | 'site';
};

const recipeSortKeys = new Set(['relevance', ...defaultRecipeColumnOrder]);
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
  'publication_page',
  'recipe_url',
  'citation',
  'ingredient',
  'state',
  'visibility',
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
  'visibility',
  'total_time_minutes',
  'publication_page',
  'recipe_url',
  'citation',
  'publication_source',
]);
const publicationRecipeColumnFilterFields = new Set([
  'name',
  'state',
  'visibility',
  'total_time_minutes',
  'opinion',
  'meal_type',
  'food_type',
  'publication_page',
  'recipe_url',
  'citation',
  'publication_source',
]);
const stateKeys = new Set([
  'schema_version',
  'display_preferences',
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

export function defaultExplorerDisplayPreferences(
  context: ExplorerStateContext,
  columnDefinitions?: ExplorerColumnDefinition[],
): ExplorerDisplayPreferences {
  const definitions =
    columnDefinitions ??
    explorerColumnDefinitions[
      context === 'publications'
        ? 'publications'
        : context === 'recipes-find'
          ? 'recipes-find'
          : 'publication-recipes'
    ];
  return {
    visible_columns: definitions
      .filter(({ defaultVisible, required }) => defaultVisible && !required)
      .map(({ key }) => key),
    column_widths: {},
  };
}

function isExplorerDisplayPreferences(
  context: ExplorerStateContext,
  value: unknown,
): value is ExplorerDisplayPreferences {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !['visible_columns', 'column_widths'].includes(key))
  ) {
    return false;
  }
  if (!Array.isArray(value.visible_columns) || !isRecord(value.column_widths)) return false;

  const definitions =
    explorerColumnDefinitions[
      context === 'publications'
        ? 'publications'
        : context === 'recipes-find'
          ? 'recipes-find'
          : 'publication-recipes'
    ];
  const optionalColumns = new Map(
    definitions
      .filter(({ required }) => !required)
      .map((definition) => [definition.key, definition]),
  );
  const resizableColumns = new Map(definitions.map((definition) => [definition.key, definition]));
  const visibleColumns = value.visible_columns;
  if (
    visibleColumns.length !== new Set(visibleColumns).size ||
    !visibleColumns.every(
      (column): column is string => typeof column === 'string' && optionalColumns.has(column),
    )
  ) {
    return false;
  }

  return Object.entries(value.column_widths).every(([column, width]) => {
    const definition = resizableColumns.get(column);
    return (
      definition !== undefined &&
      typeof width === 'number' &&
      Number.isInteger(width) &&
      width >= definition.minWidth &&
      width <= definition.maxWidth
    );
  });
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
  const schemaVersion = value.schema_version ?? 1;
  if (schemaVersion !== 1 && schemaVersion !== 2) return null;
  const displayPreferences = value.display_preferences;
  if (
    (schemaVersion === 1 && displayPreferences !== undefined) ||
    (schemaVersion === 2 && !isExplorerDisplayPreferences(context, displayPreferences))
  ) {
    return null;
  }
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
  if (value.view !== 'details' && value.view !== 'list' && value.view !== 'grid') {
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
    schema_version: schemaVersion,
    ...(schemaVersion === 2
      ? { display_preferences: displayPreferences as ExplorerDisplayPreferences }
      : {}),
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
  if (view === 'details' || view === 'list' || view === 'grid') {
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
