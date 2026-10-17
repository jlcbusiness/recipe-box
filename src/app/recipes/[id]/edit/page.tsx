import { X } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRecipePhotos } from '../../../../lib/media/data';
import {
  getIngredients,
  getPreparationOptions,
  getPublications,
  getRecipe,
  getRecipeLinkOptions,
  getRecipePicklists,
  getTags,
} from '../../../../lib/recipes/data';
import { createClient } from '../../../../lib/supabase/server';
import { RecipeForm } from '../../recipe-form';

type EditRecipePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditRecipePage({ params }: EditRecipePageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const [recipe, picklists, ingredients, preparationOptions, publications, photos, tags] =
    await Promise.all([
      getRecipe(supabase, id),
      getRecipePicklists(supabase),
      getIngredients(supabase),
      getPreparationOptions(supabase),
      getPublications(supabase),
      getRecipePhotos(supabase, id),
      getTags(supabase),
    ]);
  if (!recipe) {
    notFound();
  }
  const recipeOptions = await getRecipeLinkOptions(supabase, recipe.id);

  return (
    <main
      className={`recipes-main${recipe.publication?.publication_type === 'collection' ? ' recipe-tin-theme recipe-tin-recipe-theme' : ''}`}
      aria-labelledby="page-title"
    >
      <div className="recipe-edit-heading">
        <h1 id="page-title">Edit Recipe</h1>
        <Link
          aria-label="Back to view"
          className="recipe-secondary-link recipe-detail-action recipe-edit-back"
          href={`/recipes/${recipe.id}`}
          title="Back to view"
        >
          <X aria-hidden="true" size={24} />
        </Link>
      </div>
      <RecipeForm
        ingredients={ingredients}
        mediaAssets={photos}
        picklists={picklists}
        preparationOptions={preparationOptions}
        publications={publications}
        recipeOptions={recipeOptions}
        tags={tags}
        recipe={recipe}
      />
    </main>
  );
}
