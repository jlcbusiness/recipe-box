// biome-ignore-all lint/a11y/noRedundantRoles: Explicit roles preserve table semantics after display: contents.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getPublications,
  type PublicationOption,
  type RecipeState,
  recipeStateLabels,
} from '../../../lib/recipes/data';
import { createClient } from '../../../lib/supabase/server';
import { PublicationCommaList } from '../publication-comma-list';
import { PublicationCover } from '../publication-cover';
import { PublicationDeleteAction } from '../publication-delete-action';

const publicationTypeLabels = {
  book: 'Book',
  magazine: 'Magazine',
  site: 'Site',
} as const;

function getRecipeUrlHost(recipeUrl: string): string {
  try {
    return new URL(recipeUrl).host.replace(/^www\./i, '');
  } catch {
    return recipeUrl;
  }
}

export default async function PublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [publicationResult, activePublications] = await Promise.all([
    supabase
      .from('publications')
      .select(
        'id, name, publication_type, author, edition, isbn, retailer_url, site_url, version, trashed_at',
      )
      .eq('id', id)
      .maybeSingle(),
    getPublications(supabase),
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
    { data: recipesData, error: recipesError },
    { data: picklistsData, error: picklistsError },
  ] = await Promise.all([
    supabase
      .from('recipes')
      .select(
        'id, name, state, food_type_id, verdict_id, enthusiasm_id, reason, total_time_minutes, publication_page, recipe_url',
      )
      .eq('publication_id', publication.id)
      .is('trashed_at', null)
      .order('updated_at', { ascending: false }),
    supabase.from('recipe_picklist_values').select('id, category, value'),
  ]);

  if (recipesError || picklistsError) {
    throw new Error('Unable to load this publication.');
  }

  const recipes = recipesData ?? [];
  const recipeIds = recipes.map((recipe) => recipe.id);
  const { data: assignments, error: assignmentError } = recipeIds.length
    ? await supabase
        .from('recipe_picklist_assignments')
        .select('recipe_id, category, picklist_value_id')
        .in('recipe_id', recipeIds)
        .eq('category', 'meal_type')
    : { data: [], error: null };

  if (assignmentError) {
    throw new Error('Unable to load this publication.');
  }

  const picklistById = new Map((picklistsData ?? []).map(({ id, value }) => [id, value]));
  const foodTypeById = new Map(
    (picklistsData ?? [])
      .filter((option) => option.category === 'food_type')
      .map(({ id, value }) => [id, value]),
  );
  const assignmentsByRecipe = new Map<string, string[]>();
  for (const assignment of assignments ?? []) {
    const values = assignmentsByRecipe.get(assignment.recipe_id) ?? [];
    const value = picklistById.get(assignment.picklist_value_id);
    if (value) {
      values.push(value);
    }
    assignmentsByRecipe.set(assignment.recipe_id, values);
  }

  const detail = [publicationTypeLabels[publication.publication_type], publication.author].filter(
    Boolean,
  );

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <div className="publication-detail-heading">
        <PublicationCover publication={publication} />
        <div>
          <p className="eyebrow">{publicationTypeLabels[publication.publication_type]}</p>
          <h1 id="page-title">{publication.name}</h1>
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
          <Link
            className="recipe-secondary-link collection-add-action publication-new-recipe"
            href={`/recipes/new?publication=${publication.id}`}
          >
            Add Recipe
          </Link>
        </div>
      </div>
      {recipes.length === 0 ? (
        <p className="recipe-empty-state">
          No recipes in this publication yet.{' '}
          <Link className="publication-empty-link" href="/publications">
            Back to Library
          </Link>
        </p>
      ) : (
        <div className="recipe-list-scroll publication-recipe-scroll">
          <table className="recipe-list publication-recipe-list" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">
                  Name
                </th>
                <th role="columnheader" scope="col">
                  State
                </th>
                <th role="columnheader" scope="col">
                  Opinion
                </th>
                <th role="columnheader" scope="col">
                  Meal Type
                </th>
                <th role="columnheader" scope="col">
                  Food Type
                </th>
                <th role="columnheader" scope="col">
                  Time
                </th>
                <th role="columnheader" scope="col">
                  Page or URL
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {recipes.map((recipe) => {
                const mealTypes = assignmentsByRecipe.get(recipe.id) ?? [];
                const opinion =
                  recipe.state === 'want_to_try'
                    ? (picklistById.get(recipe.enthusiasm_id ?? '') ?? '—')
                    : recipe.state === 'tried'
                      ? (picklistById.get(recipe.verdict_id ?? '') ?? '—')
                      : recipe.reason || '—';
                return (
                  <tr key={recipe.id} role="row">
                    <td data-label="Name" role="cell">
                      <Link href={`/recipes/${recipe.id}`}>{recipe.name}</Link>
                    </td>
                    <td data-label="State" role="cell">
                      {recipeStateLabels[recipe.state as RecipeState]}
                    </td>
                    <td data-label="Opinion" role="cell">
                      {opinion}
                    </td>
                    <td data-label="Meal Type" role="cell">
                      <PublicationCommaList values={mealTypes} />
                    </td>
                    <td data-label="Food Type" role="cell">
                      {recipe.food_type_id ? (foodTypeById.get(recipe.food_type_id) ?? '—') : '—'}
                    </td>
                    <td data-label="Time" role="cell">
                      {recipe.total_time_minutes === null
                        ? '—'
                        : `${recipe.total_time_minutes} min`}
                    </td>
                    <td data-label="Page or URL" role="cell">
                      {recipe.publication_page ??
                        (recipe.recipe_url ? (
                          <a className="publication-recipe-url-link" href={recipe.recipe_url}>
                            <span className="publication-recipe-url-host">
                              {getRecipeUrlHost(recipe.recipe_url)}
                            </span>
                            <span className="publication-recipe-url-full">{recipe.recipe_url}</span>
                          </a>
                        ) : (
                          '—'
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <section aria-label="Publication deletion" className="publication-delete-section">
        <PublicationDeleteAction
          destinations={destinations}
          publicationId={publication.id}
          publicationName={publication.name}
          version={publication.version}
          hasRecipes={recipes.length > 0}
        />
      </section>
    </main>
  );
}
