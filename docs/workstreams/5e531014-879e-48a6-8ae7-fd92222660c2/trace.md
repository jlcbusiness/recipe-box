# Purpose: Implement and verify configurable recipe times

## 2026-11-10 — Session 5e531014-879e-48a6-8ae7-fd92222660c2

- Read `.github/prompts/slice.prompt.md`, `AGENTS.md`, the DLC roadmap,
  first-draft specification, and related slice and product contracts.
- Confirmed the recipe form currently has nine fixed minute fields, an editable
  total, and a manual `Σ` action; save validation and the RPC payload carry
  those fixed fields.
- Checked the shared recipe picklist manager and database category constraint,
  existing reader/public output, time rules, recipe browser tests, and current
  per-type Explorer filters.
- Created the DLC 33 candidate brief and roadmap entry. No canonical time
  contract, database, or application implementation was changed.
- Ran `git diff --check`; it passed. `git status --short --branch` confirmed
  only the DLC roadmap, new brief, and new workstream notes are changed.
- User feedback: this is still a discussion draft, and no implementation or
  canonical contract updates should happen until all parties are satisfied.
  Recorded the current preferences for rounding and Find Recipes filters and
  clarified the legacy-total conversion in the candidate brief.
- User clarification: when a recipe has only a manual total, migrate it as a
  Cook entry with the same minutes. Updated the candidate brief; no
  implementation or canonical contract changes.
- User rationale: absent other detail, assume total-only recipes are being
  cooked; recompute totals when component values conflict with old manual
  totals; retain Total Time as the only Find Recipes time criterion because it
  better matches how people remember and search for recipe duration. Recorded
  this rationale as pending group agreement.
- Ran `git diff --check` after recording this rationale; it passed.
- Last recorded action: successful `git diff --check` after recording the
  latest discussion rationale.
## 2026-11-10 — Continued verification (session 5e531014-879e-48a6-8ae7-fd92222660c2; partial)

- `supabase test db supabase/tests/dlc33_recipe_times.test.sql --local` — passed 22 checks, including save/history, account-scoped Time Types, trash/restore retention, and purge cascade.
- `npx vitest run` on the eight focused time, Explorer, export, import, and public-copy test files — passed 133 tests.
- `npm run typecheck` — passed.
- Focused Playwright checks — passed recipe-time calculation/save, Time Type Settings and picklist management, and database import create/replacement with preserved time entries and derived totals.
- The Settings E2E timeout showed the test stayed on the Preferences tab. Updated the two Settings picklist tests to open Recipe data; both then passed.
- The import E2E exposed an ambiguous `recipe_id` in the patched import function. Added guarded local migration follow-ups `20261223060000` and `20261223070000`; the final import E2E passed. Local migration listing showed both versions applied.
- `npx biome check tests/e2e/import-commit.spec.ts tests/e2e/recipe-picklists.spec.ts` and `git diff --check` — passed.
- Earlier verification from the summarized session: public-copy E2E passed after its SQL validation fix; standalone browser screenshot access was refused. The legacy backfill has not been exercised against a pre-migration snapshot, and the broader public-header/Find Recipes E2E failures were not resolved here.

This trace section covers the resumed verification and final focused checks, not every implementation command from the earlier work summarized in chat.

## 2026-11-11 — Time-row UI refinement (session 5e531014-879e-48a6-8ae7-fd92222660c2)

- Reused `useReorderDrag` and `ReorderGrip` for time rows; added keyboard moves,
  position announcements, and the full-width italic “add time” row.
- Updated the visual-design contract, DLC 33 brief, and time-entry E2E coverage.
- `npm run typecheck`, `git diff --check`, and focused Biome checks completed
  without errors. The Chromium and Fold 6 recipe-time E2E tests passed.
- Desktop (1280x900) and mobile (384x915) browser checks showed the derived
  `20 min` total, italic add row, and no horizontal page overflow.
- The first focused browser-test run found both the live-region paragraph and
  Total Time output under `status`; the test now targets the paragraph and
  passes. A fresh browser page loaded without errors; an older hidden page had
  logged a stale `Plus is not defined` during refresh.
- Markdown lint still reports issues in the existing prompt and earlier trace
  entries. The DLC 33 reference lines and checklist lines flagged in the first
  run were wrapped; the workstream trace issues remain unchanged.
## Session 5e531014-879e-48a6-8ae7-fd92222660c2 — 2026-11-11

- Read the current visual-design and DLC 33 interaction contracts and the
  installed Next.js client-component directive guide.
- Reused `SuggestionCellEditor` for Time Type, with managed creation on an
  explicit Add selection and a guard against creating an unmatched query by
  Tab. Added one shared Minutes/Time Type header and aligned desktop/mobile
  columns.
- Updated the visual-design guide, DLC 33 brief, and focused recipe-time E2E
  coverage. The browser test checks menu height after scrolling, filtering,
  explicit type creation, Tab behavior, and header/input alignment.
- `npx biome format --write` was run on the changed TypeScript files after the
  first focused Biome check reported formatting diffs. The final
  `npx biome check --diagnostic-level=error --max-diagnostics=100 ...` passed.
- `npm run typecheck` passed. The focused command
  `npx playwright test tests/e2e/recipes.spec.ts --grep "recipe time entries calculate, validate, and save in order"`
  passed in Chromium and Fold 6. `git diff --check` passed.
- Browser verification used an unsaved draft with Prep 15, Cook 25, and Cooling
  8. The desktop screenshot and desktop/mobile geometry checks showed one
  header, aligned controls, and a `48 min` total; the draft was not saved. The
  earlier stale screenshot and
  browser click-actionability issues were resolved by checking live geometry
  and using a verified in-viewport interaction.

## Session 5e531014-879e-48a6-8ae7-fd92222660c2 continued — 2026-11-11

- Reviewed the user-provided mobile screenshot, current time-row styles, recipe
  editor layout test, and visual design/DLC 33 contracts.
- Constrained minute and Total fields to the same 40px grid track, sized Time
  Type inputs to the longest available option, left-aligned the Total label,
  and changed the editor Total to a grouped integer with an accessible
  “Total time in minutes” name. Updated the visual guide, DLC 33 contract, and
  affected E2E expectations.
- The first alignment assertion showed a 9px header/input offset because `ch`
  resolved against different font sizes in the header and row. Both now share a
  40px track. A broader test also retained an old center-alignment assertion
  for all labels; it now verifies Serves is centered and Total is left-aligned.
- Typecheck and the error-level Biome check passed. Six focused recipe time,
  recipe editor, and accessibility E2E checks passed in Chromium and Fold 6.
  `git diff --check` passed.
- Desktop and mobile screenshots/geometry checks confirmed 40px minute/Total
  fields, aligned headers and controls, left-aligned Total label, content-sized
  Time Type controls, and a visible `1,047` total without horizontal overflow.
  The browser draft was not saved.

*** End of File
## Session 7277b4f8-63fb-4d5e-b257-6f7491601f9e — 2026-11-11

- Read the active recipe form and existing ingredient/preparation suggestion
  control; reviewed the DLC 33 and visual-design interaction contracts.
- Inspected the live editor at desktop and mobile widths. The minute field's
  grid item filled the 48px row while its input remained at the top. A
  temporary CSS check confirmed `min-height: 0` centers it with Time Type.
- Updated the time-row markup and CSS so desktop remove actions follow the
  Time Type field and narrow screens retain the far-edge action. Added focused
  geometry assertions and updated the visual-design and DLC 33 contracts.
- `npx playwright test tests/e2e/recipes.spec.ts --grep "recipe time entries calculate, validate, and save in order"` — 2 passed (Chromium and Fold 6).
- `npm run typecheck` — passed.
- `npx biome check --diagnostic-level=error --max-diagnostics=100 src/app/recipes/recipe-form.tsx src/app/styles/recipe-workspace.css tests/e2e/recipes.spec.ts` — passed after applying the formatter's suggested line wrap.
- `git diff --check` — passed.
- Live browser checks at 855x900 and 384x915 confirmed the 8px desktop gap,
  shared mobile field centers, and narrow-screen action position; screenshots
  confirmed both layouts. The active browser draft was not saved.

## Session 7277b4f8-63fb-4d5e-b257-6f7491601f9e — 2026-11-11 (mobile action placement)

- Updated the responsive time-row layout so remove actions remain beside the
  Time Type field on mobile. Updated the visual contract, DLC 33 brief, and
  E2E geometry assertion.
- `npx playwright test tests/e2e/recipes.spec.ts --grep "recipe time entries calculate, validate, and save in order"` — 2 passed (Chromium and Fold 6).
- `npx biome check --diagnostic-level=error --max-diagnostics=100 src/app/styles/recipe-workspace.css tests/e2e/recipes.spec.ts` — passed.
- `git diff --check` — passed.
- Inspected the recipe form and live page: one Save button is after metadata
  and another is in the Time section's Total row. Asked the user which action
  should move or whether to consolidate them before changing the layout.

## Session 7277b4f8-63fb-4d5e-b257-6f7491601f9e — 2026-11-11 (single Save placement)

- The user selected one Save action. Moved the existing form-level Save row
  after Instructions and immediately before Time; removed the duplicate from
  the Total row. Updated the visual contract and DLC 33 brief.
- Updated the recipe-time test to check one Save button and its position at
  desktop/mobile widths, and updated the edit and ingredient-row layout tests.
- `npx playwright test tests/e2e/recipes.spec.ts tests/e2e/ingredient-rows.spec.ts --grep 'recipe time entries calculate, validate, and save in order|recipe edit swaps Save and Delete actions across desktop and mobile|desktop rows reorder by pointer and Ctrl\\+Arrow and reload'` — 5 passed, 1 skipped (the desktop-only ingredient-table test on Fold 6).
- `npm run typecheck` — passed.
- `npx biome check --diagnostic-level=error --max-diagnostics=100 src/app/recipes/recipe-form.tsx src/app/styles/recipe-workspace.css tests/e2e/recipes.spec.ts tests/e2e/ingredient-rows.spec.ts` — passed.
- `git diff --check` — passed.
- Live desktop/mobile checks confirmed exactly one Save button between
  Instructions and Time, the remove action beside Time Type, and no horizontal
  overflow. Screenshots captured both layouts; the active browser draft was
  not saved.

## Session 5e531014-879e-48a6-8ae7-fd92222660c2 — 2026-11-11 (partial save and legacy verification continuation)

- Updated recipe-save action parsing to retain protected-source reference
  metadata and added regression tests in
  [actions.ts](../../../src/app/recipes/actions.ts) and
  [recipe-save-time-entries.test.tsx](../../../tests/unit/recipe-save-time-entries.test.tsx).
- Focused unit tests passed (4/4); typecheck, Biome, and `git diff --check`
  passed. The user reported the save issue seemed resolved; no live save was
  retried.
- Read-only local database comparison: all 51 synthetic fixture recipes were
  present; all 164 expected entries matched, with no missing entries or total
  mismatches. One additional recipe had three entries outside the fixture.
- The fixture contains no total-only recipes, so it does not cover the
  total-only-to-Cook fallback. The prior summary did not retain the exact SQL
  invocation; this trace is partial.
- The user confirmed no known total-only legacy recipes need separate
  verification, and the sole online recipe has full time entries. The isolated
  total-only fixture was therefore dropped from the known-data verification
  scope; the fallback remains unexercised.

## Session 5e531014-879e-48a6-8ae7-fd92222660c2 — 2026-11-11 (synthetic seed update)

- Added `scripts/synthetic-recipe-time-entries.mjs` to map legacy fixture
  components into ordered entries, map a total-only value to Cook, and compare
  saved entries for reseed idempotency.
- Updated `scripts/seed-synthetic-site-sample.mjs` to call
  `save_recipe_with_time_entries`, pass its required make/nutrition fields, and
  include time-entry changes in its update check. Kept the fixture legacy
  shaped and documented the conversion in
  `docs/development/local-synthetic-data.md`.
- Updated `scripts/test-dlc13-advanced-rules.mjs` to create recipes through the
  current save RPC, use numeric total-time filter values, and test the generic
  facet endpoint with `serves` rather than unsupported time facets. The first
  integration attempts exposed those API distinctions; the final run passed.
- Added unit coverage for component ordering, total-only Cook mapping, empty
  times, comparison behavior, and all 51 fixture recipes (164 entries).
- `npm exec vitest -- run tests/unit/synthetic-recipe-time-entries.test.tsx`
  — 5 passed.
- `node scripts/seed-synthetic-site-sample.mjs --local --dry-run` — 7
  publications, 51 recipes, 122 generated photos, picklists validated, zero
  writes.
- `node scripts/test-dlc13-advanced-rules.mjs` — passed; its isolated local
  test accounts were cleaned up by the script.
- `npm run typecheck`, targeted Biome check, `node --check` for the updated
  scripts, and `git diff --check` — passed. No full seed write was performed.
- `npm run lint:md` — reported 20 errors in `.github/prompts/slice.prompt.md`
  and older lines in the workstream checklist/trace. It reported no errors in
  the updated local synthetic-data guide or the newly added checklist items.

## 2026-11-11 — Session 5e531014-879e-48a6-8ae7-fd92222660c2

- Focused public-recipe action E2E runs exposed stale desktop/mobile assertions. Updated alignment checks to use the public content gutter, waited for the mobile two-column grid after resize, and aligned Settings with Print/Download. The focused test passed.
- Ran `tests/e2e/public-recipes.spec.ts` and `tests/e2e/recipe-search.spec.ts` on Chromium: 31 passed.
- Ran the same specs on Fold 6: 29 passed, 1 skipped, 1 failed. The remaining failure is the separate Advanced Rules Clear All color assertion; its observed background matches the `:hover` rule, and no unrelated UI change was made.
- `npm run typecheck` passed. Applied Biome formatting, then `npx biome check tests/e2e/public-recipes.spec.ts` and `git diff --check` passed.
- Stopped the test server, stopped and removed the isolated `recipe-box-dlc33-e2e` Supabase containers and volumes, and removed the copied project and task-specific E2E output folders. Verified port 3001, containers, and volumes were stopped; the active local database was not reset.

## 2026-11-11 — Version and CLI updates (session 5e531014-879e-48a6-8ae7-fd92222660c2)

- Installed Node 26.13.0 from the official archive after verifying its checksum and
  updated the shell PATH. Installed and verified global npm 12.2.2, Corepack 0.36.0,
  and Vercel CLI 65.14.0.
- Updated package metadata and lockfile to app version 1.7.0. Upgraded TypeScript
  sequentially from 5.9.3 to 6.0.3 and then 7.0.2; the production build passed
  at both steps.
- Updated project Next.js, Supabase CLI, Biome, Playwright, Vite, Vitest, and
  Vite React plugin. Supabase CLI v3 help confirmed local-default targeting and
  `--remote` syntax for migrations, migration lists, database pushes, and pgTAP
  tests. A read-only `supabase db query` succeeded against the local default
  target. Its output also reported existing deprecations for
  `auth.email.enable_signup` and `auth.sms.enable_signup`; those config keys
  remain unchanged.
- Removed obsolete Supabase `--local` arguments from app scripts and E2E helpers;
  kept the seed script's separate `--local` guard. Updated current docs to use v3
  local-default and explicit remote database commands. `supabase link --project-ref`
  remains supported.
- Migrated `biome.json` to schema 2.6.7 and applied targeted formatting/safe
  fixes, including awaiting one Playwright CSS assertion. Added a `next/image`
  mock in the homepage unit test so the test does not depend on Next's
  static-image transform.
- Final `npm run build`, `npm run test:unit` (629 tests), and `npm run lint`
  passed; Biome reported 156 warnings. `npm run lint:md` still reports 24
  existing findings in `.github/prompts/slice.prompt.md` and prior workstream
  records; the updated release and Supabase guidance docs were not reported.
- `npm outdated --depth=0` showed no outdated requested CLI packages. Other
  runtime/development library packages remain outdated and were outside the
  agreed CLI-only scope. No Supabase-backed E2E or migration suite was run after
  the CLI upgrade; no remote Supabase operation was performed.

## 2026-11-11 — Isolated migration and browser follow-up (session 5e531014-879e-48a6-8ae7-fd92222660c2)

- Ran `npm run test:migration:public-links` against its temporary Supabase
  project. The first run exposed a lifecycle-guard rejection (`42501`) in the
  DLC 33 time-total backfill for trashed recipes. Updated the migration to set
  lifecycle context while its history and timestamp triggers are disabled.
- Reran the suite and traced the public-copy failure to the isolated Next
  server missing `NEXT_PUBLIC_SITE_URL`; set it to the temporary server URL.
  Updated the computed-style assertion to accept Chromium's equivalent
  `flow-start` serialization, made the export E2E tests open the Account & data
  tab, and aligned the ingredient-set public print test with the desktop Print
  action and mobile Print & Download menu.
- Final `npm run test:migration:public-links` passed: all 12 applicable
  migrations applied, all three pgTAP files passed, and 61 browser tests
  passed. The temporary stack was cleaned up; `docker ps` showed only the
  existing local Supabase containers. The active local database was not reset
  or modified.
- Ran `npx biome check` on the four edited E2E/test-runner files. It completed
  without errors and reported one existing `noNonNullAssertion` warning in
  `tests/e2e/exports.spec.ts:794`.
- Ran `npm run lint:md`. It reported 24 existing findings in older prompt and
  workstream content; none were in the appended checkpoint entry.
