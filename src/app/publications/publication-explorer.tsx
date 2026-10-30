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
} from 'lucide-react';
import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { createExplorerState, type ExplorerDisplayPreferences } from '../../lib/explorer-state';
import type { CropRect } from '../../lib/media/rules';
import type {
  PublicationSearchFilter,
  PublicationSearchResult,
  PublicationSearchSortKey,
} from '../../lib/publications/search';
import type { PublicationType } from '../../lib/recipes/data';
import { ExplorerColumnResizeHandle, ExplorerListPreferences } from '../explorer-list-preferences';
import { ExplorerStatePersistence } from '../explorer-state-persistence';
import { PublicationColumnFilter } from './publication-column-filter';
import { PublicationCommaList } from './publication-comma-list';
import { PublicationCover } from './publication-cover';

type ExplorerPublication = PublicationSearchResult & {
  id: string;
  cover_image_url: string | null;
  cover_crop: CropRect | null;
  cover_image_width: number;
  cover_image_height: number;
  cover_display_width: number;
  cover_display_height: number;
};
type PublicationFilter = 'all' | PublicationType;
type ViewMode = 'list' | 'grid';
type SortKey = PublicationSearchSortKey;
type ExplorerMenu = 'type' | 'sort-key';
type ColumnKey = 'author' | 'edition' | 'recipe_count' | 'tags' | 'created_at' | 'updated_at';
type ExplorerState = {
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
  collection: 'Recipe Tin',
};
const filterLabels: Record<PublicationFilter, string> = {
  all: 'All',
  book: 'Books',
  magazine: 'Magazines',
  site: 'Sites',
  collection: 'Recipe Tin',
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

function filterOptions(values: (number | string | null | undefined)[]) {
  return [
    ...new Set(
      values
        .filter((value): value is number | string => value !== null && value !== undefined)
        .map(String)
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
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

function publicationColumnLabel(column: ColumnKey) {
  return column === 'edition' ? 'Edition' : columnLabels[column];
}

function publicationColumnValue(publication: ExplorerPublication, column: ColumnKey): ReactNode {
  switch (column) {
    case 'author':
      return publication.author ? <AuthorNames authors={publication.author} /> : '—';
    case 'edition':
      return publication.edition || publication.issue || '—';
    case 'recipe_count':
      return publication.recipe_count;
    case 'tags':
      return publication.tag_names.join(', ') || '—';
    case 'created_at':
      return formatDate(publication.created_at);
    case 'updated_at':
      return formatDate(publication.updated_at);
  }
  return '—';
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
  initialDisplayPreferences,
}: {
  publications: ExplorerPublication[];
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
  initialDisplayPreferences?: ExplorerDisplayPreferences;
}) {
  const [openMenu, setOpenMenu] = useState<ExplorerMenu | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const activeTrigger = useRef<HTMLButtonElement | null>(null);
  const viewMode = view;
  const state: ExplorerState = { filters, type, sort, direction, view: viewMode, page };
  const persistedState = createExplorerState('publications', {
    ...(initialDisplayPreferences
      ? { schema_version: 2, display_preferences: initialDisplayPreferences }
      : {}),
    filters,
    sort,
    direction,
    view,
    type,
  });
  const stateKey = JSON.stringify(state);
  const previousStateKey = useRef(stateKey);
  const visibleColumns = Object.keys(columnLabels) as ColumnKey[];
  const columnFilterOptions = {
    name: filterOptions(publications.map((publication) => publication.name)),
    author: filterOptions(publications.map((publication) => publication.author)),
    edition: filterOptions(
      publications.map((publication) => publication.edition || publication.issue),
    ),
    recipe_count: filterOptions(publications.map((publication) => publication.recipe_count)),
    created_at: filterOptions(
      publications.map((publication) => publication.created_at.slice(0, 10)),
    ),
    updated_at: filterOptions(
      publications.map((publication) => publication.updated_at.slice(0, 10)),
    ),
  } as const;

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

  function renderMobileColumns(publication: ExplorerPublication) {
    return (
      <dl className="publication-explorer-mobile-metadata">
        {visibleColumns.map((column) => (
          <div data-explorer-column={column} key={column}>
            <dt>{publicationColumnLabel(column)}</dt>
            <dd>{publicationColumnValue(publication, column)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <section className="publication-explorer" aria-label="Publication Explorer">
      {persistedState && <ExplorerStatePersistence context="publications" state={persistedState} />}
      <ExplorerListPreferences
        context="publications"
        initialPreferences={initialDisplayPreferences}
        showControl={viewMode === 'list'}
        state={
          persistedState ?? {
            schema_version: 1,
            filters: [],
            sort,
            direction,
            view,
          }
        }
        toolbar={
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
          </div>
        }
      >
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
          ) : viewMode === 'list' && sortedPublications.length > 0 && persistedState ? (
            <>
              <div className="recipe-list-scroll publication-explorer-scroll publication-explorer-table-wrap">
                <table
                  className="recipe-list publication-explorer-table"
                  role="table"
                  style={{
                    gridTemplateColumns: 'var(--explorer-list-grid-template-columns)',
                  }}
                >
                  <thead role="rowgroup">
                    <tr role="row">
                      <th data-explorer-column="name" role="columnheader" scope="col">
                        <PublicationColumnFilter
                          direction={direction}
                          field="name"
                          filters={filters}
                          kind="text"
                          label="Name"
                          options={columnFilterOptions.name}
                          sort={sort}
                          type={type}
                          view={viewMode}
                        />
                        <ExplorerColumnResizeHandle column="name" />
                      </th>
                      {visibleColumns.map((column) => (
                        <th
                          data-explorer-column={column}
                          className={
                            column === 'recipe_count'
                              ? 'publication-explorer-table-recipe-count'
                              : undefined
                          }
                          key={column}
                          role="columnheader"
                          scope="col"
                        >
                          {column === 'author' ||
                          column === 'edition' ||
                          column === 'recipe_count' ||
                          column === 'created_at' ||
                          column === 'updated_at' ? (
                            <PublicationColumnFilter
                              direction={direction}
                              field={column === 'edition' ? 'edition' : column}
                              filters={filters}
                              kind={
                                column === 'recipe_count'
                                  ? 'number'
                                  : column === 'created_at' || column === 'updated_at'
                                    ? 'date'
                                    : 'text'
                              }
                              label={publicationColumnLabel(column)}
                              options={
                                columnFilterOptions[column === 'edition' ? 'edition' : column]
                              }
                              sort={sort}
                              type={type}
                              view={viewMode}
                            />
                          ) : (
                            columnLabels[column]
                          )}
                          <ExplorerColumnResizeHandle column={column} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {sortedPublications.map((publication) => (
                      <tr key={publication.id} role="row">
                        <td data-explorer-column="name" data-label="Name" role="cell">
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
                          <td
                            data-explorer-column={column}
                            className={
                              column === 'recipe_count'
                                ? 'publication-explorer-table-recipe-count'
                                : undefined
                            }
                            data-label={columnLabels[column]}
                            key={column}
                            role="cell"
                          >
                            {publicationColumnValue(publication, column)}
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
                    <div className="publication-explorer-mobile-content">
                      <Link
                        className="publication-explorer-mobile-link"
                        href={`/publications/${publication.id}`}
                        title={tooltipText(publication)}
                      >
                        {publication.name}
                      </Link>
                      {renderMobileColumns(publication)}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : viewMode === 'list' && sortedPublications.length > 0 ? (
            <ul className="publication-explorer-mobile-list">
              {sortedPublications.map((publication) => (
                <li key={publication.id}>
                  <PublicationTypeIcon type={publication.publication_type} />
                  <div className="publication-explorer-mobile-content">
                    <Link
                      className="publication-explorer-mobile-link"
                      href={`/publications/${publication.id}`}
                      title={tooltipText(publication)}
                    >
                      {publication.name}
                    </Link>
                    {renderMobileColumns(publication)}
                  </div>
                </li>
              ))}
            </ul>
          ) : sortedPublications.length > 0 ? (
            <ul className="publication-explorer-grid">
              {sortedPublications.map((publication) => (
                <li
                  className={`publication-explorer-card${publication.publication_type === 'collection' ? ' publication-explorer-card-collection' : ''}`}
                  key={publication.id}
                >
                  <Link
                    aria-label={publication.name}
                    className={`publication-explorer-card-link${publication.publication_type === 'site' ? ' publication-explorer-card-link-site' : ''}${publication.publication_type === 'collection' ? ' publication-explorer-card-link-collection' : ''}`}
                    href={`/publications/${publication.id}`}
                    title={tooltipText(publication)}
                  >
                    <PublicationCover
                      crop={publication.cover_crop}
                      displayHeight={publication.cover_display_height}
                      displayWidth={publication.cover_display_width}
                      imageHeight={publication.cover_image_height}
                      imageUrl={publication.cover_image_url}
                      imageWidth={publication.cover_image_width}
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
      </ExplorerListPreferences>
    </section>
  );
}
