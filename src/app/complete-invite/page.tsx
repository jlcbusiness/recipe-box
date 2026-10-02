import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { CompleteInviteForm } from './complete-invite-form';

export default async function CompleteInvitePage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user?.app_metadata.invitation_pending) {
    redirect('/sign-up?error=invalid-invite');
  }

  return (
    <div className="workspace-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Recipe Box home">
          <span aria-hidden="true" className="wordmark-mark">
            R
          </span>
          <span>Recipe Box</span>
        </a>
        <span className="workspace-label">PRIVATE RECIPE LIBRARY</span>
      </header>
      <main className="auth-main" aria-labelledby="page-title">
        <section className="auth-panel">
          <p className="eyebrow">ACCOUNT ACCESS</p>
          <h1 id="page-title">Finish creating your account</h1>
          <p className="welcome-copy">Choose a password for {data.user.email}.</p>
          <CompleteInviteForm />
        </section>
      </main>
      <footer className="footer">
        <span>Invited account</span>
        <span>Recipe Box</span>
      </footer>
    </div>
  );
}
