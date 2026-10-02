export default function HomePage() {
  return (
    <div className="workspace-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Recipe Box home">
          <span className="wordmark-mark" aria-hidden="true">
            R
          </span>
          <span>Recipe Box</span>
        </a>
        <span className="workspace-label">LOCAL WORKSPACE</span>
      </header>

      <main className="welcome" aria-labelledby="page-title">
        <p className="eyebrow">YOUR COOKBOOK SHELF</p>
        <h1 id="page-title">Recipe Box</h1>
        <p className="welcome-copy">Your local recipe workspace is ready.</p>
        <div className="welcome-rule" aria-hidden="true">
          <span />
        </div>
      </main>

      <footer className="footer">
        <span>Local development</span>
        <span>Recipe Box</span>
      </footer>
    </div>
  );
}
