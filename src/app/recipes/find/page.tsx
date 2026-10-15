import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  createExplorerState,
  defaultExplorerDisplayPreferences,
  getExplorerColumns,
  hasPersistedExplorerUrlState,
  serializeExplorerState,
} from '../../../lib/explorer-state';
import { getExplorerState, getRecipeColumnSettings } from '../../../lib/explorer-state-data';
import { getPrimaryRecipePhotos } from '../../../lib/media/data';
import {
  getIngredients,
  getPublications,
  getRecipeExplorerColumnValues,
  getRecipePicklists,
  getTags,
  recipeStateLabels,
} from '../../../lib/recipes/data';
import {
  getRecipeSearchFacetValues,
  getRecipeSearchSortOptions,
  parseRecipeSearchColumnFilters,
  parseRecipeSearchFilters,
  type RecipeSearchFilter,
  type RecipeSearchSortKey,
  searchRecipes,
} from '../../../lib/recipes/search';
import { createClient } from '../../../lib/supabase/server';
import {
  ExplorerColumnResizeHandle,
  ExplorerListPreferences,
} from '../../explorer-list-preferences';
import { ExplorerStatePersistence } from '../../explorer-state-persistence';
import { AlternatingRecipeGrid } from './alternating-recipe-grid';
import { RecipeColumnFilter } from './recipe-column-filter';
import { RecipeFilterBuilder } from './recipe-filter-builder';
import {
  RecipeSearchInput,
  RecipeSearchModeProvider,
  RecipeSearchTabs,
} from './recipe-search-tabs';
import { RecipeSearchPagination, RecipeSearchToolbar } from './recipe-search-toolbar';

const pageSize = 50;
const dateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});
type FindRecipesPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    filter?: string | string[];
    sort?: string;
    direction?: string;
    page?: string;
    tab?: string;
    view?: string;
    column_name?: string | string[];
    column_publication?: string | string[];
    column_state?: string | string[];
    column_total_time_minutes?: string | string[];
    column_publication_page?: string | string[];
    column_recipe_url?: string | string[];
    column_citation?: string | string[];
    column_publication_source?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function FindRecipesPage({ searchParams }: FindRecipesPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const [rememberedState, recipeColumnSettings] = await Promise.all([
    getExplorerState(supabase, 'recipes-find'),
    getRecipeColumnSettings(supabase),
  ]);
  const recipeColumns = getExplorerColumns('recipes-find', recipeColumnSettings.order);
  if (!hasPersistedExplorerUrlState('recipes-find', params)) {
    if (rememberedState) {
      redirect(serializeExplorerState('/recipes/find', rememberedState, true));
    }
  }
  const displayPreferences =
    rememberedState?.display_preferences ??
    defaultExplorerDisplayPreferences('recipes-find', recipeColumns);
  const visibleColumnKeys = new Set(displayPreferences.visible_columns);
  const sortOptions = getRecipeSearchSortOptions(
    recipeColumns.filter(({ key, required }) => required || visibleColumnKeys.has(key)),
    true,
  );
  const q = firstValue(params.q);
  const searchMode = params.tab === 'query' ? 'query' : 'search';
  const query = searchMode === 'search' ? q.slice(0, 500) : '';
  const parsedFilters = searchMode === 'query' ? parseRecipeSearchFilters(params.filter) : [];
  const parsedColumnFilters = parseRecipeSearchColumnFilters(params);
  const requestedPage = Math.max(1, Math.min(20_001, Number.parseInt(params.page ?? '1', 10) || 1));
  const sortKey = sortOptions.some(({ value }) => value === params.sort)
    ? (params.sort as RecipeSearchSortKey)
    : query.trim()
      ? 'relevance'
      : 'name';
  const sortDirection = params.direction === 'desc' ? 'desc' : 'asc';
  const view = params.view === 'grid' ? 'grid' : params.view === 'list' ? 'list' : 'details';
  const [picklists, ingredients, publications, tags, activeRecipes] = await Promise.all([
    getRecipePicklists(supabase),
    getIngredients(supabase),
    getPublications(supabase),
    getTags(supabase),
    supabase.from('recipes').select('id', { count: 'exact', head: true }).is('trashed_at', null),
  ]);

  if (activeRecipes.error) {
    throw new Error('Unable to load recipes.');
  }

  const recipeTinId = publications.find(
    ({ publication_type }) => publication_type === 'collection',
  )?.id;
  const normalizeTinFilter = (filter: RecipeSearchFilter): RecipeSearchFilter => {
    if (filter.field !== 'publication_id' || !recipeTinId) return filter;
    const values = Array.isArray(filter.value)
      ? filter.value.filter((value): value is string | number => value !== undefined)
      : filter.value === undefined
        ? []
        : [filter.value];
    if (!values.includes('__recipe_tin__')) return filter;
    return {
      ...filter,
      value: values.map((value) => (value === '__recipe_tin__' ? recipeTinId : value)),
    };
  };
  const filters = parsedFilters.map(normalizeTinFilter);
  const columnSelections = {
    ...parsedColumnFilters.selections,
    ...(recipeTinId && parsedColumnFilters.selections.publication
      ? {
          publication: parsedColumnFilters.selections.publication.map((value) =>
            value === '__recipe_tin__' ? recipeTinId : value,
          ),
        }
      : {}),
  };
  const columnFilters = parsedColumnFilters.filters.map(normalizeTinFilter);
  const combinedFilters = [...filters, ...columnFilters];

  const searchOptions = {
    filters: combinedFilters,
    sortKey,
    sortDirection,
    limit: pageSize,
  } as const;
  let page = requestedPage;
  let results: Awaited<ReturnType<typeof searchRecipes>> = [];
  let matchingCount = 0;
  let pageCount = 1;
  let recipePhotos: Awaited<ReturnType<typeof getPrimaryRecipePhotos>> = new Map();
  let nameFacets: Awaited<ReturnType<typeof getRecipeSearchFacetValues>> = [];
  let publicationFacets: Awaited<ReturnType<typeof getRecipeSearchFacetValues>> = [];
  let stateFacets: Awaited<ReturnType<typeof getRecipeSearchFacetValues>> = [];
  let totalTimeFacets: Awaited<ReturnType<typeof getRecipeSearchFacetValues>> = [];
  let pageFacets: Awaited<ReturnType<typeof getRecipeSearchFacetValues>> = [];
  let urlFacets: Awaited<ReturnType<typeof getRecipeSearchFacetValues>> = [];
  let citationFacets: Awaited<ReturnType<typeof getRecipeSearchFacetValues>> = [];
  let recipeColumnValues = new Map<string, Record<string, string | null>>();
  let searchError: string | null = null;

  try {
    results = await searchRecipes(supabase, query, {
      ...searchOptions,
    });
    let resultCount = results[0]?.total_count;

    if (resultCount === undefined && page > 1) {
      const firstPage = await searchRecipes(supabase, query, {
        ...searchOptions,
        limit: 1,
        offset: 0,
      });
      resultCount = firstPage[0]?.total_count;
    }

    matchingCount =
      resultCount ?? (query.trim() || combinedFilters.length > 0 ? 0 : (activeRecipes.count ?? 0));
    pageCount = Math.max(1, Math.ceil(matchingCount / pageSize));
    if (page > pageCount) {
      page = pageCount;
      results = await searchRecipes(supabase, query, {
        ...searchOptions,
        offset: (page - 1) * pageSize,
      });
    }

    [
      recipePhotos,
      nameFacets,
      publicationFacets,
      stateFacets,
      totalTimeFacets,
      pageFacets,
      urlFacets,
      citationFacets,
      recipeColumnValues,
    ] = await Promise.all([
      view === 'grid'
        ? getPrimaryRecipePhotos(
            supabase,
            results.map(({ recipe_id }) => recipe_id),
          )
        : Promise.resolve(new Map()),
      getRecipeSearchFacetValues(
        supabase,
        query,
        [...filters, ...columnFilters.filter(({ field }) => field !== 'name')],
        'name',
      ),
      getRecipeSearchFacetValues(
        supabase,
        query,
        [...filters, ...columnFilters.filter(({ field }) => field !== 'publication_id')],
        'publication_id',
      ),
      getRecipeSearchFacetValues(
        supabase,
        query,
        [...filters, ...columnFilters.filter(({ field }) => field !== 'state')],
        'state',
      ),
      getRecipeSearchFacetValues(
        supabase,
        query,
        [...filters, ...columnFilters.filter(({ field }) => field !== 'total_time_minutes')],
        'total_time_minutes',
      ),
      getRecipeSearchFacetValues(
        supabase,
        query,
        [...filters, ...columnFilters.filter(({ field }) => field !== 'publication_page')],
        'publication_page',
      ),
      getRecipeSearchFacetValues(
        supabase,
        query,
        [...filters, ...columnFilters.filter(({ field }) => field !== 'recipe_url')],
        'recipe_url',
      ),
      getRecipeSearchFacetValues(
        supabase,
        query,
        [...filters, ...columnFilters.filter(({ field }) => field !== 'citation')],
        'citation',
      ),
      view === 'details'
        ? getRecipeExplorerColumnValues(
            supabase,
            results.map(({ recipe_id }) => recipe_id),
          )
        : Promise.resolve(new Map<string, Record<string, string | null>>()),
    ]);
  } catch {
    searchError =
      searchMode === 'query'
        ? 'Unable to search recipes. Your query refinements are preserved. Try again.'
        : 'Unable to search recipes. Your search is preserved. Try again.';
    results = [];
    matchingCount = 0;
    pageCount = 1;
  }

  const filterOptions = {
    food_type: picklists
      .filter(({ category }) => category === 'food_type')
      .map(({ id, display_value }) => ({ value: id, label: display_value })),
    meal_type: picklists
      .filter(({ category }) => category === 'meal_type')
      .map(({ id, display_value }) => ({ value: id, label: display_value })),
    cuisine: picklists
      .filter(({ category }) => category === 'cuisine')
      .map(({ id, display_value }) => ({ value: id, label: display_value })),
    equipment: picklists
      .filter(({ category }) => category === 'equipment')
      .map(({ id, display_value }) => ({ value: id, label: display_value })),
    ingredient: ingredients.map(({ id, name }) => ({ value: id, label: name })),
    verdict: picklists
      .filter(({ category }) => category === 'verdict')
      .map(({ id, display_value }) => ({ value: id, label: display_value })),
    enthusiasm: picklists
      .filter(({ category }) => category === 'enthusiasm')
      .map(({ id, display_value }) => ({ value: id, label: display_value })),
    publication_id: [...publications.map(({ id, name }) => ({ value: id, label: name }))],
    tag: tags.map(({ id, name }) => ({ value: id, label: name })),
  };

  const countLabel = `${matchingCount} ${matchingCount === 1 ? 'recipe' : 'recipes'} found`;
  const hasCriteria = Boolean(query.trim() || combinedFilters.length > 0);
  const columnFilterOptions = {
    name: nameFacets,
    publication: publicationFacets,
    state: stateFacets,
    total_time_minutes: totalTimeFacets,
    publication_page: pageFacets,
    recipe_url: urlFacets,
    citation: citationFacets,
  };
  const isFilterColumn = (key: string): key is keyof typeof columnFilterOptions =>
    key in columnFilterOptions;
  const columnFilter = (field: keyof typeof columnFilterOptions) => (
    <RecipeColumnFilter
      action="/recipes/find"
      baseFilters={filters}
      baseQuery={query}
      columnSelections={columnSelections}
      direction={sortDirection}
      field={field}
      options={columnFilterOptions[field]}
      selectedValues={columnSelections[field]}
      sort={sortKey}
      view={view}
    />
  );
  const serializedColumns = Object.entries(columnSelections).flatMap(([key, values]) => {
    if (values === undefined) return [];
    const name = `column_${key}`;
    if (values.length === 0)
      return [<input key={name} name={name} type="hidden" value="__none__" />];
    return values.map((value) => (
      <input key={`${name}-${value}`} name={name} type="hidden" value={value} />
    ));
  });
  const explorerState = createExplorerState('recipes-find', {
    ...(rememberedState?.display_preferences
      ? { schema_version: 2, display_preferences: rememberedState.display_preferences }
      : {}),
    column_filters: Object.fromEntries(
      Object.entries(columnSelections).filter(([, selections]) => selections !== undefined),
    ),
    filters,
    sort: sortKey,
    direction: sortDirection,
    view,
  });

  return (
    <RecipeSearchModeProvider initialMode={searchMode} key={searchMode}>
      <main className="recipes-main find-recipes" aria-labelledby="page-title">
        {explorerState && <ExplorerStatePersistence context="recipes-find" state={explorerState} />}
        <div className="recipe-page-heading">
          <div>
            <h1 id="page-title">Search</h1>
          </div>
        </div>

        <search aria-label="Search recipes" className="find-recipes-form">
          <form action="/recipes/find" method="get">
            <RecipeSearchTabs
              searchPanel={
                <div className="find-recipes-search-panel">
                  <div className="find-recipes-form-controls">
                    <RecipeSearchInput
                      defaultValue={query}
                      id="recipe-search"
                      label="Search recipes"
                    />
                    <button className="recipe-primary-button" formNoValidate type="submit">
                      Search
                    </button>
                  </div>
                </div>
              }
              queryPanel={
                <RecipeFilterBuilder
                  key={JSON.stringify(filters)}
                  filters={filters}
                  maxFilters={10 - columnFilters.length}
                  options={filterOptions}
                  title="Query refinements"
                />
              }
            />

            <input name="sort" type="hidden" value={sortKey} />
            <input name="direction" type="hidden" value={sortDirection} />
            <input name="view" type="hidden" value={view} />
            {serializedColumns}
          </form>
        </search>

        <ExplorerListPreferences
          columnDefinitions={recipeColumns}
          context="recipes-find"
          initialPreferences={displayPreferences}
          showControl={view === 'details' && explorerState !== null}
          state={
            explorerState ?? {
              schema_version: 1,
              filters: [],
              sort: sortKey,
              direction: sortDirection,
              view,
            }
          }
          toolbar={
            <RecipeSearchToolbar
              columnSelections={columnSelections}
              direction={sortDirection}
              filters={filters}
              options={sortOptions}
              path="/recipes/find"
              query={query}
              sort={sortKey}
              view={view}
              viewOptions={[
                { value: 'details', label: 'Details' },
                { value: 'list', label: 'List' },
                { value: 'grid', label: 'Grid' },
              ]}
            />
          }
        >
          <p className="find-recipes-count" role={searchError ? 'alert' : 'status'}>
            {searchError ?? countLabel}
          </p>

          {view === 'details' && (
            <nav aria-label="Filter recipe columns" className="find-recipes-mobile-filters">
              {(
                [
                  'name',
                  'publication',
                  'state',
                  'total_time_minutes',
                  'publication_page',
                  'recipe_url',
                  'citation',
                ] as const
              ).map((field) => (
                <span key={field}>{columnFilter(field)}</span>
              ))}
            </nav>
          )}

          {searchError ? null : matchingCount === 0 ? (
            <p className="recipe-empty-state">
              {hasCriteria
                ? 'No recipes match these search criteria.'
                : 'Your collection has no active recipes.'}
            </p>
          ) : view === 'details' ? (
            <div className="recipe-list-scroll">
              <table className="recipe-list find-recipes-list">
                <thead>
                  <tr>
                    {recipeColumns.map(({ key, label }) => (
                      <th data-explorer-column={key} key={key} scope="col">
                        {isFilterColumn(key) ? columnFilter(key) : label}
                        <ExplorerColumnResizeHandle column={key} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((recipe) => {
                    const details = recipeColumnValues.get(recipe.recipe_id);
                    return (
                      <tr key={recipe.recipe_id}>
                        {recipeColumns.map(({ key, label }) => {
                          let value =
                            key === 'publication'
                              ? (recipe.publication_name ?? 'Recipe Tin')
                              : key === 'state'
                                ? recipeStateLabels[recipe.state]
                                : (details?.[key] ?? null);
                          if (key === 'name') value = recipe.recipe_name;
                          if (key === 'total_time_minutes') {
                            value = recipe.total_time_minutes?.toString() ?? null;
                          }
                          if (key === 'created_at' || key === 'updated_at') {
                            value = value ? dateFormatter.format(new Date(value)) : null;
                          } else if (key.endsWith('_time_minutes')) {
                            value = value ? `${value} min` : null;
                          }

                          return (
                            <td data-explorer-column={key} data-label={label} key={key}>
                              {key === 'name' ? (
                                <Link
                                  className="find-recipes-mobile-link"
                                  href={`/recipes/${recipe.recipe_id}`}
                                >
                                  <span className="find-recipes-mobile-copy">
                                    <span className="find-recipes-mobile-title">
                                      {recipe.recipe_name}
                                    </span>
                                    <span className="find-recipes-mobile-metadata">
                                      <span data-explorer-column="publication">
                                        {recipe.publication_name ?? 'Recipe Tin'}
                                      </span>
                                      <span aria-hidden="true" data-explorer-separator="state">
                                        {' ~ '}
                                      </span>
                                      <span data-explorer-column="state">
                                        {recipeStateLabels[recipe.state]}
                                      </span>
                                      {recipe.total_time_minutes !== null && (
                                        <>
                                          <span
                                            aria-hidden="true"
                                            data-explorer-separator="total_time_minutes"
                                          >
                                            {' ~ '}
                                          </span>
                                          <span data-explorer-column="total_time_minutes">
                                            {recipe.total_time_minutes} min
                                          </span>
                                        </>
                                      )}
                                    </span>
                                  </span>
                                </Link>
                              ) : key === 'recipe_url' && value ? (
                                <a href={value}>{value}</a>
                              ) : (
                                value || '—'
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : view === 'list' ? (
            <ul className="recipe-explorer-simple-list">
              {results.map((recipe) => (
                <li key={recipe.recipe_id}>
                  <Link href={`/recipes/${recipe.recipe_id}`}>{recipe.recipe_name}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <AlternatingRecipeGrid>
              {results.map((recipe) => (
                <li key={recipe.recipe_id}>
                  <Link href={`/recipes/${recipe.recipe_id}`}>
                    {recipePhotos.get(recipe.recipe_id) && (
                      <Image
                        alt={
                          recipePhotos.get(recipe.recipe_id)?.description ||
                          `Photo of ${recipe.recipe_name}`
                        }
                        className="find-recipes-card-image"
                        height={recipePhotos.get(recipe.recipe_id)?.height ?? 1}
                        src={recipePhotos.get(recipe.recipe_id)?.thumbnail_url ?? ''}
                        unoptimized
                        width={recipePhotos.get(recipe.recipe_id)?.width ?? 1}
                      />
                    )}
                    <strong>{recipe.recipe_name}</strong>
                    <span className="find-recipes-grid-metadata">
                      <em>{recipe.publication_name ?? 'Recipe Tin'}</em>
                      <span aria-hidden="true"> ~ </span>
                      {recipeStateLabels[recipe.state]}
                      {recipe.total_time_minutes !== null && (
                        <>
                          <span aria-hidden="true"> ~ </span>
                          {recipe.total_time_minutes} min
                        </>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </AlternatingRecipeGrid>
          )}

          {pageCount > 1 && (
            <RecipeSearchPagination
              columnSelections={columnSelections}
              direction={sortDirection}
              filters={filters}
              page={page}
              pageCount={pageCount}
              path="/recipes/find"
              query={query}
              sort={sortKey}
              view={view}
            />
          )}
        </ExplorerListPreferences>
      </main>
    </RecipeSearchModeProvider>
  );
}
