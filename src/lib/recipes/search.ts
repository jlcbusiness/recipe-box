import 'server-only';
import type { RecipeSupabaseClient } from './data';
import type { StandardNutrientKey } from './nutrition-rules';
import { STANDARD_NUTRIENT_KEYS } from './nutrition-rules';

export type RecipeSearchResult = {
  recipe_id: string;
  recipe_name: string;
  state: 'want_to_try' | 'tried' | 'will_not_try';
  total_time_minutes: number | null;
  publication_name: string | null;
  rank: number;
  total_count: number;
};

export type RecipeSearchFilterField =
  | 'name'
  | 'notes_markdown'
  | 'reason'
  | 'occasion_details'
  | 'publication_name'
  | 'publication_author'
  | 'publication_page'
  | 'recipe_url'
  | 'citation'
  | 'ingredient'
  | 'main_ingredient'
  | 'main_ingredient_text'
  | 'state'
  | 'visibility'
  | 'food_type'
  | 'verdict'
  | 'enthusiasm'
  | 'publication_id'
  | 'meal_type'
  | 'cuisine'
  | 'equipment'
  | 'tag'
  | 'opinion'
  | 'publication_source'
  | 'score'
  | 'starred'
  | 'hearted'
  | RecipeSearchColumnFilterField
  | 'serves'
  | 'prep_time_minutes'
  | 'mixing_time_minutes'
  | 'marinate_time_minutes'
  | 'chill_time_minutes'
  | 'freeze_time_minutes'
  | 'cook_time_minutes'
  | 'bake_time_minutes'
  | 'cooling_time_minutes'
  | 'rest_time_minutes'
  | 'total_time_minutes'
  | 'created_at'
  | 'updated_at'
  | StandardNutrientKey;

export type RecipeSearchFilter = {
  field: RecipeSearchFilterField;
  operator: string;
  value?: string | number | (string | number)[];
  value_to?: string | number;
};

export type RecipeSearchColumnKey =
  | Exclude<RecipeSearchSortKey, 'relevance'>
  | 'visibility'
  | 'publication_source';
export type RecipeSearchColumnFilterField = `column_${RecipeSearchColumnKey}`;
export type RecipeSearchColumnSelections = Partial<Record<RecipeSearchColumnKey, string[]>>;
export const recipeSearchGenericColumnKeys = [
  'occasion_details',
  'serves',
  'makes',
  'equipment',
  'cuisine',
  'tags',
  'main_ingredients',
  ...STANDARD_NUTRIENT_KEYS,
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
  'score',
  'starred',
  'hearted',
] as const satisfies readonly RecipeSearchColumnKey[];
export type RecipeSearchGenericColumnKey = (typeof recipeSearchGenericColumnKeys)[number];
export function isRecipeSearchGenericColumnKey(key: string): key is RecipeSearchGenericColumnKey {
  return (recipeSearchGenericColumnKeys as readonly string[]).includes(key);
}
export type RecipeSearchFacetField =
  | 'name'
  | 'publication_id'
  | 'state'
  | 'total_time_minutes'
  | 'opinion'
  | 'meal_type'
  | 'food_type'
  | 'publication_page'
  | 'recipe_url'
  | 'citation'
  | 'publication_source';
export type RecipeSearchFacetOption = { value: string; label: string; count: number };

export type RecipeSearchSortKey =
  | 'relevance'
  | 'name'
  | 'publication'
  | 'publication_page'
  | 'recipe_url'
  | 'state'
  | 'visibility'
  | 'occasion_details'
  | 'serves'
  | 'equipment'
  | 'food_type'
  | 'meal_type'
  | 'cuisine'
  | 'tags'
  | 'main_ingredients'
  | 'prep_time_minutes'
  | 'mixing_time_minutes'
  | 'marinate_time_minutes'
  | 'chill_time_minutes'
  | 'freeze_time_minutes'
  | 'cook_time_minutes'
  | 'bake_time_minutes'
  | 'cooling_time_minutes'
  | 'rest_time_minutes'
  | 'total_time_minutes'
  | 'created_at'
  | 'updated_at'
  | 'pairs_with'
  | 'opinion'
  | 'citation'
  | 'score'
  | 'makes'
  | 'starred'
  | 'hearted'
  | StandardNutrientKey;

export type RecipeSearchSortOption = { value: RecipeSearchSortKey; label: string };

export function getRecipeSearchSortOptions(
  columns: readonly { key: string; label: string }[],
  includeRelevance = false,
): RecipeSearchSortOption[] {
  return [
    ...(includeRelevance ? [{ value: 'relevance' as const, label: 'Relevance' }] : []),
    ...columns.map(({ key, label }) => ({ value: key as RecipeSearchSortKey, label })),
  ];
}

export type RecipeSearchOptions = {
  filters?: RecipeSearchFilter[];
  sortKey?: RecipeSearchSortKey;
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  publicationId?: string;
};

export function parseRecipeSearchFilters(
  input: string | string[] | undefined,
): RecipeSearchFilter[] {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  return values.slice(0, 10).flatMap((value) => {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'field' in parsed &&
        typeof parsed.field === 'string' &&
        'operator' in parsed &&
        typeof parsed.operator === 'string'
      ) {
        return [parsed as RecipeSearchFilter];
      }
    } catch {
      return [];
    }
    return [];
  });
}

export function parseRecipeSearchColumnFilters(
  params: Record<string, string | string[] | undefined>,
): { filters: RecipeSearchFilter[]; selections: RecipeSearchColumnSelections } {
  const definitions: {
    key: RecipeSearchColumnKey;
    parameter: string;
    field: RecipeSearchFilterField;
    numeric?: boolean;
  }[] = [
    { key: 'name', parameter: 'column_name', field: 'name' },
    { key: 'publication', parameter: 'column_publication', field: 'publication_id' },
    { key: 'state', parameter: 'column_state', field: 'state' },
    { key: 'visibility', parameter: 'column_visibility', field: 'visibility' },
    {
      key: 'total_time_minutes',
      parameter: 'column_total_time_minutes',
      field: 'total_time_minutes',
      numeric: true,
    },
    { key: 'opinion', parameter: 'column_opinion', field: 'opinion' },
    { key: 'meal_type', parameter: 'column_meal_type', field: 'meal_type' },
    { key: 'food_type', parameter: 'column_food_type', field: 'food_type' },
    {
      key: 'publication_page',
      parameter: 'column_publication_page',
      field: 'publication_page',
    },
    { key: 'recipe_url', parameter: 'column_recipe_url', field: 'recipe_url' },
    { key: 'citation', parameter: 'column_citation', field: 'citation' },
    {
      key: 'publication_source',
      parameter: 'column_publication_source',
      field: 'publication_source',
    },
  ];
  const filters: RecipeSearchFilter[] = [];
  const selections: RecipeSearchColumnSelections = {};

  for (const definition of definitions) {
    const raw = params[definition.parameter as keyof typeof params];
    if (raw === undefined) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.includes('__all__')) continue;

    const selected = values.includes('__none__') ? [] : values.slice(0, 500);
    selections[definition.key] = selected;
    filters.push({
      field: definition.field,
      operator: definition.key === 'meal_type' ? 'contains_any' : 'in',
      value: definition.numeric
        ? selected.map((value) => (value === '__blank__' ? value : Number(value)))
        : selected,
    });
  }

  for (const key of recipeSearchGenericColumnKeys) {
    const raw = params[`column_${key}`];
    if (raw === undefined) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.includes('__all__')) continue;

    const selected = values.includes('__none__') ? [] : values.slice(0, 500);
    selections[key] = selected;
    filters.push({
      field: `column_${key}`,
      operator: 'in',
      value: selected,
    });
  }

  return { filters, selections };
}

export async function getRecipeSearchFacetValues(
  supabase: RecipeSupabaseClient,
  query: string,
  filters: RecipeSearchFilter[],
  field: RecipeSearchFacetField,
  publicationId?: string,
): Promise<RecipeSearchFacetOption[]> {
  const { data, error } = await supabase.rpc('recipe_search_facet_values', {
    p_query: query.trim().replace(/\s+/g, ' ').slice(0, 500) || null,
    p_filters: filters,
    p_facet_field: field,
    p_publication_id: publicationId ?? null,
  });

  if (error) {
    throw new Error('Unable to load recipe filter values.');
  }

  return ((data ?? []) as { facet_value: string; facet_label: string; recipe_count: number }[]).map(
    (option) => ({
      value: option.facet_value,
      label: option.facet_label,
      count: option.recipe_count,
    }),
  );
}

export async function getRecipeSearchColumnFacetValues(
  supabase: RecipeSupabaseClient,
  query: string,
  filters: RecipeSearchFilter[],
  columnKeys: readonly RecipeSearchGenericColumnKey[],
  publicationId?: string,
): Promise<Partial<Record<RecipeSearchColumnKey, RecipeSearchFacetOption[]>>> {
  const { data, error } = await supabase.rpc('recipe_search_column_facet_values', {
    p_query: query.trim().replace(/\s+/g, ' ').slice(0, 500) || null,
    p_filters: filters,
    p_column_keys: [...columnKeys],
    p_publication_id: publicationId ?? null,
  });

  if (error) {
    throw new Error('Unable to load recipe filter values.');
  }

  const dateFormatter = new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  });
  const numericColumnKeys = new Set<RecipeSearchColumnKey>([
    'serves',
    'score',
    ...STANDARD_NUTRIENT_KEYS,
  ]);
  const optionsByColumn: Partial<Record<RecipeSearchColumnKey, RecipeSearchFacetOption[]>> = {};
  for (const key of columnKeys) optionsByColumn[key] = [];
  for (const option of (data ?? []) as {
    column_key: RecipeSearchColumnKey;
    facet_value: string;
    recipe_count: number;
  }[]) {
    const options = optionsByColumn[option.column_key] ?? [];
    const isBlank = option.facet_value === '__blank__';
    const label = isBlank
      ? option.column_key === 'starred'
        ? 'Not starred'
        : option.column_key === 'hearted'
          ? 'Not hearted'
          : 'Blank'
      : option.column_key === 'starred'
        ? 'Starred'
        : option.column_key === 'hearted'
          ? 'Hearted'
          : option.column_key === 'created_at' || option.column_key === 'updated_at'
            ? dateFormatter.format(new Date(option.facet_value))
            : option.column_key.endsWith('_time_minutes')
              ? `${option.facet_value} min`
              : numericColumnKeys.has(option.column_key)
                ? String(Number(option.facet_value))
                : option.facet_value;
    options.push({
      value: option.facet_value,
      label,
      count: option.recipe_count,
    });
    optionsByColumn[option.column_key] = options;
  }

  return optionsByColumn;
}

export function mainIngredientTextFilters(
  query: string,
  mainIngredientsOnly: boolean,
): RecipeSearchFilter[] {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ').slice(0, 500);
  return mainIngredientsOnly && normalizedQuery
    ? [{ field: 'main_ingredient_text', operator: 'matches', value: normalizedQuery }]
    : [];
}

export async function searchRecipes(
  supabase: RecipeSupabaseClient,
  query: string,
  options: RecipeSearchOptions = {},
): Promise<RecipeSearchResult[]> {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ').slice(0, 500);
  const { data, error } = await supabase.rpc('search_recipes', {
    p_query: normalizedQuery || null,
    p_limit: options.limit ?? 50,
    p_offset: options.offset ?? 0,
    p_filters: options.filters ?? [],
    p_sort_key: options.sortKey ?? null,
    p_sort_direction: options.sortDirection ?? 'asc',
    p_publication_id: options.publicationId ?? null,
  });

  if (error) {
    throw new Error('Unable to search recipes.');
  }

  return (data ?? []) as RecipeSearchResult[];
}
