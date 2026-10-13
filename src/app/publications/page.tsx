import Link from 'next/link';
import { getPublicationCovers } from '../../lib/media/data';
import {
  type PublicationSearchSortKey,
  parsePublicationSearchFilters,
  searchPublications,
} from '../../lib/publications/search';
import { getTags, type PublicationType } from '../../lib/recipes/data';
import { createClient } from '../../lib/supabase/server';
import { PublicationExplorer } from './publication-explorer';

const pageSize = 50;
const sortOptions: PublicationSearchSortKey[] = [
  'relevance',
  'name',
  'type',
  'author',
  'edition',
  'recipe_count',
  'created_at',
  'updated_at',
];

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function publicationType(value: string): PublicationType | undefined {
  return value === 'book' || value === 'magazine' || value === 'site' ? value : undefined;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    filter?: string | string[];
    type?: string;
    sort?: string;
    direction?: string;
    page?: string;
    view?: string;
  }>;
}) {
  const [params, supabase] = await Promise.all([searchParams, createClient()]);
  const status = firstValue(params.status);
  const query = firstValue(params.q).slice(0, 500);
  const filters = parsePublicationSearchFilters(params.filter);
  const typeFilter = publicationType(firstValue(params.type)) ?? 'all';
  const requestedPage = Math.max(1, Math.min(20_001, Number.parseInt(params.page ?? '1', 10) || 1));
  const sortKey = sortOptions.includes(params.sort as PublicationSearchSortKey)
    ? (params.sort as PublicationSearchSortKey)
    : query.trim()
      ? 'relevance'
      : 'name';
  const sortDirection = params.direction === 'desc' ? 'desc' : 'asc';
  const view = params.view === 'list' ? 'list' : 'grid';
  const [tags, activePublications] = await Promise.all([
    getTags(supabase),
    supabase
      .from('publications')
      .select('id', { count: 'exact', head: true })
      .is('trashed_at', null),
  ]);

  if (activePublications.error) {
    throw new Error('Unable to load the Library.');
  }

  const searchOptions = {
    filters,
    publicationType: typeFilter === 'all' ? undefined : typeFilter,
    sortKey,
    sortDirection,
    limit: pageSize,
  } as const;
  let page = requestedPage;
  let publications: Awaited<ReturnType<typeof searchPublications>> = [];
  let matchingCount = 0;
  let pageCount = 1;
  let searchError: string | null = null;

  try {
    publications = await searchPublications(supabase, query, {
      ...searchOptions,
      offset: (page - 1) * pageSize,
    });
    matchingCount = publications[0]?.total_count ?? 0;
    if (matchingCount === 0 && page > 1) {
      const firstPage = await searchPublications(supabase, query, {
        ...searchOptions,
        limit: 1,
        offset: 0,
      });
      matchingCount = firstPage[0]?.total_count ?? 0;
    }
    pageCount = Math.max(1, Math.ceil(matchingCount / pageSize));
    if (page > pageCount) {
      page = pageCount;
      publications = await searchPublications(supabase, query, {
        ...searchOptions,
        offset: (page - 1) * pageSize,
      });
    }
  } catch {
    searchError = 'Unable to search publications. Your query and filters are preserved. Try again.';
    publications = [];
    matchingCount = 0;
    pageCount = 1;
  }

  const coverImages = await getPublicationCovers(
    supabase,
    publications.map(({ publication_id }) => publication_id),
  );
  const explorerPublications = publications.map((publication) => ({
    ...publication,
    id: publication.publication_id,
    cover_image_url: coverImages.get(publication.publication_id)?.thumbnail_url ?? null,
  }));

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <div className="recipe-page-heading publication-library-heading">
        <div>
          <p className="eyebrow">YOUR COLLECTION</p>
          <h1 id="page-title">Library</h1>
        </div>
        <div className="recipe-page-heading-actions publication-library-actions">
          <Link className="recipe-secondary-link collection-add-action" href="/publications/new">
            Add publication
          </Link>
        </div>
      </div>
      {status === 'trashed' && (
        <p className="recipe-status-message" role="status">
          Publication and selected recipes moved to Trash.{' '}
          <Link href="/recipes/trash">View Trash</Link>
        </p>
      )}
      {status === 'conflict' && (
        <p className="recipe-status-message" role="alert">
          A publication changed or is no longer available. Refresh the Library and try again.
        </p>
      )}
      {status === 'error' && (
        <p className="recipe-status-message" role="alert">
          Unable to move the publication to Trash. Review the selected recipe disposition and try
          again.
        </p>
      )}
      <PublicationExplorer
        direction={sortDirection}
        emptyCatalog={(activePublications.count ?? 0) === 0}
        filters={filters}
        page={page}
        pageCount={pageCount}
        publications={explorerPublications}
        query={query}
        searchError={searchError}
        sort={sortKey}
        tagOptions={tags.map(({ id, name }) => ({ value: id, label: name }))}
        totalCount={matchingCount}
        type={typeFilter}
        view={view}
      />
    </main>
  );
}
