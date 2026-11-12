import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { PublicUsernameSettings } from '../../settings/public-username';

export default async function UsernamePage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect('/');
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('public_username')
    .eq('id', data.user.id)
    .maybeSingle();

  if (accountError || !account) {
    throw new Error('Unable to load your username.');
  }

  return (
    <main aria-labelledby="page-title" className="settings-main">
      <h1 id="page-title">Username</h1>
      <PublicUsernameSettings publicUsername={account.public_username} />
    </main>
  );
}
