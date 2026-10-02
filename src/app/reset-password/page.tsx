import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { ResetPasswordForm } from './form';

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect('/');
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
          <h1 id="page-title">Choose a new password</h1>
          <p className="welcome-copy">Use at least 8 characters.</p>
          <ResetPasswordForm />
        </section>
      </main>
      <footer className="footer">
        <span>Private account</span>
        <span>Recipe Box</span>
      </footer>
    </div>
  );
}
