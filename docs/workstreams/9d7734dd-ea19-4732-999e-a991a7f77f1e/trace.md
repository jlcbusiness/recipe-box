# Purpose: Implement and verify DLC 46 nested library breadcrumbs

## 2026-11-20 — session 9d7734dd-ea19-4732-999e-a991a7f77f1e

Trace is partial: earlier implementation activity is available only through the
conversation summary, not a prior workstream trace.

- Updated `tests/e2e/recipe-tin-library.spec.ts` so the Recipe Tin test checks
  the breadcrumb destination and absence of duplicate attribution.
- Temporarily added screenshot capture guarded by `DLC_46_VISUAL_CHECK=1`.
- Ran `DLC_46_VISUAL_CHECK=1 npx playwright test
  tests/e2e/recipe-tin-library.spec.ts --project=chromium --grep "private
  recipe detail shows its parent path"`; 1 test passed and desktop/mobile
  screenshots were captured.
- Viewed both screenshots. The breadcrumb hierarchy and mobile wrapping were
  correct; removed the separator before the source link because it appeared as
  trailing punctuation on mobile.
- Removed the temporary screenshot code and both screenshot files.

## 2026-11-20 — acceptance and closure (session 9d7734dd-ea19-4732-999e-a991a7f77f1e)

- Bumped the app version with `npm version minor --no-git-tag-version
  --ignore-scripts`; verified `package.json` and both lockfile version fields
  agree on 1.18.0.
- Ran focused Playwright acceptance for private recipe detail, nested private
  routes, and public recipe detail on Chromium and Fold 6; all 6 passed.
- The first combined history run exposed stale E2E assertions for the removed
  `Back to recipe` and `Back to publication` links. Replaced them with
  breadcrumb path and activation assertions.
- Ran `history.spec.ts` with the breadcrumb tests. New history path assertions
  and Axe checks passed, but the two privacy cases returned HTTP 200 where the
  existing tests expect 404 on both browser projects. A separate Library test
  reproduced its existing missing-level-one-heading Axe failure in Chromium.
- Ran the history privacy cases in isolation; the same HTTP status mismatch
  reproduced. No route authorization behavior was changed.
- Ran `npm run typecheck`, focused `npx biome check` on changed UI/E2E files,
  and `git diff --check`; all passed. `npm run lint:md` reports 37 errors in
  other repository files; none are in the changed documentation.
- Checked the local database for the unique `Tin breadcrumb recipe` marker,
  verified its owner was a local test account, removed only that account, and
  confirmed no matching recipe remains.
- The initial cleanup command stopped before deletion because its guard assumed
  the wrong admin-response shape. A read-only SQL check confirmed the test-user
  address pattern; the corrected guard then deleted and verified the marker.
- Restored the generated `next-env.d.ts` references to the standard `.next`
  directory after the E2E server temporarily switched them to `.next-e2e`.

## 2026-11-20 — Add Recipe breadcrumb refinement (session 9d7734dd-ea19-4732-999e-a991a7f77f1e)

- Inspected the Add Recipe and Edit Recipe headers, relevant breadcrumb styles,
  the DLC 46 visual contract, and the nested-route E2E assertions. Captured the
  initial Add Recipe desktop and Fold 6 layouts.
- Changed shared separators from `›` to `>`. Removed the generic Add Recipe
  eyebrow and positioned its breadcrumb in that slot, aligned with the H1 and
  slightly closer to it. Recorded this refinement in the visual guide and brief.
- Added separator, no-eyebrow, and measured alignment assertions. The Add Recipe
  layout test passes on Chromium and Fold 6. Reviewed updated desktop/mobile
  screenshots and removed the temporary capture code and files.
- The broader nested-route test still reaches the previously recorded Library
  Axe failure on Chromium; the Fold 6 run passes. Geometry assertions pass on
  both projects before that unrelated check.
- `npm run typecheck`, focused Biome, related-file Markdown lint, and
  `git diff --check` pass.

## 2026-11-20 — final breadcrumb refinements (session 9d7734dd-ea19-4732-999e-a991a7f77f1e)

- Updated recipe-detail layout, comprehensive references, visual guide, first-draft
  specification, slice 4, and DLC 46 acceptance text for the final path/title spacing
  and toolbar/divider alignment.
- Added E2E geometry checks for the title gap, toolbar alignment, and section-divider
  placement. The detail-only run passes 2/2 on Chromium and Fold 6.
- The latest combined route run has five passes and one failure at the known
  Account App Data missing-H1 Axe check; breadcrumb assertions pass before it.
- `npm run typecheck` and `git diff --check` pass. Biome reports one existing
  descending-specificity warning in unrelated recipe-thumbnail selectors.
- `npm run lint:md` reports 37 pre-existing errors outside the edited documentation.

## 2026-11-20 — follow-up history and Axe checks (session 9d7734dd-ea19-4732-999e-a991a7f77f1e)

- Reproduced the recipe-history status assertion: expected 404, received 200 for
  a foreign user's streamed route. Read the installed Next.js 16.4.6 `notFound`
  and `loading` guides; both explain that streaming can preserve status 200.
- Updated history tests to assert streamed not-found semantics (`noindex`, no
  breadcrumb, and no private heading), rather than a fixed status code.
- The publication-history Axe check initially ran before streamed metadata set
  the title; added a title wait. The nested-route Axe scan raced the App Data
  loading boundary; added a wait for its existing H1.
- Ran focused recipe-history, publication-history, and nested-route tests:
  6/6 pass across Chromium and Fold 6. Typecheck and targeted Biome pass;
  `git diff --check` passes. Playwright's `.next-e2e` references in `next-env.d.ts`
  were restored to the normal `.next/dev` paths.
- Ran the complete history E2E file after the focused checks: 10/10 pass across
  Chromium and Fold 6. Updated the DLC brief and index with the verified status.
