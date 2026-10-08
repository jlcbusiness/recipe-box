import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getIngredients,
  getPreparationOptions,
  getPublications,
  getRecipe,
  getRecipeLinkOptions,
  getRecipePicklists,
} from '../../../../lib/recipes/data';
import { createClient } from '../../../../lib/supabase/server';
import { RecipeDeleteAction } from '../../recipe-detail-actions';
import { RecipeForm } from '../../recipe-form';

type EditRecipePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditRecipePage({ params }: EditRecipePageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const [recipe, picklists, ingredients, preparationOptions, publications] = await Promise.all([
    getRecipe(supabase, id),
    getRecipePicklists(supabase),
    getIngredients(supabase),
    getPreparationOptions(supabase),
    getPublications(supabase),
  ]);
  if (!recipe) {
    notFound();
  }
  const recipeOptions = await getRecipeLinkOptions(supabase, recipe.id);

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <div className="recipe-edit-heading">
        <h1 id="page-title">Edit Recipe</h1>
        <RecipeDeleteAction
          buttonLabel="Delete"
          recipeId={recipe.id}
          recipeName={recipe.name}
          version={recipe.version}
        />
      </div>
      <Link className="recipe-back-link" href={`/recipes/${recipe.id}`}>
        Back to view
      </Link>
      <RecipeForm
        ingredients={ingredients}
        picklists={picklists}
        preparationOptions={preparationOptions}
        publications={publications}
        recipeOptions={recipeOptions}
        recipe={recipe}
      />
    </main>
  );
}
