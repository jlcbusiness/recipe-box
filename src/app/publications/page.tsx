import Link from 'next/link';
import type { PublicationOption } from '../../lib/recipes/data';
import { createClient } from '../../lib/supabase/server';
import { PublicationExplorer } from './publication-explorer';

type PublicationExplorerRow = PublicationOption & {
  created_at: string;
  updated_at: string;
  recipes: { count: number }[];
};

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ status }, supabase] = await Promise.all([searchParams, createClient()]);
  const { data, error } = await supabase
    .from('publications')
    .select(
      'id, name, publication_type, author, edition, isbn, retailer_url, issue, site_url, created_at, updated_at, recipes(count)',
    )
    .is('recipes.trashed_at', null)
    .order('name');

  if (error) {
    throw new Error('Unable to load the Library.');
  }

  const publications = ((data ?? []) as PublicationExplorerRow[]).map(
    ({ recipes, ...publication }) => ({
      ...publication,
      recipe_count: recipes[0]?.count ?? 0,
    }),
  );

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
      <PublicationExplorer publications={publications} />
    </main>
  );
}
