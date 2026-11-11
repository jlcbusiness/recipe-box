# Purpose: Implement and verify configurable recipe times

## Progress History

- 2026-11-10: Confirmed the user wants one new slice for the three Updates
  entries: configurable time types, automatic total time, and arithmetic
  expressions. The worktree was clean on `main`; the only existing workstream
  was for the separate Settings-tabs slice.
- 2026-11-10: Reviewed the slice prompt, DLC roadmap, product and data
  contracts, current recipe time fields and save path, shared picklist
  management, and existing time tests. Drafted DLC 33 and added it to the
  roadmap as a discussion candidate. The user prefers nearest-minute rounding
  with half-minutes up and removal of component-time Explorer filters, but
  approval from all parties is still pending. The user specified that a
  total-only legacy recipe should migrate its value as a Cook entry. The
  component-plus-total mismatch behavior remains in discussion; canonical
  contracts and implementation remain intentionally unchanged.
- 2026-11-10: Recorded the user's rationale for mapping total-only legacy
  values to Cook, recomputing mismatched manual totals from component entries,
  and retaining only Total Time in Find Recipes. These remain proposals until
  all parties are satisfied.
- 2026-11-10: The user clarified that the only parties involved are the user
  and assistant. With no remaining concerns, the slice choices are agreed;
  proceeding to canonical contract updates and implementation.
- 2026-11-10: `git diff --check` passed for the documentation changes.
- 2026-11-10: The user and assistant's agreed decisions are now the approved
  DLC 33 contract. Updated the roadmap, first-draft spec, comprehensive
  reference, data model, visual guide, decision log, and v11 bundle format;
  documentation checks are pending.
- 2026-11-10: Focused implementation checks passed: 133 unit tests, 22 pgTAP
  checks, typecheck, and E2E coverage for time-entry editing, Settings,
  database import, and public copying. The Settings timeout was a test setup
  issue (the test did not open the Recipe data tab) and now passes. The real
  import path exposed an ambiguous `recipe_id`; guarded migration follow-ups
  corrected it, and import create/replacement now preserves entries and total.
  Trash/restore retention and purge cascade are covered by pgTAP. The
  pre-migration legacy backfill and standalone screenshot review remain
  unverified; earlier broad public-header and Find Recipes E2E failures remain
  unattributed.
- 2026-11-11: Refined the time editor to use the shared drag grip and smooth
  row reordering, with Ctrl+Arrow keyboard controls and a polite position
  announcement. Replaced the prominent button with a full-width italic
  “add time” row. Updated the visual contract and DLC 33 brief. Focused
  Chromium and Fold 6 E2E checks, typecheck, desktop/mobile geometry checks,
  and screenshots passed; the standalone output review and legacy backfill
  remain unverified.
- 2026-11-11: Replaced Time Type's fixed picklist with the ingredient/
  preparation autocomplete pattern: focus shows the full managed list, typing
  narrows it, and selecting Add creates a type. Tab alone does not create an
  unmatched query. Added one aligned Minutes/Time Type header and regression
  coverage for scroll-stable menu height, filtering, explicit type creation,
  Tab behavior, and header/input alignment. Focused Chromium and Fold 6 E2E,
  typecheck, error-level Biome check, and `git diff --check` passed. Desktop and
  mobile screenshots show three rows and a derived `48 min` total. Mobile
  browser geometry confirmed aligned columns and no horizontal overflow; the
  live draft was not saved.
- 2026-11-11: Tightened the time-entry layout after the user requested compact
  three-digit minute fields, content-sized Time Type fields, and a Total value
  aligned with the minute column. A shared 40px track avoids `ch` unit
  differences between header and row font sizes. Total is now a grouped integer
  in the same 40px field, and its label is left-aligned. Typecheck, error-level
  Biome check, whitespace check, and six focused Chromium/Fold 6 recipe editor
  tests passed. Desktop/mobile screenshots and geometry checks confirmed
  aligned columns, a 1,047-minute total fitting without wrapping, and no
  horizontal overflow. The browser draft was not saved.
- 2026-11-11: Moved desktop remove actions beside their Time Type fields while
  retaining the far-edge action position on narrow screens. Removed the
  minute-field grid item's forced minimum height so its control centers with
  Time Type on mobile. Focused Chromium/Fold 6 tests, typecheck, Biome, and
  `git diff --check` passed; live desktop/mobile geometry and screenshots
  confirm the new layout. The browser draft was not saved.
- 2026-11-11: Kept remove actions beside Time Type at all viewport widths;
  focused Chromium/Fold 6 E2E, Biome, and whitespace checks passed. Inspection
  found two existing Save buttons: one after metadata and another in the Total
  row. The requested move needs clarification on whether to consolidate them.
- 2026-11-11: The user chose one Save action. Moved the form-level button to
  after Instructions and before Time, and removed the Total-row duplicate.
  Focused recipe and ingredient-row E2E checks passed (5 passed, 1 skipped),
  as did typecheck, Biome, and `git diff --check`. Desktop/mobile browser
  geometry and screenshots confirm one Save between the sections.
- 2026-11-11: Fixed recipe saves that dropped protected-source reference
  metadata during action parsing. Added regression coverage; focused unit tests
  (4/4), typecheck, Biome, and `git diff --check` passed. The user reported the
  fix seemed to resolve the issue; no live save was retried.
- 2026-11-11: A read-only comparison found all 51 recipes in the legacy-shaped
  synthetic fixture in the local synthetic-owner data, with all 164 expected
  entries and totals matching and no missing entries or total mismatches.
  One additional database recipe has three entries outside the fixture. The
  fixture has no total-only recipes, so this verifies component-time parity
  but not the agreed total-only-to-Cook fallback or migration provenance.
- 2026-11-11: The user confirmed no known total-only legacy recipes need
  separate verification; the local data is the only source of non-standard
  data, and the sole online recipe has full time entries. The isolated
  total-only fixture is not needed for the agreed scope. The migration fallback
  remains unexercised, but no longer blocks legacy verification for known data.
- 2026-11-11: Updated the synthetic seed loader to convert the legacy fixture's
  component times into ordered `recipe_time_entries`, use the DLC 33 save RPC,
  and detect time-entry changes during reseeding. Kept the fixture's legacy
  shape for migration verification and documented that choice. Updated the
  standalone DLC 13 advanced-rules script to create current time entries and
  use total-time filters; its generic facet check now uses a supported
  non-time field. Five focused unit tests, the DLC 13 local integration test,
  seed dry-run (zero writes), typecheck, Biome, syntax checks, and
  `git diff --check` passed. Full Markdown lint still reports 20 issues in the
  slice prompt and pre-existing workstream lines; the updated local synthetic
  data guide and new checklist items have no reported Markdown errors. No seed
  writes were made.
- 2026-11-11: Completed the standalone HTML screenshot review at desktop and
  mobile sizes. The public-copy E2E failure was traced to the underlying
  `save_recipe_with_relationships` overload rejecting protected-source
  reference fields before the patched save function could validate them.
  Added a guarded follow-up migration, applied it only to the isolated E2E
  database, and the focused public-copy test passed. The active local database
  was not reset; remaining broad E2E failures are still under investigation.
- 2026-11-11: Resolved the remaining public-action alignment test failure by
  aligning its assertions to the public content gutter rather than the left
  title column. Stabilized mobile measurements after viewport resize and
  corrected Settings assertions to match the mobile Print/Download column.
  The affected public-recipe and Find Recipes specs passed on Chromium (31/31).
  Fold 6 had 29 passes, 1 skip, and one separate Advanced Rules color assertion
  whose measured background matches the `:hover` CSS color; no unrelated UI
  change was made. Typecheck, Biome, and `git diff --check` passed. Stopped the
  test server and removed the isolated Supabase project and volumes; the active
  local database was not reset.
- 2026-11-11: The user requested an app-version update for DLC 33 and updates
  for project and global CLI tools. Followed the DLC 32 release convention:
  app version 1.7.0. The installed Supabase CLI is a project wrapper pinned at
  2.122.0; Supabase 3.1.0 is available. The project requires Node 26.x while
  the current environment runs Node 24.15.0. The baseline production build
  passed before upgrades; the user authorized updating global tools as well.
- 2026-11-11: Bumped app metadata to 1.7.0 and marked DLC 33 implemented in
  the roadmap and brief. Upgraded Node to 26.13.0; global npm, Corepack, and
  Vercel CLI to 12.2.2, 0.36.0, and 65.14.0; and project Supabase, Next,
  Biome, Playwright, Vite, Vitest, TypeScript, and the Vite React plugin to
  their current pinned versions. TypeScript was upgraded through 6.0.3 before
  7.0.2, with a successful build at each step. Updated Supabase v3 commands
  from removed `--local`/`--linked` flags to local-default and `--remote`
  targeting; retained the seed loader's own `--local` safety argument.
  CLI help and a read-only local database query passed. The CLI reports two
  deprecated auth signup config keys, which remain unchanged.
  Final build and all 629 unit tests passed; Biome lint passed with warnings.
  Full Markdown lint still reports existing issues in the slice prompt and
  workstream records. No Supabase-backed E2E or migration suite was run after
  the CLI upgrade.
- 2026-11-11: The user requested documentation and test follow-up. Running the
  isolated public-links migration suite under Supabase CLI 3.1.0 exposed a
  42501 failure when the DLC 33 time-total backfill updated a previously
  trashed recipe. The lifecycle guard requires its transaction context during
  this migration update. The test script's temporary stack was stopped and no
  matching test container remains; the active local database was not changed.
- 2026-11-11: Set the lifecycle context during the DLC 33 backfill and reran
  the isolated suite. Follow-up browser failures exposed a missing
  `NEXT_PUBLIC_SITE_URL` in the runner, a Chromium computed-style alias, and
  stale Settings-tab and responsive print assumptions in E2E tests. Corrected
  those issues. The final run passed all migrations, all three pgTAP files, and
  all 61 browser tests. Biome reported no errors and one existing warning at
  `tests/e2e/exports.spec.ts:794`. The active local database was not reset or
  modified. `npm run lint:md` still reports 24 existing findings in older
  prompt/workstream content; none are in the new checkpoint entry.

## Save Point

- Goal: implement and verify DLC 33 configurable recipe times.
- Status: DLC 33 is implemented in app version 1.7.0, and the requested
  project/global CLI updates are complete. The DLC 33 backfill lifecycle fix
  and isolated public-links migration suite are verified; all migrations,
  three pgTAP files, and 61 browser tests passed. Protected reference metadata
  is preserved on save, including public copies through a guarded follow-up
  migration. The 51-recipe component-time fixture comparison passed and is
  sufficient for the known legacy data in scope. The total-only fallback
  remains unexercised by choice.
- Repository/branch: `/home/joshlamont/Code/recipe-box`, `main`.
- Current step: implementation, test, and documentation follow-up is complete.
- Last verified result: `npm run test:migration:public-links` passed with all
  migrations applied, all three pgTAP files passing, and 61 browser tests
  passing. The isolated stack was cleaned up; the active local database was
  untouched.
- Next action: none; report the verified results.
- Checklist: [checklist.md](./checklist.md)
- Trace: [trace.md](./trace.md); session
  `5e531014-879e-48a6-8ae7-fd92222660c2`; last recorded action: isolated
  migration/browser-suite verification and focused Biome check. The earlier
  synthetic-owner SQL invocation remains summarized rather than fully traced.
