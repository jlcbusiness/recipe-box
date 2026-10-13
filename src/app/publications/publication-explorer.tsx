// biome-ignore-all lint/a11y/noRedundantRoles: Explicit roles preserve table semantics after display: contents.
'use client';

import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  BookOpen,
  Check,
  Globe,
  LayoutGrid,
  Library,
  List,
  Newspaper,
  Settings2,
} from 'lucide-react';
import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { Fragment, useEffect, useRef, useState } from 'react';
import type {
  PublicationSearchFilter,
  PublicationSearchResult,
  PublicationSearchSortKey,
} from '../../lib/publications/search';
import type { PublicationType } from '../../lib/recipes/data';
import { PublicationCommaList } from './publication-comma-list';
import { PublicationCover } from './publication-cover';
import { PublicationFilterBuilder } from './publication-filter-builder';

type ExplorerPublication = PublicationSearchResult & {
  id: string;
  cover_image_url: string | null;
};
type PublicationFilter = 'all' | PublicationType;
type ViewMode = 'list' | 'grid';
type SortKey = PublicationSearchSortKey;
type ExplorerMenu = 'type' | 'sort-key' | 'columns';
type ColumnKey = 'author' | 'edition' | 'recipe_count' | 'tags' | 'created_at' | 'updated_at';
type ExplorerState = {
  query: string;
  filters: PublicationSearchFilter[];
  type: PublicationFilter;
  sort: SortKey;
  direction: 'asc' | 'desc';
  view: ViewMode;
  page: number;
};

const columnLabels: Record<ColumnKey, string> = {
  author: 'Author',
  edition: 'Edition / Issue',
  recipe_count: 'Recipes',
  tags: 'Tags',
  created_at: 'Date Added',
  updated_at: 'Date Changed',
};

function explorerHref(state: ExplorerState, changes: Partial<ExplorerState> = {}) {
  const next = { ...state, ...changes };
  const params = new URLSearchParams();
  if (next.query) params.set('q', next.query);
  for (const filter of next.filters) params.append('filter', JSON.stringify(filter));
  if (next.type !== 'all') params.set('type', next.type);
  params.set('sort', next.sort);
  params.set('direction', next.direction);
  params.set('view', next.view);
  params.set('page', String(next.page));
  return `/publications?${params.toString()}`;
}

const publicationTypeLabels: Record<PublicationType, string> = {
  book: 'Book',
  magazine: 'Magazine',
  site: 'Site',
};
const filterLabels: Record<PublicationFilter, string> = {
  all: 'All',
  book: 'Books',
  magazine: 'Magazines',
  site: 'Sites',
};
const sortLabels: Record<SortKey, string> = {
  relevance: 'Relevance',
  name: 'Name',
  type: 'Type',
  author: 'Author',
  edition: 'Edition',
  recipe_count: 'Recipe count',
  created_at: 'Date Added',
  updated_at: 'Date Changed',
};

const dateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function tooltipText(publication: ExplorerPublication) {
  return [
    publicationTypeLabels[publication.publication_type],
    publication.author ? `Author: ${publication.author}` : null,
    publication.edition || publication.issue
      ? `Edition / Issue: ${publication.edition || publication.issue}`
      : null,
    `Recipes: ${publication.recipe_count}`,
    `Date Added: ${formatDate(publication.created_at)}`,
    `Date Changed: ${formatDate(publication.updated_at)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function PublicationTypeIcon({ type }: { type: PublicationFilter }) {
  const className = `publication-type-icon publication-type-icon-${type}`;
  const props = { 'aria-hidden': true as const, className, size: 18, strokeWidth: 1.8 };

  if (type === 'book') return <BookOpen {...props} />;
  if (type === 'magazine') return <Newspaper {...props} />;
  if (type === 'site') return <Globe {...props} />;
  return <Library {...props} />;
}

function SelectedMark({ selected }: { selected: boolean }) {
  return selected ? (
    <Check aria-hidden="true" size={16} />
  ) : (
    <span className="publication-menu-spacer" />
  );
}

function AuthorLines({ authors }: { authors: string }) {
  const authorOccurrences = new Map<string, number>();

  return authors
    .split(',')
    .map((author) => author.trim())
    .filter(Boolean)
    .map((author, index) => {
      const occurrence = authorOccurrences.get(author) ?? 0;
      authorOccurrences.set(author, occurrence + 1);

      return (
        <Fragment key={`${author}-${occurrence}`}>
          {index > 0 && (
            <>
              <br className="publication-grid-author-break" />
              <span className="publication-grid-author-separator">, </span>
            </>
          )}
          {author}
        </Fragment>
      );
    });
}

function AuthorNames({ authors }: { authors: string }) {
  return (
    <PublicationCommaList
      itemClassName="publication-list-author-name"
      values={authors
        .split(',')
        .map((author) => author.trim())
        .filter(Boolean)}
    />
  );
}

function MenuLink({
  href,
  children,
  selected,
}: {
  href: string;
  children: ReactNode;
  selected: boolean;
}) {
  return (
    <Link
      aria-current={selected ? 'true' : undefined}
      className="publication-explorer-menu-option"
      href={href}
    >
      {children}
      <SelectedMark selected={selected} />
    </Link>
  );
}

export function PublicationExplorer({
  publications,
  query,
  filters,
  type,
  sort,
  direction,
  view,
  page,
  pageCount,
  totalCount,
  emptyCatalog,
  searchError,
  tagOptions,
}: {
  publications: ExplorerPublication[];
  query: string;
  filters: PublicationSearchFilter[];
  type: PublicationFilter;
  sort: SortKey;
  direction: 'asc' | 'desc';
  view: ViewMode;
  page: number;
  pageCount: number;
  totalCount: number;
  emptyCatalog: boolean;
  searchError: string | null;
  tagOptions: { value: string; label: string }[];
}) {
  const [isMobile, setIsMobile] = useState(false);
  const [openMenu, setOpenMenu] = useState<ExplorerMenu | null>(null);
  const [columns, setColumns] = useState<Record<ColumnKey, boolean>>({
    author: true,
    edition: true,
    recipe_count: true,
    tags: false,
    created_at: false,
    updated_at: false,
  });
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const activeTrigger = useRef<HTMLButtonElement | null>(null);
  const viewMode: ViewMode = isMobile && view === 'grid' ? 'list' : view;
  const state: ExplorerState = { query, filters, type, sort, direction, view: viewMode, page };
  const stateKey = JSON.stringify(state);
  const previousStateKey = useRef(stateKey);
  const visibleColumns = (Object.keys(columnLabels) as ColumnKey[]).filter(
    (column) => columns[column],
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const updateViewport = () => setIsMobile(media.matches);
    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    if (previousStateKey.current !== stateKey) {
      setOpenMenu(null);
      previousStateKey.current = stateKey;
    }
  }, [stateKey]);

  useEffect(() => {
    if (!openMenu) return;

    function closeOnOutsideInteraction(event: PointerEvent | FocusEvent) {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpenMenu(null);
        activeTrigger.current?.focus();
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideInteraction);
    document.addEventListener('focusin', closeOnOutsideInteraction);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction);
      document.removeEventListener('focusin', closeOnOutsideInteraction);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu]);

  const sortedPublications = publications;

  function toggleMenu(menu: ExplorerMenu, event: MouseEvent<HTMLButtonElement>) {
    activeTrigger.current = event.currentTarget;
    setOpenMenu((current) => (current === menu ? null : menu));
  }

  return (
    <section className="publication-explorer" aria-label="Publication Explorer">
      <div className="publication-explorer-toolbar" ref={toolbarRef}>
        <div className="publication-explorer-control publication-explorer-control-type">
          <button
            aria-controls="publication-type-options"
            aria-expanded={openMenu === 'type'}
            aria-label={`Type: ${filterLabels[type]}`}
            className="publication-explorer-trigger publication-explorer-type-trigger"
            onClick={(event) => toggleMenu('type', event)}
            title={`Type: ${filterLabels[type]}`}
            type="button"
          >
            <PublicationTypeIcon type={type} />
            <span className="publication-explorer-trigger-label">{filterLabels[type]}</span>
          </button>
          {openMenu === 'type' && (
            <fieldset
              aria-label="Publication type options"
              className="publication-explorer-popover"
              id="publication-type-options"
            >
              <legend>Publication type options</legend>
              {(Object.keys(filterLabels) as PublicationFilter[]).map((value) => (
                <MenuLink
                  key={value}
                  href={explorerHref(state, { type: value, page: 1 })}
                  selected={type === value}
                >
                  <PublicationTypeIcon type={value} />
                  <span>{filterLabels[value]}</span>
                </MenuLink>
              ))}
            </fieldset>
          )}
        </div>

        <div className="publication-explorer-control publication-explorer-control-sort">
          <button
            aria-controls="publication-sort-options"
            aria-expanded={openMenu === 'sort-key'}
            aria-label={`Sort by ${sortLabels[sort]}`}
            className="publication-explorer-trigger publication-explorer-icon-trigger"
            onClick={(event) => toggleMenu('sort-key', event)}
            title={`Sort by ${sortLabels[sort]}`}
            type="button"
          >
            <ArrowDownWideNarrow aria-hidden="true" size={19} />
          </button>
          {openMenu === 'sort-key' && (
            <fieldset
              aria-label="Sort options"
              className="publication-explorer-popover publication-explorer-sort-popover"
              id="publication-sort-options"
            >
              <legend>Sort options</legend>
              <div className="publication-sort-keys">
                {(Object.keys(sortLabels) as SortKey[]).map((value) => (
                  <MenuLink
                    key={value}
                    href={explorerHref(state, { sort: value, page: 1 })}
                    selected={sort === value}
                  >
                    <span>{sortLabels[value]}</span>
                  </MenuLink>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        <div className="publication-explorer-control publication-explorer-control-sort-direction">
          <Link
            aria-label={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
            className="publication-explorer-trigger publication-explorer-icon-trigger"
            href={explorerHref(state, {
              direction: direction === 'asc' ? 'desc' : 'asc',
              page: 1,
            })}
            title={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
          >
            {direction === 'asc' ? (
              <ArrowUp aria-hidden="true" size={19} />
            ) : (
              <ArrowDown aria-hidden="true" size={19} />
            )}
          </Link>
        </div>

        <div className="publication-explorer-control publication-explorer-control-view">
          <Link
            aria-label={`Switch to ${viewMode === 'list' ? 'Grid' : 'List'} view`}
            aria-current={viewMode === 'grid' ? 'true' : undefined}
            className="publication-explorer-trigger publication-explorer-icon-trigger"
            href={explorerHref(state, { view: viewMode === 'list' ? 'grid' : 'list', page: 1 })}
            title={`Switch to ${viewMode === 'list' ? 'Grid' : 'List'} view`}
          >
            {viewMode === 'list' ? (
              <List aria-hidden="true" size={19} />
            ) : (
              <LayoutGrid aria-hidden="true" size={19} />
            )}
          </Link>
        </div>

        <div className="publication-explorer-control publication-explorer-control-columns">
          <button
            aria-controls="publication-column-options"
            aria-expanded={openMenu === 'columns'}
            aria-label="Choose List columns"
            className="publication-explorer-trigger publication-explorer-icon-trigger"
            onClick={(event) => toggleMenu('columns', event)}
            title="Choose List columns"
            type="button"
          >
            <Settings2 aria-hidden="true" size={19} />
          </button>
          {openMenu === 'columns' && (
            <fieldset
              aria-label="List columns"
              className="publication-explorer-popover publication-explorer-column-popover"
              id="publication-column-options"
            >
              <legend>List columns</legend>
              <span className="publication-explorer-column-required">Name</span>
              {(Object.keys(columnLabels) as ColumnKey[]).map((column) => (
                <label className="publication-explorer-column-option" key={column}>
                  <input
                    checked={columns[column]}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setColumns((current) => ({ ...current, [column]: checked }));
                    }}
                    type="checkbox"
                  />
                  {columnLabels[column]}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </div>

      <div className="publication-explorer-search-controls">
        <form action="/publications" className="publication-search-form" method="get">
          <label htmlFor="publication-search">Search publications</label>
          <div className="publication-search-input-row">
            <input
              autoComplete="off"
              id="publication-search"
              maxLength={500}
              name="q"
              type="search"
              defaultValue={query}
            />
            <button className="recipe-primary-button" type="submit">
              Search
            </button>
            {query && (
              <Link
                className="recipe-secondary-link"
                href={explorerHref(state, { query: '', page: 1 })}
              >
                Clear search
              </Link>
            )}
          </div>
          {filters.map((filter) => (
            <input
              key={JSON.stringify(filter)}
              name="filter"
              type="hidden"
              value={JSON.stringify(filter)}
            />
          ))}
          {type !== 'all' && <input name="type" type="hidden" value={type} />}
          <input name="sort" type="hidden" value={sort} />
          <input name="direction" type="hidden" value={direction} />
          <input name="view" type="hidden" value={viewMode} />
        </form>
        <PublicationFilterBuilder
          direction={direction}
          filters={filters}
          query={query}
          sort={sort}
          tagOptions={tagOptions}
          type={type}
          view={viewMode}
        />
      </div>

      <div className="publication-explorer-results">
        <p aria-live="polite" className="publication-explorer-result-count">
          {searchError
            ? 'Publication results unavailable.'
            : `${totalCount} ${totalCount === 1 ? 'publication' : 'publications'}`}
        </p>
        {searchError ? (
          <p className="recipe-empty-state" role="alert">
            {searchError}
          </p>
        ) : totalCount === 0 ? (
          <p className="recipe-empty-state">
            {emptyCatalog
              ? 'No publications yet.'
              : 'No publications match this search and filter combination.'}
          </p>
        ) : viewMode === 'list' && sortedPublications.length > 0 ? (
          <>
            <div className="recipe-list-scroll publication-explorer-scroll publication-explorer-table-wrap">
              <table
                className="recipe-list publication-explorer-table"
                role="table"
                style={{
                  gridTemplateColumns: `repeat(${1 + visibleColumns.length}, minmax(0, 1fr))`,
                }}
              >
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">
                      Name
                    </th>
                    {visibleColumns.map((column) => (
                      <th key={column} role="columnheader" scope="col">
                        {columnLabels[column] === 'Edition / Issue'
                          ? 'Edition'
                          : columnLabels[column]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {sortedPublications.map((publication) => (
                    <tr key={publication.id} role="row">
                      <td data-label="Name" role="cell">
                        <div className="publication-explorer-table-name">
                          <span
                            aria-label={publicationTypeLabels[publication.publication_type]}
                            className="publication-explorer-table-type"
                            role="img"
                            title={publicationTypeLabels[publication.publication_type]}
                          >
                            <PublicationTypeIcon type={publication.publication_type} />
                          </span>
                          <Link
                            href={`/publications/${publication.id}`}
                            title={tooltipText(publication)}
                          >
                            {publication.name}
                          </Link>
                        </div>
                      </td>
                      {visibleColumns.map((column) => (
                        <td data-label={columnLabels[column]} key={column} role="cell">
                          {column === 'author' ? (
                            publication.author ? (
                              <AuthorNames authors={publication.author} />
                            ) : (
                              '—'
                            )
                          ) : column === 'edition' ? (
                            publication.edition || publication.issue || '—'
                          ) : column === 'recipe_count' ? (
                            publication.recipe_count
                          ) : column === 'tags' ? (
                            publication.tag_names.join(', ') || '—'
                          ) : column === 'created_at' ? (
                            formatDate(publication.created_at)
                          ) : (
                            formatDate(publication.updated_at)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="publication-explorer-mobile-list">
              {sortedPublications.map((publication) => (
                <li key={publication.id}>
                  <PublicationTypeIcon type={publication.publication_type} />
                  <Link
                    className="publication-explorer-mobile-link"
                    href={`/publications/${publication.id}`}
                    title={tooltipText(publication)}
                  >
                    {publication.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : sortedPublications.length > 0 ? (
          <ul className="publication-explorer-grid">
            {sortedPublications.map((publication) => (
              <li className="publication-explorer-card" key={publication.id}>
                <Link
                  aria-label={publication.name}
                  className={
                    publication.publication_type === 'site'
                      ? 'publication-explorer-card-link publication-explorer-card-link-site'
                      : 'publication-explorer-card-link'
                  }
                  href={`/publications/${publication.id}`}
                  title={tooltipText(publication)}
                >
                  <PublicationCover
                    imageUrl={publication.cover_image_url}
                    publication={publication}
                  />
                  <span className="publication-list-copy">
                    <span className="publication-list-title">{publication.name}</span>
                    {publication.author && (
                      <span className="publication-list-detail publication-grid-authors">
                        <AuthorLines authors={publication.author} />
                      </span>
                    )}
                    <span className="publication-list-detail">
                      {publication.recipe_count}{' '}
                      {publication.recipe_count === 1 ? 'recipe' : 'recipes'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {pageCount > 1 && (
          <nav aria-label="Publication result pages" className="publication-explorer-pagination">
            {page > 1 ? (
              <Link href={explorerHref(state, { page: page - 1 })}>Previous</Link>
            ) : (
              <span aria-disabled="true">Previous</span>
            )}
            <span aria-current="page">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={explorerHref(state, { page: page + 1 })}>Next</Link>
            ) : (
              <span aria-disabled="true">Next</span>
            )}
          </nav>
        )}
      </div>
    </section>
  );
}
