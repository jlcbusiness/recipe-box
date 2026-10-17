import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { type HistoryEventRow, HistoryEvents } from '../../../history/history-events';

export default async function RecipeHistoryPage({ params }: PageProps<'/recipes/[id]/history'>) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .select('id, name')
    .eq('id', id)
    .is('trashed_at', null)
    .maybeSingle();

  if (recipeError) throw new Error('Unable to load recipe history.');
  if (!recipe) notFound();

  const { data, error } = await supabase
    .from('recipe_history')
    .select('id, actor_user_id, event_type, before_data, after_data, created_at')
    .eq('record_id', id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw new Error('Unable to load recipe history.');

  return (
    <main className="recipes-main recipe-history-page" aria-labelledby="page-title">
      <Link className="recipe-history-back" href={`/recipes/${id}`}>
        Back to recipe
      </Link>
      <h1 id="page-title">History: {recipe.name}</h1>
      <HistoryEvents entity="recipe" events={(data ?? []) as HistoryEventRow[]} />
    </main>
  );
}
