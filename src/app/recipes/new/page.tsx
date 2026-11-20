import { redirect } from 'next/navigation';
import {
  getIngredients,
  getPreparationOptions,
  getPublications,
  getRecipeLinkOptions,
  getRecipePicklists,
  getTags,
} from '../../../lib/recipes/data';
import { createClient } from '../../../lib/supabase/server';
import { PrivateBreadcrumbs } from '../../private-breadcrumbs';
import { RecipeForm } from '../recipe-form';

export const metadata = {
  title: 'Add Recipe',
};

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ publication?: string }>;
}) {
  const { publication: requestedPublicationId } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect('/');
  }

  const [picklists, ingredients, preparationOptions, publications, recipeOptions, tags] =
    await Promise.all([
      getRecipePicklists(supabase),
      getIngredients(supabase),
      getPreparationOptions(supabase),
      getPublications(supabase),
      getRecipeLinkOptions(supabase),
      getTags(supabase),
    ]);
  const initialPublicationId = publications.some(({ id }) => id === requestedPublicationId)
    ? requestedPublicationId
    : (publications.find(({ publication_type }) => publication_type === 'collection')?.id ?? null);
  const initialPublication = publications.find(({ id }) => id === initialPublicationId);

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      {initialPublication && (
        <PrivateBreadcrumbs
          className="private-breadcrumbs-add-recipe"
          parents={[
            { label: 'Library', href: '/publications' },
            {
              label: initialPublication.name,
              href: `/publications/${initialPublication.id}`,
            },
          ]}
        />
      )}
      <h1 id="page-title">Add Recipe</h1>
      <RecipeForm
        ingredients={ingredients}
        initialPublicationId={initialPublicationId}
        picklists={picklists}
        preparationOptions={preparationOptions}
        publications={publications}
        recipeOptions={recipeOptions}
        tags={tags}
      />
    </main>
  );
}
