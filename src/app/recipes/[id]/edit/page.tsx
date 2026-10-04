import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getIngredients,
  getPreparationOptions,
  getRecipe,
  getRecipePicklists,
} from '../../../../lib/recipes/data';
import { createClient } from '../../../../lib/supabase/server';
import { RecipeForm } from '../../recipe-form';

type EditRecipePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditRecipePage({ params }: EditRecipePageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const [recipe, picklists, ingredients, preparationOptions] = await Promise.all([
    getRecipe(supabase, id),
    getRecipePicklists(supabase),
    getIngredients(supabase),
    getPreparationOptions(supabase),
  ]);
  if (!recipe) {
    notFound();
  }

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <Link className="recipe-back-link" href={`/recipes/${recipe.id}`}>
        Back to recipe
      </Link>
      <p className="eyebrow">UPDATE YOUR RECIPE</p>
      <h1 id="page-title">Edit Recipe</h1>
      <RecipeForm
        ingredients={ingredients}
        picklists={picklists}
        preparationOptions={preparationOptions}
        recipe={recipe}
      />
    </main>
  );
}
