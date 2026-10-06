import Link from 'next/link';
import type { PublicationOption } from '../../lib/recipes/data';
import { createClient } from '../../lib/supabase/server';
import { PublicationCover } from './publication-cover';

const publicationTypeLabels = {
  book: 'Book',
  magazine: 'Magazine Issue',
  site: 'Site',
} as const;

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('publications')
    .select('id, name, publication_type, author, edition, isbn, retailer_url, issue, site_url')
    .order('name');

  if (error) {
    throw new Error('Unable to load the Library.');
  }

  const publications = (data ?? []) as PublicationOption[];

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
      {publications.length === 0 ? (
        <p className="recipe-empty-state">No publications yet.</p>
      ) : (
        <ul className="publication-list">
          {publications.map((publication) => (
            <li key={publication.id}>
              <Link className="publication-list-item" href={`/publications/${publication.id}`}>
                <PublicationCover publication={publication} />
                <span className="publication-list-copy">
                  <span className="publication-list-title">{publication.name}</span>
                  <span className="publication-list-detail">
                    {publicationTypeLabels[publication.publication_type]}
                    {publication.issue ? ` · ${publication.issue}` : ''}
                    {publication.author ? ` · ${publication.author}` : ''}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
