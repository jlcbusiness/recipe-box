import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect('/');
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('is_admin')
    .eq('id', data.user.id)
    .maybeSingle();

  if (accountError) {
    throw new Error('Unable to verify administrator access.');
  }
  if (!account?.is_admin) {
    redirect('/recipes');
  }

  redirect('/settings?tab=app-admin');
}
