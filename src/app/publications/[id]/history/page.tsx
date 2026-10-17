import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { type HistoryEventRow, HistoryEvents } from '../../../history/history-events';

export default async function PublicationHistoryPage({
  params,
}: PageProps<'/publications/[id]/history'>) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: publication, error: publicationError } = await supabase
    .from('publications')
    .select('id, name')
    .eq('id', id)
    .is('trashed_at', null)
    .maybeSingle();

  if (publicationError) throw new Error('Unable to load publication history.');
  if (!publication) notFound();

  const { data, error } = await supabase
    .from('publication_history')
    .select('id, actor_user_id, event_type, before_data, after_data, created_at')
    .eq('record_id', id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw new Error('Unable to load publication history.');

  return (
    <main className="recipes-main recipe-history-page" aria-labelledby="page-title">
      <Link className="recipe-history-back" href={`/publications/${id}`}>
        Back to publication
      </Link>
      <h1 id="page-title">History: {publication.name}</h1>
      <HistoryEvents entity="publication" events={(data ?? []) as HistoryEventRow[]} />
    </main>
  );
}
