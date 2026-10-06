import Link from 'next/link';
import { getTrashedRecipes } from '../../../lib/recipes/data';
import { createClient } from '../../../lib/supabase/server';
import { restoreRecipe } from '../actions';

type TrashPageProps = {
  searchParams: Promise<{ status?: string }>;
};

const retentionMilliseconds = 30 * 24 * 60 * 60 * 1000;
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

export default async function TrashPage({ searchParams }: TrashPageProps) {
  const [{ status }, supabase] = await Promise.all([searchParams, createClient()]);
  const recipes = await getTrashedRecipes(supabase);

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
          This recipe changed or is no longer available. Refresh Trash and try again.
        </p>
      )}

      {recipes.length === 0 ? (
        <p className="recipe-empty-state">
          Trash is empty. Deleted recipes appear here.{' '}
          <Link href="/recipes">Return to Recipe Tin</Link>
        </p>
      ) : (
        <div className="recipe-trash-table-scroll">
          <table className="recipe-trash-list">
            <thead>
              <tr>
                <th scope="col">Recipe</th>
                <th scope="col">Deleted</th>
                <th scope="col">Permanent purge</th>
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
                          <input name="expected_version" type="hidden" value={recipe.version} />
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
                      <time dateTime={purgeAt}>{dateFormatter.format(new Date(purgeAt))}</time>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
