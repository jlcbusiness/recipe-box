import { isSelfSignupAllowed } from '../lib/auth/signup-mode';
import { SignInForm } from './sign-in-form';

export function HomePageView({
  selfSignupAllowed,
  isLocalDevelopment = false,
}: {
  selfSignupAllowed: boolean;
  isLocalDevelopment?: boolean;
}) {
  return (
    <div className="workspace-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Recipe Box home">
          <span className="wordmark-mark" aria-hidden="true">
            R
          </span>
          <span>Recipe Box</span>
        </a>
        <span className="workspace-label">PRIVATE RECIPE LIBRARY</span>
      </header>

      <main className="auth-main" aria-labelledby="page-title">
        <section className="auth-panel">
          <p className="eyebrow">YOUR COOKBOOK SHELF</p>
          <h1 id="page-title">Sign in</h1>
          <p className="welcome-copy">Open your private recipe library.</p>
          <SignInForm />
          <div className="auth-secondary-actions">
            <a href="/forgot-password">Forgot password?</a>
            {selfSignupAllowed && <a href="/sign-up">Create an account</a>}
          </div>
        </section>
      </main>

      <footer className="footer">
        {isLocalDevelopment && <span>Local development</span>}
        <span>Recipe Box</span>
      </footer>
    </div>
  );
}

export default function HomePage() {
  const isLocalDevelopment =
    process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_ENV !== 'preview';

  return (
    <HomePageView
      isLocalDevelopment={isLocalDevelopment}
      selfSignupAllowed={isSelfSignupAllowed()}
    />
  );
}
