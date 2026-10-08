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
import type { PublicationOption, PublicationType } from '../../lib/recipes/data';
import { PublicationCommaList } from './publication-comma-list';
import { PublicationCover } from './publication-cover';

type ExplorerPublication = PublicationOption & {
  created_at: string;
  updated_at: string;
  recipe_count: number;
};
type PublicationFilter = 'all' | PublicationType;
type ViewMode = 'list' | 'grid';
type SortKey =
  | 'name'
  | 'type'
  | 'author'
  | 'edition'
  | 'recipe_count'
  | 'created_at'
  | 'updated_at';
type ExplorerMenu = 'type' | 'sort-key';

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

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'en', { sensitivity: 'base' });
}

function compareNullableText(left: string | null, right: string | null, ascending: boolean) {
  if (left === null || left.trim() === '') {
    return right === null || right.trim() === '' ? 0 : 1;
  }
  if (right === null || right.trim() === '') return -1;
  return compareText(left, right) * (ascending ? 1 : -1);
}

function comparePublications(
  left: ExplorerPublication,
  right: ExplorerPublication,
  sortKey: SortKey,
  ascending: boolean,
) {
  let comparison = 0;

  switch (sortKey) {
    case 'name':
      comparison = compareText(left.name, right.name) * (ascending ? 1 : -1);
      break;
    case 'type':
      comparison =
        compareText(
          publicationTypeLabels[left.publication_type],
          publicationTypeLabels[right.publication_type],
        ) * (ascending ? 1 : -1);
      break;
    case 'author':
      comparison = compareNullableText(left.author, right.author, ascending);
      break;
    case 'edition':
      comparison = compareNullableText(left.edition, right.edition, ascending);
      break;
    case 'recipe_count':
      comparison = (left.recipe_count - right.recipe_count) * (ascending ? 1 : -1);
      break;
    case 'created_at':
      comparison =
        (Date.parse(left.created_at) - Date.parse(right.created_at)) * (ascending ? 1 : -1);
      break;
    case 'updated_at':
      comparison =
        (Date.parse(left.updated_at) - Date.parse(right.updated_at)) * (ascending ? 1 : -1);
      break;
  }

  return comparison || compareText(left.name, right.name) || left.id.localeCompare(right.id);
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function tooltipText(publication: ExplorerPublication) {
  return [
    publicationTypeLabels[publication.publication_type],
    publication.author ? `Author: ${publication.author}` : null,
    publication.edition ? `Edition: ${publication.edition}` : null,
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

function MenuOption({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className="publication-explorer-menu-option"
      onClick={onClick}
      type="button"
    >
      {children}
      <SelectedMark selected={selected} />
    </button>
  );
}

export function PublicationExplorer({ publications }: { publications: ExplorerPublication[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<PublicationFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [ascending, setAscending] = useState(true);
  const [openMenu, setOpenMenu] = useState<ExplorerMenu | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const activeTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (window.matchMedia('(max-width: 720px)').matches) {
      setViewMode('list');
    }
  }, []);

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

  const filteredPublications = publications.filter(
    (publication) => filter === 'all' || publication.publication_type === filter,
  );
  const sortedPublications = [...filteredPublications].sort((left, right) =>
    comparePublications(left, right, sortKey, ascending),
  );

  function toggleMenu(menu: ExplorerMenu, event: MouseEvent<HTMLButtonElement>) {
    activeTrigger.current = event.currentTarget;
    setOpenMenu((current) => (current === menu ? null : menu));
  }

  function closeMenu(restoreFocus = false) {
    setOpenMenu(null);
    if (restoreFocus && activeTrigger.current?.isConnected) {
      activeTrigger.current.focus();
    }
  }

  function chooseFilter(value: PublicationFilter) {
    setFilter(value);
    closeMenu(true);
  }

  function chooseSort(value: SortKey) {
    setSortKey(value);
    closeMenu(true);
  }

  return (
    <section className="publication-explorer" aria-label="Publication Explorer">
      <div className="publication-explorer-toolbar" ref={toolbarRef}>
        <div className="publication-explorer-control publication-explorer-control-type">
          <button
            aria-controls="publication-type-options"
            aria-expanded={openMenu === 'type'}
            aria-label={`Type: ${filterLabels[filter]}`}
            className="publication-explorer-trigger publication-explorer-type-trigger"
            onClick={(event) => toggleMenu('type', event)}
            title={`Type: ${filterLabels[filter]}`}
            type="button"
          >
            <PublicationTypeIcon type={filter} />
            <span className="publication-explorer-trigger-label">{filterLabels[filter]}</span>
          </button>
          {openMenu === 'type' && (
            <fieldset
              aria-label="Publication type options"
              className="publication-explorer-popover"
              id="publication-type-options"
            >
              <legend>Publication type options</legend>
              {(Object.keys(filterLabels) as PublicationFilter[]).map((value) => (
                <MenuOption
                  key={value}
                  onClick={() => chooseFilter(value)}
                  selected={filter === value}
                >
                  <PublicationTypeIcon type={value} />
                  <span>{filterLabels[value]}</span>
                </MenuOption>
              ))}
            </fieldset>
          )}
        </div>

        <div className="publication-explorer-control publication-explorer-control-sort">
          <button
            aria-controls="publication-sort-options"
            aria-expanded={openMenu === 'sort-key'}
            aria-label={`Sort by ${sortLabels[sortKey]}`}
            className="publication-explorer-trigger publication-explorer-icon-trigger"
            onClick={(event) => toggleMenu('sort-key', event)}
            title={`Sort by ${sortLabels[sortKey]}`}
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
                  <MenuOption
                    key={value}
                    onClick={() => chooseSort(value)}
                    selected={sortKey === value}
                  >
                    <span>{sortLabels[value]}</span>
                  </MenuOption>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        <div className="publication-explorer-control publication-explorer-control-sort-direction">
          <button
            aria-label={ascending ? 'Sort descending' : 'Sort ascending'}
            className="publication-explorer-trigger publication-explorer-icon-trigger"
            onClick={() => setAscending((current) => !current)}
            title={ascending ? 'Sort descending' : 'Sort ascending'}
            type="button"
          >
            {ascending ? (
              <ArrowUp aria-hidden="true" size={19} />
            ) : (
              <ArrowDown aria-hidden="true" size={19} />
            )}
          </button>
        </div>

        <div className="publication-explorer-control publication-explorer-control-view">
          <button
            aria-label={`Switch to ${viewMode === 'list' ? 'Grid' : 'List'} view`}
            aria-pressed={viewMode === 'grid'}
            className="publication-explorer-trigger publication-explorer-icon-trigger"
            onClick={() => {
              setOpenMenu(null);
              setViewMode((current) => (current === 'list' ? 'grid' : 'list'));
            }}
            title={`Switch to ${viewMode === 'list' ? 'Grid' : 'List'} view`}
            type="button"
          >
            {viewMode === 'list' ? (
              <List aria-hidden="true" size={19} />
            ) : (
              <LayoutGrid aria-hidden="true" size={19} />
            )}
          </button>
        </div>
      </div>

      <div className="publication-explorer-results">
        <p aria-live="polite" className="publication-explorer-result-count">
          {publications.length === 0
            ? 'No publications yet.'
            : `${sortedPublications.length} ${sortedPublications.length === 1 ? 'publication' : 'publications'}`}
        </p>
        {publications.length > 0 && sortedPublications.length === 0 ? (
          <p className="recipe-empty-state">No publications match this filter.</p>
        ) : viewMode === 'list' && sortedPublications.length > 0 ? (
          <>
            <div className="recipe-list-scroll publication-explorer-scroll publication-explorer-table-wrap">
              <table className="recipe-list publication-explorer-table" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">
                      Name
                    </th>
                    <th role="columnheader" scope="col">
                      Author
                    </th>
                    <th role="columnheader" scope="col">
                      Edition
                    </th>
                    <th role="columnheader" scope="col">
                      Recipes
                    </th>
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
                      <td data-label="Author" role="cell">
                        {publication.author ? <AuthorNames authors={publication.author} /> : '—'}
                      </td>
                      <td data-label="Edition" role="cell">
                        {publication.edition || '—'}
                      </td>
                      <td data-label="Recipes" role="cell">
                        {publication.recipe_count}
                      </td>
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
                  <PublicationCover publication={publication} />
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
      </div>
    </section>
  );
}
