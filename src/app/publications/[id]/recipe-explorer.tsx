import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  createExplorerState,
  hasPersistedExplorerUrlState,
  serializeExplorerState,
} from '../../../lib/explorer-state';
import { getExplorerState } from '../../../lib/explorer-state-data';
import { getPrimaryRecipePhotos } from '../../../lib/media/data';
import { getRecipePicklists, recipeStateLabels } from '../../../lib/recipes/data';
import {
  getRecipeSearchFacetValues,
  parseRecipeSearchColumnFilters,
  type RecipeSearchColumnSelections,
  type RecipeSearchFacetOption,
  type RecipeSearchSortKey,
  searchRecipes,
} from '../../../lib/recipes/search';
import { createClient } from '../../../lib/supabase/server';
import { ExplorerStatePersistence } from '../../explorer-state-persistence';
import { AlternatingRecipeGrid } from '../../recipes/find/alternating-recipe-grid';
import { RecipeColumnFilter } from '../../recipes/find/recipe-column-filter';
import { RecipeSearchToolbar } from '../../recipes/find/recipe-search-toolbar';

const pageSize = 50;
const sortOptions: { value: RecipeSearchSortKey; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'name', label: 'Name' },
  { value: 'state', label: 'State' },
  { value: 'total_time_minutes', label: 'Total Time' },
  { value: 'created_at', label: 'Date Added' },
  { value: 'updated_at', label: 'Date Changed' },
];
const viewOptions = [
  { value: 'details', label: 'Details' },
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
] as const;

type RecipeExplorerSearchParams = {
  sort?: string;
  direction?: string;
  page?: string;
  view?: string;
  column_name?: string | string[];
  column_state?: string | string[];
  column_total_time_minutes?: string | string[];
  column_opinion?: string | string[];
  column_meal_type?: string | string[];
  column_food_type?: string | string[];
  column_publication_source?: string | string[];
};

function searchHref({
  path,
  columnSelections,
  sortKey,
  sortDirection,
  page,
  view,
}: {
  path: string;
  columnSelections: RecipeSearchColumnSelections;
  sortKey: RecipeSearchSortKey;
  sortDirection: 'asc' | 'desc';
  page: number;
  view: 'details' | 'grid' | 'list';
}) {
  const params = new URLSearchParams();
  for (const [key, values] of Object.entries(columnSelections)) {
    if (values === undefined) continue;
    const name = `column_${key}`;
    if (values.length === 0) params.append(name, '__none__');
    else for (const value of values) params.append(name, value);
  }
  params.set('sort', sortKey);
  params.set('direction', sortDirection);
  params.set('page', String(page));
  params.set('view', view);
  return `${path}?${params.toString()}`;
}

export async function PublicationRecipeExplorer({
  publicationId,
  searchParams,
}: {
  publicationId: string;
  searchParams: RecipeExplorerSearchParams;
}) {
  const parsedColumnFilters = parseRecipeSearchColumnFilters(searchParams);
  const columnFilters = parsedColumnFilters.filters;
  const columnSelections = parsedColumnFilters.selections;
  const requestedPage = Math.max(
    1,
    Math.min(20_001, Number.parseInt(searchParams.page ?? '1', 10) || 1),
  );
  const sortKey = sortOptions.some(({ value }) => value === searchParams.sort)
    ? (searchParams.sort as RecipeSearchSortKey)
    : 'name';
  const sortDirection = searchParams.direction === 'desc' ? 'desc' : 'asc';
  const view =
    searchParams.view === 'grid' ? 'grid' : searchParams.view === 'list' ? 'list' : 'details';
  const supabase = await createClient();
  const path = `/publications/${publicationId}`;
  const context = `publication-recipes:${publicationId}` as const;
  if (!hasPersistedExplorerUrlState(context, searchParams)) {
    const rememberedState = await getExplorerState(supabase, context);
    if (rememberedState) {
      redirect(serializeExplorerState(path, rememberedState, true));
    }
  }
  const [picklists, activeRecipes] = await Promise.all([
    getRecipePicklists(supabase),
    supabase
      .from('recipes')
      .select('id', { count: 'exact', head: true })
      .eq('publication_id', publicationId)
      .is('trashed_at', null),
  ]);

  if (activeRecipes.error) {
    throw new Error('Unable to load publication recipes.');
  }

  const searchOptions = {
    filters: view === 'details' ? columnFilters : [],
    sortKey,
    sortDirection,
    publicationId,
    limit: pageSize,
  } as const;
  let page = requestedPage;
  let recipes = await searchRecipes(supabase, '', {
    ...searchOptions,
    offset: (page - 1) * pageSize,
  });
  let matchingCount = recipes[0]?.total_count;
  if (matchingCount === undefined && page > 1) {
    const firstPage = await searchRecipes(supabase, '', {
      ...searchOptions,
      limit: 1,
      offset: 0,
    });
    matchingCount = firstPage[0]?.total_count;
  }
  matchingCount ??= columnFilters.length > 0 ? 0 : (activeRecipes.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(matchingCount / pageSize));
  if (page > pageCount) {
    page = pageCount;
    recipes = await searchRecipes(supabase, '', {
      ...searchOptions,
      offset: (page - 1) * pageSize,
    });
  }

  const recipeIds = recipes.map(({ recipe_id }) => recipe_id);
  const [recipeDetailsResult, assignmentsResult, recipePhotos] = await Promise.all([
    recipeIds.length
      ? supabase
          .from('recipes')
          .select(
            'id, publication_page, recipe_url, food_type_id, verdict_id, enthusiasm_id, reason',
          )
          .in('id', recipeIds)
      : Promise.resolve({ data: [], error: null }),
    recipeIds.length
      ? supabase
          .from('recipe_picklist_assignments')
          .select('recipe_id, picklist_value_id')
          .in('recipe_id', recipeIds)
          .eq('category', 'meal_type')
      : Promise.resolve({ data: [], error: null }),
    view === 'grid' ? getPrimaryRecipePhotos(supabase, recipeIds) : Promise.resolve(new Map()),
  ]);

  if (recipeDetailsResult.error || assignmentsResult.error) {
    throw new Error('Unable to load publication recipe details.');
  }

  const facetFields = [
    ['name', 'name'],
    ['state', 'state'],
    ['total_time_minutes', 'total_time_minutes'],
    ['opinion', 'opinion'],
    ['meal_type', 'meal_type'],
    ['food_type', 'food_type'],
    ['publication_source', 'publication_source'],
  ] as const;
  const columnFacetEntries = await Promise.all(
    facetFields.map(
      async ([key, field]) =>
        [
          key,
          await getRecipeSearchFacetValues(
            supabase,
            '',
            columnFilters.filter((columnFilter) => columnFilter.field !== field),
            field,
            publicationId,
          ),
        ] as const,
    ),
  );
  const columnFacetOptions = Object.fromEntries(columnFacetEntries) as Record<
    | 'name'
    | 'state'
    | 'total_time_minutes'
    | 'opinion'
    | 'meal_type'
    | 'food_type'
    | 'publication_source',
    RecipeSearchFacetOption[]
  >;

  const picklistById = new Map(picklists.map(({ id, display_value }) => [id, display_value]));
  const foodTypeById = new Map(
    picklists
      .filter(({ category }) => category === 'food_type')
      .map(({ id, display_value }) => [id, display_value]),
  );
  const assignmentsByRecipe = new Map<string, string[]>();
  for (const assignment of assignmentsResult.data ?? []) {
    const values = assignmentsByRecipe.get(assignment.recipe_id) ?? [];
    const value = picklistById.get(assignment.picklist_value_id);
    if (value) values.push(value);
    assignmentsByRecipe.set(assignment.recipe_id, values);
  }
  const recipeDetails = new Map(
    (recipeDetailsResult.data ?? []).map((recipe) => [recipe.id, recipe]),
  );
  const countLabel = `${matchingCount} ${matchingCount === 1 ? 'recipe' : 'recipes'} found`;
  const columnFilter = (field: keyof typeof columnFacetOptions) => (
    <RecipeColumnFilter
      action={path}
      baseFilters={[]}
      baseQuery=""
      columnSelections={columnSelections}
      direction={sortDirection}
      field={field}
      options={columnFacetOptions[field]}
      selectedValues={columnSelections[field]}
      sort={sortKey}
      view={view}
    />
  );
  const resultsHref = (nextPage: number) =>
    searchHref({
      path,
      columnSelections,
      sortKey,
      sortDirection,
      page: nextPage,
      view,
    });
  const explorerState = createExplorerState(context, {
    column_filters: Object.fromEntries(
      Object.entries(columnSelections).filter(([, selections]) => selections !== undefined),
    ),
    filters: [],
    sort: sortKey,
    direction: sortDirection,
    view,
  });

  return (
    <section aria-label="Publication recipes" className="publication-recipe-explorer">
      {explorerState && <ExplorerStatePersistence context={context} state={explorerState} />}
      <RecipeSearchToolbar
        columnSelections={columnSelections}
        direction={sortDirection}
        filters={[]}
        options={sortOptions}
        path={path}
        query=""
        sort={sortKey}
        view={view}
        viewOptions={[...viewOptions]}
      />

      <p className="find-recipes-count" role="status">
        {countLabel}
      </p>

      {view === 'details' && (
        <nav aria-label="Filter publication recipe columns" className="find-recipes-mobile-filters">
          {(
            [
              'name',
              'state',
              'opinion',
              'meal_type',
              'food_type',
              'total_time_minutes',
              'publication_source',
            ] as const
          ).map((field) => (
            <span key={field}>{columnFilter(field)}</span>
          ))}
        </nav>
      )}

      {matchingCount === 0 ? (
        <p className="recipe-empty-state">
          {activeRecipes.count === 0
            ? 'No recipes in this publication yet. '
            : 'No recipes match these column filters.'}
          {activeRecipes.count === 0 && (
            <Link className="publication-empty-link" href="/publications">
              Back to Library
            </Link>
          )}
        </p>
      ) : view === 'details' ? (
        <div className="recipe-list-scroll publication-recipe-scroll">
          <table className="recipe-list publication-recipe-list">
            <thead>
              <tr>
                <th scope="col">{columnFilter('name')}</th>
                <th scope="col">{columnFilter('state')}</th>
                <th scope="col">{columnFilter('opinion')}</th>
                <th scope="col">{columnFilter('meal_type')}</th>
                <th scope="col">{columnFilter('food_type')}</th>
                <th scope="col">{columnFilter('total_time_minutes')}</th>
                <th scope="col">{columnFilter('publication_source')}</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((recipe) => {
                const details = recipeDetails.get(recipe.recipe_id);
                const opinion =
                  recipe.state === 'want_to_try'
                    ? (picklistById.get(details?.enthusiasm_id ?? '') ?? '—')
                    : recipe.state === 'tried'
                      ? (picklistById.get(details?.verdict_id ?? '') ?? '—')
                      : details?.reason || '—';
                const recipeUrl = details?.recipe_url ?? null;
                let recipeUrlHost = recipeUrl;
                if (recipeUrl) {
                  try {
                    recipeUrlHost = new URL(recipeUrl).host.replace(/^www\./i, '');
                  } catch {
                    recipeUrlHost = recipeUrl;
                  }
                }
                return (
                  <tr key={recipe.recipe_id}>
                    <td data-label="Name">
                      <Link href={`/recipes/${recipe.recipe_id}`}>{recipe.recipe_name}</Link>
                    </td>
                    <td data-label="State">{recipeStateLabels[recipe.state]}</td>
                    <td data-label="Opinion">{opinion}</td>
                    <td data-label="Meal Type">
                      {(assignmentsByRecipe.get(recipe.recipe_id) ?? []).join(', ') || '—'}
                    </td>
                    <td data-label="Food Type">
                      {details?.food_type_id
                        ? (foodTypeById.get(details.food_type_id) ?? '—')
                        : '—'}
                    </td>
                    <td data-label="Time">
                      {recipe.total_time_minutes === null
                        ? '—'
                        : `${recipe.total_time_minutes} min`}
                    </td>
                    <td data-label="Page or URL">
                      {details?.publication_page ??
                        (recipeUrl ? (
                          <a className="publication-recipe-url-link" href={recipeUrl}>
                            <span className="publication-recipe-url-host">{recipeUrlHost}</span>
                            <span className="publication-recipe-url-full">{recipeUrl}</span>
                          </a>
                        ) : (
                          '—'
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : view === 'list' ? (
        <ul className="publication-recipe-simple-list">
          {recipes.map((recipe) => (
            <li key={recipe.recipe_id}>
              <Link href={`/recipes/${recipe.recipe_id}`}>{recipe.recipe_name}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <AlternatingRecipeGrid>
          {recipes.map((recipe) => {
            const photo = recipePhotos.get(recipe.recipe_id);
            return (
              <li key={recipe.recipe_id}>
                <Link href={`/recipes/${recipe.recipe_id}`}>
                  {photo && (
                    <Image
                      alt={photo.description || `Photo of ${recipe.recipe_name}`}
                      className="find-recipes-card-image"
                      height={photo.height}
                      src={photo.thumbnail_url}
                      unoptimized
                      width={photo.width}
                    />
                  )}
                  <strong>{recipe.recipe_name}</strong>
                  <span className="find-recipes-grid-metadata">
                    {recipeStateLabels[recipe.state]}
                    <span aria-hidden="true"> ~ </span>
                    {recipe.total_time_minutes === null
                      ? 'No total time'
                      : `${recipe.total_time_minutes} min`}
                  </span>
                </Link>
              </li>
            );
          })}
        </AlternatingRecipeGrid>
      )}

      {pageCount > 1 && (
        <nav aria-label="Publication recipe pages" className="find-recipes-pagination">
          {page > 1 && <Link href={resultsHref(page - 1)}>Previous</Link>}
          <span aria-current="page">
            Page {page} of {pageCount}
          </span>
          {page < pageCount && <Link href={resultsHref(page + 1)}>Next</Link>}
        </nav>
      )}
    </section>
  );
}
