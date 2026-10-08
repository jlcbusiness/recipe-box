import { BookOpen, Globe, Newspaper } from 'lucide-react';
import Link from 'next/link';
import { getTrashedPublications, getTrashedRecipes } from '../../../lib/recipes/data';
import { createClient } from '../../../lib/supabase/server';
import { restorePublication } from '../../publications/actions';
import { restoreRecipe } from '../actions';

type TrashPageProps = {
  searchParams: Promise<{ status?: string }>;
};

const retentionMilliseconds = 30 * 24 * 60 * 60 * 1000;
const purgeWarningMilliseconds = 2 * 24 * 60 * 60 * 1000;
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});
const publicationTypeLabels = {
  book: 'Book',
  magazine: 'Magazine',
  site: 'Site',
} as const;

export default async function TrashPage({ searchParams }: TrashPageProps) {
  const [{ status }, supabase] = await Promise.all([searchParams, createClient()]);
  const [recipes, publications] = await Promise.all([
    getTrashedRecipes(supabase),
    getTrashedPublications(supabase),
  ]);

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <div className="recipe-page-heading">
        <div>
          <p className="eyebrow">YOUR COOKBOOK SHELF</p>
          <h1 id="page-title">Trash</h1>
        </div>
      </div>

      {status === 'conflict' && (
        <p className="recipe-status-message" role="alert">
          An item changed or is no longer available. Refresh Trash and try again.
        </p>
      )}

      {recipes.length === 0 && publications.length === 0 ? (
        <p className="recipe-empty-state">
          Trash is empty. Deleted recipes and publications appear here.{' '}
          <Link href="/recipes">Return to Recipe Tin</Link>
        </p>
      ) : (
        <div className="recipe-trash-content">
          {publications.length > 0 && (
            <section aria-labelledby="trashed-publications-title">
              <h2 id="trashed-publications-title">Publications</h2>
              <div className="recipe-trash-table-scroll">
                <table aria-label="Trashed publications" className="recipe-trash-list">
                  <thead>
                    <tr>
                      <th scope="col">Publication</th>
                      <th scope="col">Deleted</th>
                      <th scope="col">Purge Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publications.map((publication) => {
                      const purgeAtMilliseconds =
                        Date.parse(publication.trashed_at) + retentionMilliseconds;
                      const purgeAt = new Date(purgeAtMilliseconds).toISOString();
                      const purgeIsNear =
                        purgeAtMilliseconds - Date.now() <= purgeWarningMilliseconds;
                      const TypeIcon =
                        publication.publication_type === 'book'
                          ? BookOpen
                          : publication.publication_type === 'magazine'
                            ? Newspaper
                            : Globe;

                      return (
                        <tr key={publication.id}>
                          <td>
                            <div className="recipe-trash-recipe">
                              <span className="recipe-trash-publication-title">
                                <span
                                  aria-label={publicationTypeLabels[publication.publication_type]}
                                  className="recipe-trash-publication-type-icon"
                                  role="img"
                                >
                                  <TypeIcon aria-hidden="true" size={17} strokeWidth={1.8} />
                                </span>
                                <span className="recipe-trash-recipe-name">{publication.name}</span>
                              </span>
                              <form action={restorePublication}>
                                <input name="publication_id" type="hidden" value={publication.id} />
                                <input
                                  name="expected_version"
                                  type="hidden"
                                  value={publication.version}
                                />
                                <button
                                  aria-label={`Restore ${publication.name}`}
                                  className="recipe-trash-restore"
                                  type="submit"
                                >
                                  Restore
                                </button>
                              </form>
                            </div>
                          </td>
                          <td>
                            <time dateTime={publication.trashed_at}>
                              {dateFormatter.format(new Date(publication.trashed_at))}
                            </time>
                          </td>
                          <td>
                            <time
                              className={purgeIsNear ? 'recipe-trash-purge-urgent' : undefined}
                              dateTime={purgeAt}
                            >
                              {dateFormatter.format(new Date(purgeAt))}
                            </time>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {recipes.length > 0 && (
            <section aria-labelledby="trashed-recipes-title">
              <h2 id="trashed-recipes-title">Recipes</h2>
              <div className="recipe-trash-table-scroll">
                <table aria-label="Trashed recipes" className="recipe-trash-list">
                  <thead>
                    <tr>
                      <th scope="col">Recipe</th>
                      <th scope="col">Deleted</th>
                      <th scope="col">Purge Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipes.map((recipe) => {
                      const purgeAt = new Date(
                        Date.parse(recipe.trashed_at) + retentionMilliseconds,
                      ).toISOString();

                      return (
                        <tr key={recipe.id}>
                          <td>
                            <div className="recipe-trash-recipe">
                              <span className="recipe-trash-recipe-name">{recipe.name}</span>
                              <form action={restoreRecipe}>
                                <input name="recipe_id" type="hidden" value={recipe.id} />
                                <input
                                  name="expected_version"
                                  type="hidden"
                                  value={recipe.version}
                                />
                                <button
                                  aria-label={`Restore ${recipe.name}`}
                                  className="recipe-trash-restore"
                                  type="submit"
                                >
                                  Restore
                                </button>
                              </form>
                            </div>
                          </td>
                          <td>
                            <time dateTime={recipe.trashed_at}>
                              {dateFormatter.format(new Date(recipe.trashed_at))}
                            </time>
                          </td>
                          <td>
                            <time dateTime={purgeAt}>
                              {dateFormatter.format(new Date(purgeAt))}
                            </time>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
