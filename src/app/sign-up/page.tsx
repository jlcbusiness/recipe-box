import { isSelfSignupAllowed } from '../../lib/auth/signup-mode';
import { SignUpForm } from './sign-up-form';

export default function SignUpPage() {
  const selfSignupAllowed = isSelfSignupAllowed();

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
          <h1 id="page-title">Create your account</h1>
          <p className="welcome-copy">
            {selfSignupAllowed
              ? 'Start your private recipe library.'
              : 'Self sign-up is closed. Ask an admin for an invitation.'}
          </p>
          {selfSignupAllowed ? (
            <SignUpForm />
          ) : (
            <p className="auth-feedback" role="status">
              New accounts are available by invitation.
            </p>
          )}
          <a className="recovery-link" href="/">
            Back to sign in
          </a>
        </section>
      </main>
      <footer className="footer">
        <span>Private account</span>
        <span>Recipe Box</span>
      </footer>
    </div>
  );
}
