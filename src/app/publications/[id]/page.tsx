// biome-ignore-all lint/a11y/noRedundantRoles: Explicit roles preserve table semantics after display: contents.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicationCover } from '../../../lib/media/data';
import { getPublications, getTags, type PublicationOption } from '../../../lib/recipes/data';
import {
  parseRecipeSearchColumnFilters,
  type RecipeSearchSortKey,
} from '../../../lib/recipes/search';
import { createClient } from '../../../lib/supabase/server';
import { RecipeSearchToolbar } from '../../recipes/find/recipe-search-toolbar';
import { TagChips } from '../../tags/tag-controls';
import { PublicationCover } from '../publication-cover';
import { PublicationEditAction } from '../publication-edit-action';
import { PublicationRecipeExplorer } from './recipe-explorer';

const publicationTypeLabels = {
  book: 'Book',
  magazine: 'Magazine',
  site: 'Site',
} as const;

const recipeSortOptions: { value: RecipeSearchSortKey; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'name', label: 'Name' },
  { value: 'state', label: 'State' },
  { value: 'total_time_minutes', label: 'Total Time' },
  { value: 'created_at', label: 'Date Added' },
  { value: 'updated_at', label: 'Date Changed' },
];
const recipeViewOptions = [
  { value: 'details', label: 'Details' },
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
] as const;

export default async function PublicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
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
  }>;
}) {
  const [{ id }, explorerSearchParams] = await Promise.all([params, searchParams]);
  const columnSelections = parseRecipeSearchColumnFilters(explorerSearchParams).selections;
  const sort = recipeSortOptions.some(({ value }) => value === explorerSearchParams.sort)
    ? (explorerSearchParams.sort as RecipeSearchSortKey)
    : 'name';
  const direction = explorerSearchParams.direction === 'desc' ? 'desc' : 'asc';
  const view =
    explorerSearchParams.view === 'grid'
      ? 'grid'
      : explorerSearchParams.view === 'list'
        ? 'list'
        : 'details';
  const supabase = await createClient();
  const [publicationResult, activePublications, publicationCover] = await Promise.all([
    supabase
      .from('publications')
      .select(
        'id, name, publication_type, author, edition, isbn, retailer_url, site_url, version, trashed_at',
      )
      .eq('id', id)
      .maybeSingle(),
    getPublications(supabase),
    getPublicationCover(supabase, id),
  ]);
  const { data: publicationData, error: publicationError } = publicationResult;

  if (publicationError) {
    throw new Error('Unable to load this publication.');
  }
  if (!publicationData || publicationData.trashed_at !== null) {
    notFound();
  }

  const publication = publicationData as PublicationOption & {
    version: number;
    trashed_at: string | null;
  };
  const destinations = activePublications.filter((option) => option.id !== publication.id);
  const [
    { count: recipeCount, error: recipeCountError },
    { data: publicationTagAssignments, error: publicationTagError },
    tags,
  ] = await Promise.all([
    supabase
      .from('recipes')
      .select('id', { count: 'exact', head: true })
      .eq('publication_id', publication.id)
      .is('trashed_at', null),
    supabase.from('publication_tags').select('tag_id').eq('publication_id', publication.id),
    getTags(supabase),
  ]);

  if (recipeCountError || publicationTagError) {
    throw new Error('Unable to load this publication.');
  }

  const assignedTagIds = new Set((publicationTagAssignments ?? []).map(({ tag_id }) => tag_id));
  const publicationTags = tags.filter((tag) => assignedTagIds.has(tag.id));

  const detail = [publicationTypeLabels[publication.publication_type], publication.author].filter(
    Boolean,
  );

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <div className="publication-detail-heading">
        <PublicationCover imageUrl={publicationCover?.thumbnail_url} publication={publication} />
        <div>
          <p className="eyebrow">{publicationTypeLabels[publication.publication_type]}</p>
          <h1 id="page-title">{publication.name}</h1>
          <TagChips tags={publicationTags} />
          {detail.length > 1 && (
            <p className="publication-detail-meta">{detail.slice(1).join(' · ')}</p>
          )}
          {publication.site_url && (
            <a className="publication-site-link" href={publication.site_url}>
              {publication.site_url}
            </a>
          )}
        </div>
        <div className="publication-detail-actions">
          <PublicationEditAction
            assets={publicationCover ? [publicationCover] : []}
            destinations={destinations}
            hasRecipes={(recipeCount ?? 0) > 0}
            publication={publication}
            selectedTagIds={publicationTags.map((tag) => tag.id)}
            tags={tags}
          />
          <div className="publication-detail-mobile-controls">
            <RecipeSearchToolbar
              columnSelections={columnSelections}
              direction={direction}
              filters={[]}
              options={recipeSortOptions}
              path={`/publications/${publication.id}`}
              query=""
              sort={sort}
              view={view}
              viewOptions={[...recipeViewOptions]}
            />
          </div>
          <Link
            className="recipe-secondary-link collection-add-action publication-new-recipe"
            href={`/recipes/new?publication=${publication.id}`}
          >
            Add Recipe
          </Link>
        </div>
      </div>
      <PublicationRecipeExplorer
        publicationId={publication.id}
        searchParams={explorerSearchParams}
      />
    </main>
  );
}
