import { notFound } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { type HistoryEventRow, HistoryEvents } from '../../../history/history-events';
import { PrivateBreadcrumbs } from '../../../private-breadcrumbs';

export async function generateMetadata({ params }: PageProps<'/recipes/[id]/history'>) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('name')
    .eq('id', id)
    .is('trashed_at', null)
    .maybeSingle();

  if (error) throw new Error('Unable to load recipe history.');
  return {
    title: recipe ? `${recipe.name} - History` : 'Recipe history',
  };
}

export default async function RecipeHistoryPage({ params }: PageProps<'/recipes/[id]/history'>) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .select('id, name, publication_id')
    .eq('id', id)
    .is('trashed_at', null)
    .maybeSingle();

  if (recipeError) throw new Error('Unable to load recipe history.');
  if (!recipe) notFound();
  if (!recipe.publication_id) throw new Error('Unable to load recipe history.');

  const { data: publication, error: publicationError } = await supabase
    .from('publications')
    .select('id, name, publication_type')
    .eq('id', recipe.publication_id)
    .maybeSingle();

  if (publicationError || !publication) throw new Error('Unable to load recipe history.');

  const { data, error } = await supabase
    .from('recipe_history')
    .select('id, actor_user_id, event_type, before_data, after_data, created_at')
    .eq('record_id', id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw new Error('Unable to load recipe history.');

  return (
    <main
      className="recipes-main recipe-history-page"
      data-publication-theme={
        publication.publication_type === 'collection' ? undefined : publication.publication_type
      }
      aria-labelledby="page-title"
    >
      <PrivateBreadcrumbs
        currentPage="History"
        parents={[
          { label: 'Library', href: '/publications' },
          {
            label: publication.name,
            href: `/publications/${publication.id}`,
            publicationType: publication.publication_type,
          },
          { label: recipe.name, href: `/recipes/${recipe.id}` },
        ]}
      />
      <h1 id="page-title">History: {recipe.name}</h1>
      <HistoryEvents entity="recipe" events={(data ?? []) as HistoryEventRow[]} />
    </main>
  );
}
