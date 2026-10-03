import Link from 'next/link';
import { type RecipeState, recipeStateLabels } from '../../lib/recipes/data';
import { createClient } from '../../lib/supabase/server';

export default async function RecipesPage() {
  const supabase = await createClient();
  const [recipesResult, foodTypesResult] = await Promise.all([
    supabase
      .from('recipes')
      .select('id, name, state, food_type_id, verdict_id, enthusiasm_id, reason')
      .order('updated_at', { ascending: false }),
    supabase.from('recipe_picklist_values').select('id, value'),
  ]);

  if (recipesResult.error || foodTypesResult.error) {
    throw new Error('Unable to load your Recipe Tin.');
  }

  const foodTypeById = new Map(foodTypesResult.data.map(({ id, value }) => [id, value]));
  const responseById = new Map(foodTypesResult.data.map(({ id, value }) => [id, value]));

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <div className="recipe-page-heading">
        <div>
          <p className="eyebrow">YOUR COOKBOOK SHELF</p>
          <h1 id="page-title">Recipes</h1>
        </div>
        <Link className="recipe-primary-link" href="/recipes/new">
          New Recipe
        </Link>
      </div>

      {recipesResult.data.length === 0 ? (
        <p className="recipe-empty-state">Your Recipe Tin is empty.</p>
      ) : (
        <div className="recipe-list-scroll">
          <table className="recipe-list">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Food Type</th>
                <th scope="col">State</th>
                <th scope="col">Opinion</th>
              </tr>
            </thead>
            <tbody>
              {recipesResult.data.map((recipe) => (
                <tr key={recipe.id}>
                  <td>
                    <Link href={`/recipes/${recipe.id}`}>{recipe.name}</Link>
                  </td>
                  <td>{recipe.food_type_id ? foodTypeById.get(recipe.food_type_id) : '—'}</td>
                  <td>{recipeStateLabels[recipe.state as RecipeState]}</td>
                  <td>
                    {recipe.state === 'want_to_try'
                      ? (responseById.get(recipe.enthusiasm_id ?? '') ?? '—')
                      : recipe.state === 'tried'
                        ? (responseById.get(recipe.verdict_id ?? '') ?? '—')
                        : recipe.reason || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
