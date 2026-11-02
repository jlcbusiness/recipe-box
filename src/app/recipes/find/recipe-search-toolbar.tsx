'use client';

import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  FilterX,
  LayoutGrid,
  List,
  Rows3,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  RecipeSearchColumnSelections,
  RecipeSearchFilter,
  RecipeSearchSortKey,
} from '../../../lib/recipes/search';
import { Picklist } from '../../picklist';
import { useMobileHand } from '../../private-shell';
import { useRecipeSearchMode } from './recipe-search-tabs';

type SortOption = { value: RecipeSearchSortKey; label: string };
type RecipeExplorerView = 'details' | 'grid' | 'list';

function preservedFilters(
  mode: 'search' | 'query' | undefined,
  filters: RecipeSearchFilter[],
): RecipeSearchFilter[] {
  return mode === 'search'
    ? filters.filter(({ field }) => field === 'starred' || field === 'hearted')
    : filters;
}

function controlHref({
  path,
  query,
  filters,
  columnSelections,
  sort,
  direction,
  view,
  tab,
  querySubmitted = false,
  page = 1,
  mainIngredientsOnly = false,
}: {
  path: string;
  query: string;
  filters: RecipeSearchFilter[];
  columnSelections: RecipeSearchColumnSelections;
  sort: RecipeSearchSortKey;
  direction: 'asc' | 'desc';
  view: RecipeExplorerView;
  tab?: 'search' | 'query';
  querySubmitted?: boolean;
  page?: number;
  mainIngredientsOnly?: boolean;
}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (mainIngredientsOnly) params.set('main', '1');
  for (const filter of filters) params.append('filter', JSON.stringify(filter));
  for (const [key, values] of Object.entries(columnSelections)) {
    if (values === undefined) continue;
    const name = `column_${key}`;
    if (values.length === 0) params.append(name, '__none__');
    else for (const value of values) params.append(name, value);
  }
  params.set('sort', sort);
  params.set('direction', direction);
  params.set('page', String(page));
  params.set('view', view);
  if (tab) params.set('tab', tab);
  if (querySubmitted) params.set('query_submitted', '1');
  return `${path}?${params.toString()}`;
}

export function RecipeSearchToolbar({
  columnSelections,
  direction,
  filters,
  mainIngredientsOnly = false,
  options,
  path,
  query,
  querySubmitted = false,
  sort,
  view,
  viewOptions,
}: {
  columnSelections: RecipeSearchColumnSelections;
  direction: 'asc' | 'desc';
  filters: RecipeSearchFilter[];
  mainIngredientsOnly?: boolean;
  options: SortOption[];
  path: string;
  query: string;
  querySubmitted?: boolean;
  sort: RecipeSearchSortKey;
  view: RecipeExplorerView;
  viewOptions?: { value: RecipeExplorerView; label: string }[];
}) {
  const router = useRouter();
  const searchMode = useRecipeSearchMode();
  const hand = useMobileHand();

  const hrefFor = (next: {
    sort?: RecipeSearchSortKey;
    direction?: 'asc' | 'desc';
    view?: RecipeExplorerView;
  }) =>
    controlHref({
      path,
      query: searchMode?.mode === 'search' ? query : '',
      mainIngredientsOnly: searchMode?.mode === 'search' && mainIngredientsOnly,
      filters: preservedFilters(searchMode?.mode, filters),
      columnSelections,
      sort: next.sort ?? sort,
      direction: next.direction ?? direction,
      view: next.view ?? view,
      tab: searchMode?.mode,
      querySubmitted,
    });
  const nextViewOption = viewOptions
    ? viewOptions[
        (viewOptions.findIndex((option) => option.value === view) + 1) % viewOptions.length
      ]
    : undefined;
  const nextView = nextViewOption?.value ?? (view === 'list' ? 'grid' : 'list');
  const nextViewLabel = nextViewOption?.label ?? (nextView === 'grid' ? 'Grid' : 'List');

  const viewControl = (
    <button
      key="view"
      aria-label={`Switch to ${nextViewLabel} view`}
      aria-pressed={view === 'grid'}
      className="recipe-explorer-trigger recipe-explorer-icon-trigger"
      onClick={() => {
        router.push(hrefFor({ view: nextView }));
      }}
      title={`Switch to ${nextViewLabel} view`}
      type="button"
    >
      {view === 'details' ? (
        <Rows3 aria-hidden="true" size={19} />
      ) : view === 'list' ? (
        <List aria-hidden="true" size={19} />
      ) : (
        <LayoutGrid aria-hidden="true" size={19} />
      )}
    </button>
  );
  const sortControl = (
    <div key="sort" className="recipe-explorer-control recipe-explorer-control-sort">
      <Picklist
        className="recipe-explorer-sort-picklist"
        label={`Sort by ${options.find(({ value }) => value === sort)?.label ?? 'Name'}`}
        menuClassName="recipe-explorer-sort-menu"
        onSelect={(value) => router.push(hrefFor({ sort: value as RecipeSearchSortKey }))}
        options={options}
        showArrow={false}
        sizeToContent={false}
        title={`Sort by ${options.find(({ value }) => value === sort)?.label ?? 'Name'}`}
        value={sort}
      >
        <ArrowDownWideNarrow aria-hidden="true" size={19} />
      </Picklist>
    </div>
  );
  const directionControl = (
    <Link
      key="direction"
      aria-label={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
      className="recipe-explorer-trigger recipe-explorer-icon-trigger"
      href={hrefFor({ direction: direction === 'asc' ? 'desc' : 'asc' })}
      title={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
    >
      {direction === 'asc' ? (
        <ArrowUp aria-hidden="true" size={19} />
      ) : (
        <ArrowDown aria-hidden="true" size={19} />
      )}
    </Link>
  );
  const controls =
    view === 'details' ? [viewControl] : [viewControl, sortControl, directionControl];
  return (
    <fieldset className="recipe-explorer-toolbar">
      <legend className="sr-only">Recipe result controls</legend>
      <fieldset
        className={`recipe-explorer-view-controls${view === 'details' ? ' recipe-explorer-view-controls-details' : ''}`}
      >
        <legend className="sr-only">
          {view === 'details' ? 'View controls' : 'View and sort controls'}
        </legend>
        {path === '/recipes/find' && hand === 'right' ? [...controls].reverse() : controls}
      </fieldset>
    </fieldset>
  );
}

export function RecipeSearchClearFilters({
  direction,
  path,
  query,
  querySubmitted = false,
  sort,
  view,
  placement = 'toolbar',
}: {
  direction: 'asc' | 'desc';
  path: string;
  query: string;
  querySubmitted?: boolean;
  sort: RecipeSearchSortKey;
  view: RecipeExplorerView;
  placement?: 'toolbar' | 'mobile-details';
}) {
  const router = useRouter();
  const searchMode = useRecipeSearchMode();
  const clearHref = controlHref({
    path,
    query: searchMode?.mode === 'search' ? query : '',
    mainIngredientsOnly: false,
    filters: [],
    columnSelections: {},
    sort,
    direction,
    view,
    tab: searchMode?.mode,
    querySubmitted,
  });
  const placementClass = [
    `recipe-explorer-clear-filters-${placement}`,
    placement === 'toolbar' && view === 'details'
      ? 'recipe-explorer-clear-filters-for-details'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`recipe-explorer-clear-filters-container ${placementClass}`}>
      <button
        aria-label="Clear all filters"
        className="recipe-explorer-trigger recipe-explorer-clear-filters"
        onClick={() => router.push(clearHref)}
        title="Clear all filters"
        type="button"
      >
        <FilterX aria-hidden="true" size={17} />
        <span>Clear all</span>
      </button>
    </div>
  );
}

export function RecipeSearchPagination({
  columnSelections,
  direction,
  filters,
  mainIngredientsOnly = false,
  page,
  pageCount,
  path,
  query,
  querySubmitted = false,
  sort,
  view,
}: {
  columnSelections: RecipeSearchColumnSelections;
  direction: 'asc' | 'desc';
  filters: RecipeSearchFilter[];
  mainIngredientsOnly?: boolean;
  page: number;
  pageCount: number;
  path: string;
  query: string;
  querySubmitted?: boolean;
  sort: RecipeSearchSortKey;
  view: RecipeExplorerView;
}) {
  const searchMode = useRecipeSearchMode();
  const hrefForPage = (nextPage: number) =>
    controlHref({
      path,
      query: searchMode?.mode === 'search' ? query : '',
      mainIngredientsOnly: searchMode?.mode === 'search' && mainIngredientsOnly,
      filters: preservedFilters(searchMode?.mode, filters),
      columnSelections,
      sort,
      direction,
      view,
      tab: searchMode?.mode,
      querySubmitted,
      page: nextPage,
    });

  return (
    <nav aria-label="Recipe result pages" className="find-recipes-pagination">
      {page > 1 && <Link href={hrefForPage(page - 1)}>Previous</Link>}
      <span aria-current="page">
        Page {page} of {pageCount}
      </span>
      {page < pageCount && <Link href={hrefForPage(page + 1)}>Next</Link>}
    </nav>
  );
}
