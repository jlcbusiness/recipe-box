import { ForgotPasswordForm } from './form';

export default function ForgotPasswordPage() {
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
          <h1 id="page-title">Reset your password</h1>
          <p className="welcome-copy">We will send a reset link if the address has an account.</p>
          <ForgotPasswordForm />
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
