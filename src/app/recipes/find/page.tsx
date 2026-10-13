import Image from 'next/image';
import Link from 'next/link';
import { getPrimaryRecipePhotos } from '../../../lib/media/data';
import {
  getIngredients,
  getPublications,
  getRecipePicklists,
  getTags,
  recipeStateLabels,
} from '../../../lib/recipes/data';
import {
  getRecipeSearchFacetValues,
  parseRecipeSearchColumnFilters,
  parseRecipeSearchFilters,
  type RecipeSearchSortKey,
  searchRecipes,
} from '../../../lib/recipes/search';
import { createClient } from '../../../lib/supabase/server';
import { RecipeColumnFilter } from './recipe-column-filter';
import { RecipeFilterBuilder } from './recipe-filter-builder';
import { RecipeSearchModeProvider, RecipeSearchTabs } from './recipe-search-tabs';
import { RecipeSearchPagination, RecipeSearchToolbar } from './recipe-search-toolbar';

const pageSize = 50;
const sortOptions: { value: RecipeSearchSortKey; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'name', label: 'Name' },
  { value: 'state', label: 'State' },
  { value: 'total_time_minutes', label: 'Total Time' },
  { value: 'created_at', label: 'Date Added' },
  { value: 'updated_at', label: 'Date Changed' },
];

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
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function FindRecipesPage({ searchParams }: FindRecipesPageProps) {
  const params = await searchParams;
  const q = firstValue(params.q);
  const query = q.slice(0, 500);
  const filters = parseRecipeSearchFilters(params.filter);
  const parsedColumnFilters = parseRecipeSearchColumnFilters(params);
  const columnFilters = parsedColumnFilters.filters;
  const columnSelections = parsedColumnFilters.selections;
  const combinedFilters = [...filters, ...columnFilters];
  const requestedPage = Math.max(1, Math.min(20_001, Number.parseInt(params.page ?? '1', 10) || 1));
  const sortKey = sortOptions.some(({ value }) => value === params.sort)
    ? (params.sort as RecipeSearchSortKey)
    : query.trim()
      ? 'relevance'
      : 'name';
  const sortDirection = params.direction === 'desc' ? 'desc' : 'asc';
  const view = params.view === 'grid' ? 'grid' : 'list';
  const searchMode = params.tab === 'query' ? 'query' : 'search';
  const supabase = await createClient();
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

    [recipePhotos, nameFacets, publicationFacets, stateFacets, totalTimeFacets] = await Promise.all(
      [
        getPrimaryRecipePhotos(
          supabase,
          results.map(({ recipe_id }) => recipe_id),
        ),
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
      ],
    );
  } catch {
    searchError = 'Unable to search recipes. Your query and filters are preserved. Try again.';
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
    publication_id: [
      { value: '__recipe_tin__', label: 'Recipe Tin' },
      ...publications.map(({ id, name }) => ({ value: id, label: name })),
    ],
    tag: tags.map(({ id, name }) => ({ value: id, label: name })),
  };

  const countLabel = `${matchingCount} ${matchingCount === 1 ? 'recipe' : 'recipes'} found`;
  const hasCriteria = Boolean(query.trim() || combinedFilters.length > 0);
  const columnFilterOptions = {
    name: nameFacets,
    publication: publicationFacets,
    state: stateFacets,
    total_time_minutes: totalTimeFacets,
  };
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

  return (
    <RecipeSearchModeProvider initialMode={searchMode} key={searchMode}>
      <main className="recipes-main find-recipes" aria-labelledby="page-title">
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
                    <input
                      aria-label="Search recipes"
                      autoComplete="off"
                      id="recipe-search"
                      maxLength={500}
                      name="q"
                      type="search"
                      defaultValue={query}
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

        <RecipeSearchToolbar
          columnSelections={columnSelections}
          direction={sortDirection}
          filters={filters}
          options={sortOptions}
          path="/recipes/find"
          query={query}
          sort={sortKey}
          view={view}
        />

        <p className="find-recipes-count" role={searchError ? 'alert' : 'status'}>
          {searchError ?? countLabel}
        </p>

        {view === 'list' && (
          <nav aria-label="Filter recipe columns" className="find-recipes-mobile-filters">
            {(['name', 'publication', 'state', 'total_time_minutes'] as const).map((field) => (
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
        ) : view === 'list' ? (
          <div className="recipe-list-scroll">
            <table className="recipe-list find-recipes-list">
              <thead>
                <tr>
                  <th scope="col">{columnFilter('name')}</th>
                  <th scope="col">{columnFilter('publication')}</th>
                  <th scope="col">{columnFilter('state')}</th>
                  <th scope="col">{columnFilter('total_time_minutes')}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((recipe) => {
                  const photo = recipePhotos.get(recipe.recipe_id);
                  return (
                    <tr key={recipe.recipe_id}>
                      <td>
                        <Link
                          className="find-recipes-mobile-link"
                          href={`/recipes/${recipe.recipe_id}`}
                        >
                          {photo ? (
                            <Image
                              alt=""
                              className="find-recipes-mobile-thumbnail"
                              height={photo.height ?? 1}
                              src={photo.thumbnail_url}
                              unoptimized
                              width={photo.width ?? 1}
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="find-recipes-mobile-thumbnail find-recipes-mobile-thumbnail-placeholder"
                            />
                          )}
                          <span className="find-recipes-mobile-copy">
                            <span className="find-recipes-mobile-title">{recipe.recipe_name}</span>
                            <span className="find-recipes-mobile-metadata">
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
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className="find-recipes-mobile-label">Publication</span>
                        {recipe.publication_name ?? 'Recipe Tin'}
                      </td>
                      <td>
                        <span className="find-recipes-mobile-label">State</span>
                        {recipeStateLabels[recipe.state]}
                      </td>
                      <td>
                        <span className="find-recipes-mobile-label">Total Time</span>
                        {recipe.total_time_minutes === null
                          ? '—'
                          : `${recipe.total_time_minutes} min`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="find-recipes-grid">
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
          </ul>
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
      </main>
    </RecipeSearchModeProvider>
  );
}
