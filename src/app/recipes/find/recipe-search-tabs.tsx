'use client';

import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from 'react';

export type RecipeSearchMode = 'search' | 'query';

type RecipeSearchModeContextValue = {
  mode: RecipeSearchMode;
  setMode: (mode: RecipeSearchMode) => void;
};

const RecipeSearchModeContext = createContext<RecipeSearchModeContextValue | null>(null);

export function RecipeSearchModeProvider({
  children,
  initialMode,
}: {
  children: ReactNode;
  initialMode: RecipeSearchMode;
}) {
  const [mode, setMode] = useState(initialMode);

  return (
    <RecipeSearchModeContext.Provider value={{ mode, setMode }}>
      {children}
    </RecipeSearchModeContext.Provider>
  );
}

export function useRecipeSearchMode() {
  return useContext(RecipeSearchModeContext);
}

export function RecipeSearchTabs({
  searchPanel,
  queryPanel,
}: {
  searchPanel: ReactNode;
  queryPanel: ReactNode;
}) {
  const searchMode = useRecipeSearchMode();
  if (!searchMode) throw new Error('RecipeSearchTabs must be inside RecipeSearchModeProvider.');

  const { mode, setMode } = searchMode;
  const tabRefs = useRef<Record<RecipeSearchMode, HTMLButtonElement | null>>({
    search: null,
    query: null,
  });

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: RecipeSearchMode) {
    const nextMode =
      event.key === 'ArrowRight' || event.key === 'ArrowLeft'
        ? current === 'search'
          ? 'query'
          : 'search'
        : event.key === 'Home'
          ? 'search'
          : event.key === 'End'
            ? 'query'
            : null;

    if (!nextMode) return;
    event.preventDefault();
    setMode(nextMode);
    tabRefs.current[nextMode]?.focus();
  }

  return (
    <div className="find-recipes-workspace">
      <div aria-label="Search mode" className="find-recipes-tabs" role="tablist">
        <button
          aria-controls="find-recipes-search-panel"
          aria-selected={mode === 'search'}
          className="find-recipes-tab"
          id="find-recipes-search-tab"
          ref={(element) => {
            tabRefs.current.search = element;
          }}
          role="tab"
          tabIndex={mode === 'search' ? 0 : -1}
          type="button"
          onClick={() => setMode('search')}
          onKeyDown={(event) => handleTabKeyDown(event, 'search')}
        >
          Search
        </button>
        <button
          aria-controls="find-recipes-query-panel"
          aria-selected={mode === 'query'}
          className="find-recipes-tab"
          id="find-recipes-query-tab"
          ref={(element) => {
            tabRefs.current.query = element;
          }}
          role="tab"
          tabIndex={mode === 'query' ? 0 : -1}
          type="button"
          onClick={() => setMode('query')}
          onKeyDown={(event) => handleTabKeyDown(event, 'query')}
        >
          Query
        </button>
      </div>
      <input name="tab" type="hidden" value={mode} />
      <section
        aria-labelledby="find-recipes-search-tab"
        className="find-recipes-tabpanel find-recipes-tabpanel-search"
        hidden={mode !== 'search'}
        id="find-recipes-search-panel"
        role="tabpanel"
      >
        {searchPanel}
      </section>
      <section
        aria-labelledby="find-recipes-query-tab"
        className="find-recipes-tabpanel find-recipes-tabpanel-query"
        hidden={mode !== 'query'}
        id="find-recipes-query-panel"
        role="tabpanel"
      >
        {queryPanel}
      </section>
    </div>
  );
}
