'use client';

import { ArrowDown, ArrowDownWideNarrow, ArrowUp, LayoutGrid, List } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  RecipeSearchColumnSelections,
  RecipeSearchFilter,
  RecipeSearchSortKey,
} from '../../../lib/recipes/search';
import { Picklist } from '../../picklist';
import { useRecipeSearchMode } from './recipe-search-tabs';

type SortOption = { value: RecipeSearchSortKey; label: string };

function controlHref({
  path,
  query,
  filters,
  columnSelections,
  sort,
  direction,
  view,
  tab,
  page = 1,
}: {
  path: string;
  query: string;
  filters: RecipeSearchFilter[];
  columnSelections: RecipeSearchColumnSelections;
  sort: RecipeSearchSortKey;
  direction: 'asc' | 'desc';
  view: 'list' | 'grid';
  tab?: 'search' | 'query';
  page?: number;
}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
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
  return `${path}?${params.toString()}`;
}

export function RecipeSearchToolbar({
  columnSelections,
  direction,
  filters,
  options,
  path,
  query,
  sort,
  view,
}: {
  columnSelections: RecipeSearchColumnSelections;
  direction: 'asc' | 'desc';
  filters: RecipeSearchFilter[];
  options: SortOption[];
  path: string;
  query: string;
  sort: RecipeSearchSortKey;
  view: 'list' | 'grid';
}) {
  const router = useRouter();
  const searchMode = useRecipeSearchMode();

  const hrefFor = (next: {
    sort?: RecipeSearchSortKey;
    direction?: 'asc' | 'desc';
    view?: 'list' | 'grid';
  }) =>
    controlHref({
      path,
      query: searchMode?.mode === 'search' ? query : '',
      filters: searchMode?.mode === 'query' ? filters : [],
      columnSelections,
      sort: next.sort ?? sort,
      direction: next.direction ?? direction,
      view: next.view ?? view,
      tab: searchMode?.mode,
    });

  return (
    <fieldset className="recipe-explorer-toolbar">
      <legend className="sr-only">Recipe result controls</legend>
      <div className="recipe-explorer-control recipe-explorer-control-sort">
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
      <Link
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
      <button
        aria-label={`Switch to ${view === 'list' ? 'Grid' : 'List'} view`}
        aria-pressed={view === 'grid'}
        className="recipe-explorer-trigger recipe-explorer-icon-trigger"
        onClick={() => router.push(hrefFor({ view: view === 'list' ? 'grid' : 'list' }))}
        title={`Switch to ${view === 'list' ? 'Grid' : 'List'} view`}
        type="button"
      >
        {view === 'list' ? (
          <List aria-hidden="true" size={19} />
        ) : (
          <LayoutGrid aria-hidden="true" size={19} />
        )}
      </button>
    </fieldset>
  );
}

export function RecipeSearchPagination({
  columnSelections,
  direction,
  filters,
  page,
  pageCount,
  path,
  query,
  sort,
  view,
}: {
  columnSelections: RecipeSearchColumnSelections;
  direction: 'asc' | 'desc';
  filters: RecipeSearchFilter[];
  page: number;
  pageCount: number;
  path: string;
  query: string;
  sort: RecipeSearchSortKey;
  view: 'list' | 'grid';
}) {
  const searchMode = useRecipeSearchMode();
  const hrefForPage = (nextPage: number) =>
    controlHref({
      path,
      query: searchMode?.mode === 'search' ? query : '',
      filters: searchMode?.mode === 'query' ? filters : [],
      columnSelections,
      sort,
      direction,
      view,
      tab: searchMode?.mode,
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
