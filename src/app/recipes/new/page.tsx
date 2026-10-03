import { getRecipePicklists } from '../../../lib/recipes/data';
import { createClient } from '../../../lib/supabase/server';
import { RecipeForm } from '../recipe-form';

export default async function NewRecipePage() {
  const supabase = await createClient();
  const picklists = await getRecipePicklists(supabase);

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <p className="eyebrow">ADD TO YOUR COLLECTION</p>
      <h1 id="page-title">New Recipe</h1>
      <RecipeForm picklists={picklists} />
    </main>
  );
}
