import {
  getIngredients,
  getPreparationOptions,
  getPublications,
  getRecipePicklists,
} from '../../../lib/recipes/data';
import { createClient } from '../../../lib/supabase/server';
import { RecipeForm } from '../recipe-form';

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ publication?: string }>;
}) {
  const { publication: requestedPublicationId } = await searchParams;
  const supabase = await createClient();
  const [picklists, ingredients, preparationOptions, publications] = await Promise.all([
    getRecipePicklists(supabase),
    getIngredients(supabase),
    getPreparationOptions(supabase),
    getPublications(supabase),
  ]);
  const initialPublicationId = publications.some(({ id }) => id === requestedPublicationId)
    ? requestedPublicationId
    : null;

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <p className="eyebrow">ADD TO YOUR COLLECTION</p>
      <h1 id="page-title">Add Recipe</h1>
      <RecipeForm
        ingredients={ingredients}
        initialPublicationId={initialPublicationId}
        picklists={picklists}
        preparationOptions={preparationOptions}
        publications={publications}
      />
    </main>
  );
}
