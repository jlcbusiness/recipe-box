// biome-ignore-all lint/a11y/noRedundantRoles: Explicit roles preserve table semantics after display: contents.
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicationCover } from '../../../lib/media/data';
import { getPublications, getTags, type PublicationOption } from '../../../lib/recipes/data';
import { createClient } from '../../../lib/supabase/server';
import { ExportAction } from '../../export-action';
import { ImportAction } from '../../settings/database-import-action';
import { TagChips } from '../../tags/tag-controls';
import { PublicationCover } from '../publication-cover';
import { PublicationEditAction } from '../publication-edit-action';
import { PublicationTransferMenu } from '../publication-transfer-menu';
import { PublicationRecipeExplorer } from './recipe-explorer';

const publicationTypeLabels = {
  book: 'Book',
  magazine: 'Magazine',
  site: 'Site',
  collection: 'Recipe Tin',
} as const;

export default async function PublicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string;
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
    column_publication_page?: string | string[];
    column_recipe_url?: string | string[];
    column_citation?: string | string[];
    column_publication_source?: string | string[];
  }>;
}) {
  const [{ id }, explorerSearchParams] = await Promise.all([params, searchParams]);
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
  const destinations = activePublications.filter(
    (option) => option.id !== publication.id && option.publication_type !== 'collection',
  );
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
    <main
      className={`recipes-main${publication.publication_type === 'collection' ? ' recipe-tin-theme' : ''}`}
      aria-labelledby="page-title"
    >
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
        <div
          className={`publication-detail-actions publication-desktop-actions${publication.publication_type === 'collection' ? ' publication-detail-actions-collection' : ''}`}
        >
          {publication.publication_type !== 'collection' && (
            <PublicationEditAction
              assets={publicationCover ? [publicationCover] : []}
              destinations={destinations}
              hasRecipes={(recipeCount ?? 0) > 0}
              publication={publication}
              selectedTagIds={publicationTags.map((tag) => tag.id)}
              tags={tags}
            />
          )}
          <Link
            className="recipe-primary-link collection-add-action publication-new-recipe"
            href={`/recipes/new?publication=${publication.id}`}
          >
            <Plus aria-hidden="true" size={18} />
            Add Recipe
          </Link>
          <ImportAction
            compact
            scope={{ type: 'recipe' }}
            targetPublicationId={publication.id}
            triggerLabel="Import recipe"
          />
          <ExportAction
            ariaLabel="Export publication"
            buttonClassName="recipe-secondary-button publication-detail-export-button"
            buttonLabel="Export"
            className="publication-detail-export-action"
            scope={{ type: 'publication', id: publication.id }}
          />
        </div>
      </div>
      {explorerSearchParams.status === 'trashed' && (
        <p className="recipe-status-message" role="status">
          Recipe moved to Trash. <Link href="/recipes/trash">Open Trash</Link>
        </p>
      )}
      {explorerSearchParams.status === 'conflict' && (
        <p className="recipe-status-message" role="alert">
          This recipe changed or is no longer available. Reload the Recipe Tin and try again.
        </p>
      )}
      {explorerSearchParams.status === 'error' && (
        <p className="recipe-status-message" role="alert">
          The recipe could not be moved to Trash. Try again.
        </p>
      )}
      <PublicationRecipeExplorer
        mobileToolbarActions={
          <div className="publication-mobile-actions">
            <PublicationTransferMenu publicationId={publication.id} />
            {publication.publication_type !== 'collection' && (
              <PublicationEditAction
                assets={publicationCover ? [publicationCover] : []}
                destinations={destinations}
                hasRecipes={(recipeCount ?? 0) > 0}
                publication={publication}
                selectedTagIds={publicationTags.map((tag) => tag.id)}
                tags={tags}
              />
            )}
            <Link
              aria-label="Add Recipe"
              className="recipe-primary-link collection-add-action publication-mobile-add"
              href={`/recipes/new?publication=${publication.id}`}
              title="Add Recipe"
            >
              <Plus aria-hidden="true" size={18} />
            </Link>
          </div>
        }
        publicationId={publication.id}
        searchParams={explorerSearchParams}
      />
    </main>
  );
}
