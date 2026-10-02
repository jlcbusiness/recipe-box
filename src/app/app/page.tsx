import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { signOut } from '../actions/auth';

export default async function WorkspacePage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect('/');
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('is_admin')
    .eq('id', data.user.id)
    .maybeSingle();

  return (
    <div className="private-shell">
      <nav aria-label="Main navigation" className="private-nav">
        <a aria-current="page" href="/app">
          Workspace
        </a>
        {account?.is_admin && <a href="/admin">Administration</a>}
      </nav>
      <div className="private-content">
        <header className="private-header">
          <span>{data.user.email}</span>
          <form action={signOut}>
            <button type="submit">Sign out</button>
          </form>
        </header>
        <main aria-labelledby="page-title">
          <p className="eyebrow">YOUR COOKBOOK SHELF</p>
          <h1 id="page-title">Your private workspace</h1>
          <p className="welcome-copy">Your library is ready for its first recipe.</p>
        </main>
      </div>
    </div>
  );
}
