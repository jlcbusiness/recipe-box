import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
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
  getRecipeExplorerColumnValues,
  getRecipeMarkerStates,
  recipeStateLabels,
} from '../../../lib/recipes/data';
import {
  getRecipeSearchFacetValues,
  getRecipeSearchSortOptions,
  parseRecipeSearchColumnFilters,
  parseRecipeSearchFilters,
  type RecipeSearchColumnSelections,
  type RecipeSearchFacetOption,
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
import { FramedMediaImage } from '../../media/framed-media-image';
import { AlternatingRecipeGrid } from '../../recipes/find/alternating-recipe-grid';
import { RecipeColumnFilter } from '../../recipes/find/recipe-column-filter';
import { RecipeSearchToolbar } from '../../recipes/find/recipe-search-toolbar';
import { RecipeMarkerFilters } from '../../recipes/recipe-marker-filters';
import {
  RecipeGridMarkerIndicators,
  RecipeMarkerColumnHeader,
  RecipeMarkerIndicators,
  RecipeMarkerStamp,
} from '../../recipes/recipe-marker-icons';

const pageSize = 50;
const dateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});
const recipeViewOptions = [
  { value: 'details', label: 'Details' },
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
] as const;
type RecipeExplorerSearchParams = {
  filter?: string | string[];
  sort?: string;
  direction?: string;
  page?: string;
  view?: string;
  column_name?: string | string[];
  column_state?: string | string[];
  column_visibility?: string | string[];
  column_total_time_minutes?: string | string[];
  column_opinion?: string | string[];
  column_meal_type?: string | string[];
  column_food_type?: string | string[];
  column_publication_page?: string | string[];
  column_recipe_url?: string | string[];
  column_citation?: string | string[];
  column_publication_source?: string | string[];
};

function searchHref({
  path,
  columnSelections,
  filters,
  sortKey,
  sortDirection,
  page,
  view,
}: {
  path: string;
  columnSelections: RecipeSearchColumnSelections;
  filters: RecipeSearchFilter[];
  sortKey: RecipeSearchSortKey;
  sortDirection: 'asc' | 'desc';
  page: number;
  view: 'details' | 'grid' | 'list';
}) {
  const params = new URLSearchParams();
  for (const filter of filters) params.append('filter', JSON.stringify(filter));
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
  mobileToolbarActions,
}: {
  publicationId: string;
  searchParams: RecipeExplorerSearchParams;
  mobileToolbarActions: ReactNode;
}) {
  const parsedColumnFilters = parseRecipeSearchColumnFilters(searchParams);
  const columnFilters = parsedColumnFilters.filters;
  const columnSelections = parsedColumnFilters.selections;
  const filters = parseRecipeSearchFilters(searchParams.filter);
  const requestedPage = Math.max(
    1,
    Math.min(20_001, Number.parseInt(searchParams.page ?? '1', 10) || 1),
  );
  const sortDirection: 'asc' | 'desc' = searchParams.direction === 'desc' ? 'desc' : 'asc';
  const view =
    searchParams.view === 'grid' ? 'grid' : searchParams.view === 'list' ? 'list' : 'details';
  const supabase = await createClient();
  const path = `/publications/${publicationId}`;
  const context = `publication-recipes:${publicationId}` as const;
  const [rememberedState, recipeColumnSettings] = await Promise.all([
    getExplorerState(supabase, context),
    getRecipeColumnSettings(supabase),
  ]);
  const recipeColumns = getExplorerColumns(
    context,
    recipeColumnSettings.order,
    recipeColumnSettings.hiddenColumns,
  );
  if (!hasPersistedExplorerUrlState(context, searchParams)) {
    if (rememberedState) {
      redirect(serializeExplorerState(path, rememberedState, true));
    }
  }
  const displayPreferences =
    rememberedState?.display_preferences ??
    defaultExplorerDisplayPreferences(context, recipeColumns);
  const visibleColumnKeys = new Set(displayPreferences.visible_columns);
  const visibleSortColumns = recipeColumns.filter(
    ({ key, required }) => required || visibleColumnKeys.has(key),
  );
  const sortOptions = getRecipeSearchSortOptions([
    ...visibleSortColumns,
    ...(visibleSortColumns.some(({ key }) => key === 'score')
      ? []
      : [{ key: 'score', label: 'Rating' }]),
  ]);
  const sortKey = sortOptions.some(({ value }) => value === searchParams.sort)
    ? (searchParams.sort as RecipeSearchSortKey)
    : 'name';
  const toolbar = (
    <RecipeSearchToolbar
      columnSelections={columnSelections}
      direction={sortDirection}
      filters={filters}
      options={sortOptions}
      path={path}
      query=""
      sort={sortKey}
      view={view}
      viewOptions={[...recipeViewOptions]}
    />
  );
  const activeRecipes = await supabase
    .from('recipes')
    .select('id', { count: 'exact', head: true })
    .eq('publication_id', publicationId)
    .is('trashed_at', null);

  if (activeRecipes.error) {
    throw new Error('Unable to load publication recipes.');
  }

  const searchOptions = {
    filters: [...filters, ...(view === 'details' ? columnFilters : [])],
    sortKey,
    sortDirection,
    publicationId,
    limit: pageSize,
  };
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
  matchingCount ??= filters.length + columnFilters.length > 0 ? 0 : (activeRecipes.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(matchingCount / pageSize));
  if (page > pageCount) {
    page = pageCount;
    recipes = await searchRecipes(supabase, '', {
      ...searchOptions,
      offset: (page - 1) * pageSize,
    });
  }

  const recipeIds = recipes.map(({ recipe_id }) => recipe_id);
  const [recipeColumnValues, recipePhotos, recipeMarkerStates] = await Promise.all([
    view === 'details'
      ? getRecipeExplorerColumnValues(supabase, recipeIds)
      : Promise.resolve(new Map<string, Record<string, string | null>>()),
    view === 'grid' ? getPrimaryRecipePhotos(supabase, recipeIds) : Promise.resolve(new Map()),
    view !== 'details' ? getRecipeMarkerStates(supabase, recipeIds) : Promise.resolve(new Map()),
  ]);

  const facetFields = [
    ['name', 'name'],
    ['state', 'state'],
    ['total_time_minutes', 'total_time_minutes'],
    ['opinion', 'opinion'],
    ['meal_type', 'meal_type'],
    ['food_type', 'food_type'],
    ['publication_page', 'publication_page'],
    ['recipe_url', 'recipe_url'],
    ['citation', 'citation'],
  ] as const;
  const columnFacetEntries = await Promise.all(
    facetFields.map(
      async ([key, field]) =>
        [
          key,
          await getRecipeSearchFacetValues(
            supabase,
            '',
            [...filters, ...columnFilters.filter((columnFilter) => columnFilter.field !== field)],
            field,
            publicationId,
          ),
        ] as const,
    ),
  );
  const columnFacetOptions = {
    ...(Object.fromEntries(columnFacetEntries) as Record<
      | 'name'
      | 'state'
      | 'total_time_minutes'
      | 'opinion'
      | 'meal_type'
      | 'food_type'
      | 'publication_page'
      | 'recipe_url'
      | 'citation',
      RecipeSearchFacetOption[]
    >),
    visibility: [
      { value: 'private', label: 'Private' },
      { value: 'linkable', label: 'Linkable' },
    ],
  };

  const countLabel = `${matchingCount} ${matchingCount === 1 ? 'recipe' : 'recipes'} found`;
  const columnFilter = (field: keyof typeof columnFacetOptions) => (
    <RecipeColumnFilter
      action={path}
      baseFilters={filters}
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
  const isFilterColumn = (key: string): key is keyof typeof columnFacetOptions =>
    key in columnFacetOptions;
  const resultsHref = (nextPage: number) =>
    searchHref({
      path,
      columnSelections,
      filters,
      sortKey,
      sortDirection,
      page: nextPage,
      view,
    });
  const explorerState = createExplorerState(context, {
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
    <section aria-label="Publication recipes" className="publication-recipe-explorer">
      {explorerState && <ExplorerStatePersistence context={context} state={explorerState} />}
      <ExplorerListPreferences
        columnDefinitions={recipeColumns}
        context={context}
        initialPreferences={displayPreferences}
        showControl={view === 'details'}
        state={
          explorerState ?? {
            schema_version: 1,
            filters: [],
            sort: sortKey,
            direction: sortDirection,
            view,
          }
        }
        toolbar={toolbar}
        toolbarTrailing={
          <RecipeMarkerFilters
            action={path}
            columnSelections={columnSelections}
            direction={sortDirection}
            filters={filters}
            sort={sortKey}
            view={view}
          />
        }
        toolbarAction={mobileToolbarActions}
      >
        <p className="find-recipes-count" role="status">
          {countLabel}
        </p>

        {view === 'details' && (
          <nav
            aria-label="Filter publication recipe columns"
            className="find-recipes-mobile-filters"
          >
            {(
              [
                'name',
                'state',
                'visibility',
                'opinion',
                'meal_type',
                'food_type',
                'total_time_minutes',
                'publication_page',
                'recipe_url',
                'citation',
              ] as const
            ).map((field) => (
              <span data-explorer-column={field} key={field}>
                {columnFilter(field)}
              </span>
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
                  {recipeColumns.map(({ key, label }) => (
                    <th data-explorer-column={key} key={key} scope="col">
                      {isFilterColumn(key) ? (
                        columnFilter(key)
                      ) : key === 'starred' ? (
                        <RecipeMarkerColumnHeader label={label} marker="star" />
                      ) : key === 'hearted' ? (
                        <RecipeMarkerColumnHeader label={label} marker="heart" />
                      ) : key === 'score' ? (
                        <abbr title="Rating">Rtg</abbr>
                      ) : (
                        label
                      )}
                      <ExplorerColumnResizeHandle column={key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => {
                  const details = recipeColumnValues.get(recipe.recipe_id);
                  return (
                    <tr key={recipe.recipe_id}>
                      {recipeColumns.map(({ key, label }) => {
                        let value = details?.[key] ?? null;
                        if (key === 'name') value = recipe.recipe_name;
                        if (key === 'state') value = recipeStateLabels[recipe.state];
                        if (key === 'created_at' || key === 'updated_at') {
                          value = value ? dateFormatter.format(new Date(value)) : null;
                        } else if (key.endsWith('_time_minutes')) {
                          value = value ? `${value} min` : null;
                        }

                        return (
                          <td data-explorer-column={key} data-label={label} key={key}>
                            {key === 'name' ? (
                              <Link
                                className="publication-recipe-title-link"
                                href={`/recipes/${recipe.recipe_id}`}
                              >
                                <span className="mobile-details-title-row">
                                  <span className="mobile-details-title-text">
                                    {recipe.recipe_name}
                                  </span>
                                  {(details?.starred === 'true' || details?.hearted === 'true') && (
                                    <span className="mobile-details-title-markers">
                                      {details?.starred === 'true' && (
                                        <span data-explorer-column="starred">
                                          <RecipeMarkerStamp label="Starred" marker="star" />
                                        </span>
                                      )}
                                      {details?.hearted === 'true' && (
                                        <span data-explorer-column="hearted">
                                          <RecipeMarkerStamp label="Hearted" marker="heart" />
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </span>
                              </Link>
                            ) : key === 'starred' || key === 'hearted' ? (
                              details?.[key] === 'true' ? (
                                <RecipeMarkerStamp
                                  label={key === 'starred' ? 'Starred' : 'Hearted'}
                                  marker={key === 'starred' ? 'star' : 'heart'}
                                />
                              ) : null
                            ) : key === 'score' && value !== null ? (
                              <span
                                className={Number(value) < 0 ? 'recipe-score-negative' : undefined}
                              >
                                {value}
                              </span>
                            ) : key === 'recipe_url' && value ? (
                              <a className="publication-recipe-url-link" href={value}>
                                <span className="publication-recipe-url-host">
                                  {new URL(value).hostname.replace(/^www\./i, '')}
                                </span>
                                <span className="publication-recipe-url-full">{value}</span>
                              </a>
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
          <ul className="publication-recipe-simple-list">
            {recipes.map((recipe) => {
              const markerState = recipeMarkerStates.get(recipe.recipe_id);
              return (
                <li key={recipe.recipe_id}>
                  <div className="recipe-explorer-simple-list-row">
                    <Link href={`/recipes/${recipe.recipe_id}`}>{recipe.recipe_name}</Link>
                    <span className="recipe-explorer-list-signals">
                      {markerState?.score !== null && markerState?.score !== undefined && (
                        <span className="recipe-score-indicator">
                          <span className="visually-hidden">Rating </span>
                          <span
                            className={markerState.score < 0 ? 'recipe-score-negative' : undefined}
                          >
                            {markerState.score}
                          </span>
                        </span>
                      )}
                      <RecipeMarkerIndicators
                        starred={markerState?.is_starred ?? false}
                        hearted={markerState?.is_hearted ?? false}
                      />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <AlternatingRecipeGrid>
            {recipes.map((recipe) => {
              const photo = recipePhotos.get(recipe.recipe_id);
              const markerState = recipeMarkerStates.get(recipe.recipe_id);
              return (
                <li key={recipe.recipe_id}>
                  <Link href={`/recipes/${recipe.recipe_id}`}>
                    <RecipeGridMarkerIndicators
                      starred={markerState?.is_starred ?? false}
                      hearted={markerState?.is_hearted ?? false}
                      score={markerState?.score}
                    />
                    {photo && (
                      <FramedMediaImage
                        alt={photo.description || `Photo of ${recipe.recipe_name}`}
                        className="find-recipes-card-image"
                        crop={photo.crop}
                        displayHeight={photo.display_height}
                        displayWidth={photo.display_width}
                        height={photo.height}
                        src={photo.thumbnail_url}
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
      </ExplorerListPreferences>
    </section>
  );
}
