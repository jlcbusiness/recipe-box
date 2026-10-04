import {
  getIngredients,
  getPreparationOptions,
  getRecipePicklists,
} from '../../../lib/recipes/data';
import { createClient } from '../../../lib/supabase/server';
import { RecipeForm } from '../recipe-form';

export default async function NewRecipePage() {
  const supabase = await createClient();
  const [picklists, ingredients, preparationOptions] = await Promise.all([
    getRecipePicklists(supabase),
    getIngredients(supabase),
    getPreparationOptions(supabase),
  ]);

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <p className="eyebrow">ADD TO YOUR COLLECTION</p>
      <h1 id="page-title">New Recipe</h1>
      <RecipeForm
        ingredients={ingredients}
        picklists={picklists}
        preparationOptions={preparationOptions}
      />
    </main>
  );
}
