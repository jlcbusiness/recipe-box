import { redirect } from 'next/navigation';
import { getPublications } from '../../lib/recipes/data';
import { createClient } from '../../lib/supabase/server';

type RecipesPageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function RecipesPage({ searchParams }: RecipesPageProps) {
  const { status } = await searchParams;
  const supabase = await createClient();
  const publications = await getPublications(supabase);
  const recipeTin = publications.find(({ publication_type }) => publication_type === 'collection');
  if (!recipeTin) throw new Error('Unable to load your Recipe Tin.');

  const destination = new URLSearchParams();
  if (status) destination.set('status', status);
  const query = destination.size ? `?${destination.toString()}` : '';
  redirect(`/publications/${recipeTin.id}${query}`);
}
