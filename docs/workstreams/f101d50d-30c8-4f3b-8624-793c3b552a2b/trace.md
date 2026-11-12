# Purpose: Move account tools and admin work into clear destinations

## 2026-11-11 — Session f101d50d-30c8-4f3b-8624-793c3b552a2b

- Read repository instructions, the slice prompt, Settings/Admin briefs,
  product references, implementation, and related browser tests.
- Checked repository state; it was clean before planning edits.
- Confirmed `package.json` and `package-lock.json` are at version 1.7.0.
- Tried opening Settings at `localhost:3000` and `localhost:3001`; both refused
  the connection. No server was started.
- Drafted DLC 34, added its candidate roadmap entry and decision-log record,
  and created this workstream checklist and save point.

## 2026-11-11 — Review checkpoint — Session f101d50d-30c8-4f3b-8624-793c3b552a2b

- Ran `git diff --check`; it passed.
- Tried targeted Markdown lint; it could not run because
  `node_modules/.bin/markdownlint` is unavailable. Dependencies were not
  restored for this documentation-only review checkpoint.
- Clarified the tab scope in DLC 34 after user feedback; existing Preferences
  and Recipe data tabs remain, Account & data alone is removed, and two
  admin-only tabs are added.
- The user approved the brief and `/account/username` and `/account/app-data`
  route proposals.

## 2026-11-11 — Implementation and verification — Session f101d50d-30c8-4f3b-8624-793c3b552a2b

- Updated canonical product/design docs, implemented account pages and
  admin-only Settings tabs, adjusted redirects/action return paths, and
  revised related E2E specs.
- Ran `npm run typecheck`; it passed.
- Ran `npm run test:unit`; all 64 Vitest files (629 tests) and 8
  bootstrap-admin tests passed.
- Ran `npm run lint`; it passed with warnings (156 repository warnings).
- Ran `npm run lint:md`; it reported existing issues in
  `.github/prompts/slice.prompt.md` and another workstream, plus trailing
  whitespace in the DLC 34 brief. Corrected the DLC 34 whitespace; unrelated
  Markdown issues were left unchanged.
- Ran `git diff --check`; it passed.
- Focused E2E and visual checks remain unverified. The E2E app startup failed
  earlier on migration
  `20261223080000_dlc31_allow_protected_reference_fields.sql`, which did not
  find its expected relationship allow-list fragment exactly once. No local or
  hosted database state was reset or repaired.

## 2026-11-11 — Migration unblock and UI verification — Session f101d50d-30c8-4f3b-8624-793c3b552a2b

- Read the pending migration and local `pg_get_functiondef` result. The local
  function already contained exactly one new allow-list fragment and no old
  fragment; local migration history ended at `20261223070000`.
- With user approval, updated
  `20261223080000_dlc31_allow_protected_reference_fields.sql` to replace the
  old fragment exactly once or no-op when the new fragment already exists
  exactly once; all other states still raise an error.
- Ran `supabase migration up` against the local stack; it applied
  `20261223080000_dlc31_allow_protected_reference_fields.sql`. No reset was
  run and no hosted database was targeted.
- Ran the initial 104-test affected E2E selection: 82 passed, 20 failed, and
  2 skipped. The failures exposed mobile reset-action ordering, a reset test
  still navigating to `/settings`, and an outdated import archive fixture
  that included `recipe_time_entries` for schema version 3.
- Corrected those three issues. Reran reset and import E2E specs with one
  worker: 12 passed across Chromium and Fold 6. Reran account destination/admin
  E2E specs: 4 passed across Chromium and Fold 6, including axe checks and
  responsive geometry. Reviewed desktop and 307px mobile App data screenshots.
- Final `npm run typecheck`, `npm run test:unit` (629 tests plus 8
  bootstrap-admin tests), `npm run lint`, and `git diff --check` passed.
  Markdown lint still reports 24 unrelated errors in
  `.github/prompts/slice.prompt.md` and another workstream. The remaining
  broader E2E failures concerned nutrition, recipe-column persistence, and a
  footer computed-style assertion; they were not changed as part of this slice.
- Updated package metadata to version 1.8.0 using
  `npm version 1.8.0 --no-git-tag-version --ignore-scripts`. Verified
  `package.json` and both `package-lock.json` version fields report 1.8.0.
  Reran `npm run test:e2e -- tests/e2e/account-settings.spec.ts --workers=1`;
  all 4 Chromium and Fold 6 tests passed. Reran `npm run lint` and
  `git diff --check`; both passed.
## 2026-11-11 — App data layout follow-up (session 626131e5-5a28-43d6-90cd-9eddeedde4d3)

- Updated the Account menu spacing and App data action order, centering the
  transfer actions and placing Wipe last in normal flow, 12px above the footer.
- Ran focused account and reset Playwright tests on Chromium and Fold 6: 10
  passed, including desktop/mobile centering, footer-gap, and no-scroll checks.
- Ran `npm run typecheck`: passed.
- Ran changed-file `npx biome check`: passed with 39 CSS warnings.
- Captured and inspected the App data screenshots at desktop and 307px mobile.
- Ran `git diff --check`: passed.
## 2026-11-11 — Account menu spacing refinement (session 626131e5-5a28-43d6-90cd-9eddeedde4d3)

- The user selected 32px link rows after clarifying that 48px still looked like
  an extra line of blank space.
- Updated the Account menu, geometry assertion, and DLC 34/visual design
  contracts to use 32px links as an explicit mobile touch-target exception.
- Ran account Settings E2E tests on Chromium and Fold 6: 4 passed.
- Ran `npm run typecheck` and changed-file `npx biome check`: passed.
- Captured and inspected the Fold 6 Account menu screenshot; the link rows are
  32px apart.
- Ran `git diff --check`: passed.
## 2026-11-11 — Account menu Sign out gap (session 626131e5-5a28-43d6-90cd-9eddeedde4d3)

- Added 8px between the App data link and Sign out button; preserved the 32px
  spacing between Username and App data.
- Ran the account menu E2E test on Chromium and Fold 6: 2 passed, including the
  32px row and 8px button-gap assertions.
- Ran `npm run typecheck` and changed-file `npx biome check`: passed.
- Inspected the mobile menu screenshot.
- Ran `git diff --check`: passed.

## 2026-11-11 — DLC 34 acceptance check (session 626131e5-5a28-43d6-90cd-9eddeedde4d3)

- Ran the focused Settings, admin Updates/invitation, reset, import, and
  account E2E specs on Chromium and Fold 6: 52 passed, 4 failed.
- The two failing test cases repeated in both projects: a footer
  `justify-content` computed-style assertion and Recipe column-order saving.
- The Recipe column-order test received `Recipe column order could not be
  saved.` No cause was established; preserve this as an open acceptance item.

## 2026-11-11 — Recipe order reload investigation (session f101d50d-30c8-4f3b-8624-793c3b552a2b)

- Ran the focused recipe-column E2E test on Chromium. The database read from
  the Playwright API context showed the new order before and after reload, but
  the Settings server render showed the previous order.
- Compared endpoint host and account identity fingerprints without recording
  credentials or account IDs; both pointed to the same local Supabase project
  and test account.
- Added temporary server-side Supabase and raw no-store fetch reads; both
  returned the previous order. A full account projection queried by the test
  API context returned the saved order.
- Tried targeted `revalidatePath('/settings')`, a force-dynamic Settings route,
  and disabling the development HMR fetch cache. None resolved the discrepancy;
  removed these experiments and all temporary logs.
- Ran the footer and recipe-order tests on Chromium and Fold 6: both footer
  tests passed; both recipe-order reload assertions failed.
- Ran `npm run typecheck` and `git diff --check`; both passed.
- Current result: the local RPC accepts the UI's supported column order and the
  database value persists. The stale authenticated server read remains
  unresolved; no hosted database was changed.

## 2026-11-11 — Recipe-order fix and focused DLC 34 verification (session f101d50d-30c8-4f3b-8624-793c3b552a2b)

- Confirmed the reload failure was caused by `normalizeRecipeColumnOrder`
  rejecting the nine legacy recipe-time keys retained in the saved order.
  The existing fix filters only those keys; the regression test keeps unknown
  keys and duplicates invalid. `npx vitest run
  tests/unit/explorer-state.test.tsx` passed 18 tests.
- Ran `npm run test:e2e -- tests/e2e/settings.spec.ts --workers=1`: 24 passed
  across Chromium and Fold 6, including recipe-order persistence and footer
  geometry.
- The broader focused selection initially passed 60/72. The 12 failures were
  scoped-import tests; their error context showed fixture recipes missing the
  required `total_time_minutes`. Updated the shared archive fixture to default
  omitted totals to zero. `npm run test:e2e -- tests/e2e/import-scoped.spec.ts
  --workers=1` then passed 14/14.
- Reran the eight-spec DLC 34-focused selection: 72 passed. The dev server
  emitted non-fatal stream-write errors during passing runs; their cause was
  not investigated.
- Final `npm run typecheck`, targeted `npx biome check`, and
  `git diff --check` passed. The full repository E2E suite was not run.

## 2026-11-12 — Username and App data acceptance spot check (session f101d50d-30c8-4f3b-8624-793c3b552a2b)

- Read the DLC 34 acceptance criteria and checked the targeted Username and
  App data export browser cases.
- Ran `npx playwright test tests/e2e/public-recipes.spec.ts
  tests/e2e/exports.spec.ts --grep "first-time direct publishing collects a
  username|App data, publication detail, and recipe detail expose accessible
  export actions with retry" --workers=1 --reporter=line`: Username passed on
  Chromium and Fold 6; App data export/retry passed on Chromium but failed on
  Fold 6 when an exact button-Y stability assertion observed a 12.75px shift
  after the error alert appeared. The Fold 6 case did not reach its retry
  assertions.
- The DOM showed the alert below the export button. The transfer group uses
  vertical centering, which plausibly explains the shift as its contents grow;
  whether this violates the intended contract remains unresolved.

## Session f101d50d-30c8-4f3b-8624-793c3b552a2b — 2026-11-12

- Updated App data feedback positioning and the export geometry assertions.
- Ran the focused export/retry Playwright test for Chromium and Fold 6:
  2 passed. Inspected both error-state screenshots; feedback is below Import
  and above Wipe all account data, and the action positions remain stable.
- Ran `npm run typecheck`: passed.
- Ran targeted Biome on the changed CSS and E2E test: exited successfully
  with CSS warnings.
- Updated the visual-design and comprehensive-reference contracts.
- Targeted Markdown lint on both updated product-contract documents passed.
  `npm run lint:md` reports 30 existing issues in other documents and earlier
  workstream trace entries.
- Ran `git diff --check`: passed.
- Removed the inspected temporary screenshot output directory.
