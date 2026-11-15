# Purpose: Aligning app documentation and tests with current behavior

## Progress History

- 2026-11-13: Drafted and revised the DLC 38 brief with the user. The user
  approved the separate desktop Divide field and conditional reader column,
  mobile `Divide a : b` content in the existing Prep cell, and a display-only
  dual-measure selection rule.
- 2026-11-13: Synchronized the approved contract across product references,
  reconciled older DLC 04 and DLC 37 UI wording, and linted all changed contract
  documents successfully. Read the installed Next.js client-component guide
  before beginning production changes.
- 2026-11-13: Implemented DLC 38 and completed the release documentation at
  app version 1.12.0. Focused unit tests passed (83), and four browser tests
  passed across Chromium and Fold 6, including responsive geometry and
  accessibility checks. Typecheck, error-level Biome checks, the production
  build, and lint on the changed product docs passed. The repository-wide
  Markdown lint still reports
  37 errors in unrelated existing files. The integrated browser remained at
  sign-in, so I did not capture a screenshot of an authenticated recipe view.
- 2026-11-14: The user clarified that a blank amount should mean no division,
  without a checkbox, and approved widening the recipe form to 1200px.
  Implemented amount-driven staging and clearing, updated the DLC 38 and visual
  design contracts, and reviewed authenticated editor screenshots at desktop
  and Fold 6 sizes. Targeted unit and browser tests, typecheck, production build,
  TypeScript lint, and the changed-document lint all passed.
- 2026-11-13: Refined reader labels and mobile table spacing, made mobile
  Preparation fit its options, and aligned the ingredient-set divider with the
  table. Updated the DLC 38 brief, visual-design contract, and E2E expectations.
  Eight targeted E2E runs passed across Chromium and Fold 6; 84 focused unit
  tests, typecheck, production build, and lint on the changed product documents
  passed. Authenticated Standard and Ingredient-first screenshots were inspected
  at desktop and mobile sizes.
- 2026-11-13: The user requested a per-row “divided” label above desktop portion
  pairs, a comma after mobile Preparation when a portion is shown, and at least
  4px of spacing between mobile table columns while keeping outer edges flush.
  The Chickpea Flour title casing comes from the title-cased synthetic fixture;
  the reader preserves multiword names.
- 2026-11-13: Corrected the synthetic fixture name, added the desktop per-row
  label and mobile comma/spacing, and updated the slice brief, visual-design
  contract, and focused assertions. The targeted Chromium E2E test passed, its
  desktop and mobile screenshots were inspected, 60 reader unit tests passed,
  and Biome reported no errors (28 warnings).
- 2026-11-13: Tightened mobile Standard ingredient line-height to 1.25 and
  right-aligned row text. Updated both product contracts and added mobile
  computed-style assertions. The focused reader E2E test passed on Chromium and
  Fold 6, a 300px screenshot showed the wrapped flour row as intended, typecheck
  and targeted Markdown lint passed, and the changed CSS/test formatting checks
  passed.
- 2026-11-13: Refined mobile Standard so only its Preparation/Size/Divide
  continuation is right-aligned, starts without a comma, and uses a 1.05
  line-height; the primary amount/name remains left-aligned. Hid the visible
  desktop Divide heading while preserving its semantic table header, increased
  internal mobile table padding to 6px, and updated the product contracts.
  Chromium and Fold 6 E2E tests, 67 focused unit tests, typecheck, changed-code
  Biome checks, stylesheet formatting, and targeted Markdown lint passed. Both
  authenticated screenshots were inspected; the integrated browser showed only
  the offline shell.
- 2026-11-13: Corrected the earlier Chickpea Flour diagnosis: the fixture is
  lowercase, but `private.normalize_ingredient_name` applies `initcap` to every
  catalog insert and rename, and the catalog contract requires title case.
  The existing recipe display helper lowercases only simple one-word names.
  A local seed preview reported loopback and zero writes; a temporary seed
  update returned title case, and a read-only check confirmed the stored name
  remained `Chickpea Flour`. The seed stopped before recipe processing, after
  its account-ensure/admin stage, so possible account provisioning is
  unreconciled. Removed the ineffective seeder change. A decision is needed
  on whether to lowercase all multiword names in recipe views.
- 2026-11-13: The user chose to lowercase all multiword ingredient names in
  recipe views. Added an opt-in to the shared formatter and enabled it only in
  the reader, preserving title-cased catalog and editor output. Updated the
  visual-design and DLC 38 contracts and added helper plus E2E assertions.
  Focused unit tests passed (85); Chromium and Fold 6 E2E passed (2); typecheck,
  Biome, product-document lint, and `git diff --check` passed. The integrated
  browser still showed only the offline shell, so no authenticated live-recipe
  screenshot was available.
- 2026-11-14: Completed the mobile reader spacing follow-up. Raised the
  same-line geometry tolerance to 2px for a 1.03125px browser baseline
  difference, and made the no-wrap assertion measure each content block so
  intentional Preparation/Divide lines are not mistaken for wrapping. Removing
  the two 1%-width mobile columns fixed a 9,100px intrinsic table width; the
  table now fits this 320px fixture without wrapping or page overflow. Scoped
  `text-transform: none` to Ingredient-first reader names to prevent the shared
  editor table header rule from uppercasing them. Chromium and Fold 6 E2E tests
  passed; desktop and mobile screenshots were inspected; typecheck, focused
  Biome, CSS formatting, product-document lint, and `git diff --check` passed.
- 2026-11-14: Clarified Standard mobile wrapping: keep a full entry inline when
  it fits; otherwise keep Preparation and Size with the primary text when
  possible, or move them with Divide as a compact right-aligned continuation.
  Implemented width-aware wrapping, updated both product contracts, and added
  assertions for inline, Divide-only, and grouped-continuation layouts.
  Chromium and Fold 6 E2E tests passed, and authenticated 300px screenshots
  were inspected.
- 2026-11-14: Tightened wrapped mobile Standard continuation spacing to about
  one-quarter of the text size after the preceding line, while keeping the next
  ingredient at the same line-to-line rhythm. The responsive E2E test now
  exercises a fractional amount and checks both vertical gaps after forcing a
  taller primary line, and also checks Divide-only wrapping. Chromium and Fold
  6 tests, typecheck, TypeScript Biome, CSS error-level lint, and
  `git diff --check` passed; the rendered list screenshot was inspected. Full
  Biome formatting still reports existing stylesheet formatting differences
  outside this change.
- 2026-11-14: Restored all-small-caps styling for Ingredient-first names at
  desktop and mobile, and updated the visual-design contract, DLC 38 brief,
  and responsive E2E assertions. Chromium and Fold 6 E2E tests, typecheck,
  focused Biome/CSS lint, and targeted document lint passed. Authenticated
  desktop and 320px screenshots were inspected. The desktop unified-Amount
  layout remains a deferred design idea; recommendation is to retain separate
  Volume and Weight columns for scanability and shorter rows.
- 2026-11-14: Stabilized the reader toolbar's right edge so changing the
  status/sort summary no longer moves the controls. The desktop summary no
  longer affects heading-row sizing, the desktop sort-direction slot stays
  reserved, and mobile retains its stacked summary/toolbar layout. Four
  focused browser tests passed across Chromium and Fold 6; typecheck, Biome
  lint, targeted Markdown lint, and `git diff --check` passed. Desktop and
  mobile screenshots were inspected and removed. The formatter check reports
  one unrelated existing formatting difference in the equipment-menu bounds
  assertion.
- 2026-11-14: At the user's direction, broadened the completed DLC 38
  workstream into a repository-wide audit to align documentation and test
  coverage with current app behavior. Preserve all existing uncommitted
  changes; use implementation and approved product contracts to identify
  stale claims, missing focused tests, and actionable suite failures.
- 2026-11-14: Completed the documentation/test audit. Updated the README,
  roadmap, engineering baseline, and DLC test guidance; tagged the omitted
  history E2E tests; and added Divide compatibility/output assertions and
  focused coverage. Corrected the legacy editor fixture to seed its historical
  ratio, updated the 8px mobile-spacing assertion, and made reader-print checks
  resilient to the hidden mobile Amount cell. The Divide compatibility and
  suggestion tests passed on Chromium and Fold 6; the responsive measurement
  and active-presentation print tests passed in focused runs. Local pgTAP
  (187 tests), Advanced Rules acceptance, ingredient-portions migration
  acceptance, typecheck, focused Biome, and patch checks passed.
- 2026-11-14: Full `npm test` exited 1 (unit: 667 passed; E2E: 417 passed,
  25 failed, 10 skipped) before the final test-only corrections. A later
  `npm run test:a11y` run had 121 passes and 6 failures in density, row reorder,
  Tags, and nutrition tests. The oversized public-print pagination test still
  fails in isolation. No clean-baseline comparison was made, so the remaining
  failures are recorded without attributing them to this work.
- 2026-11-15: The user asked to address the recorded test failures and the
  37 repository-wide Markdown lint errors. Reformatted the reported prompt and
  archived workstream lines; `npm run lint:md` now checks 125 files with zero
  errors. E2E and accessibility failure remediation is in progress.
- 2026-11-15: Focused serial runs confirmed stale expectations for lowercase
  reader names, the editor's eight-column table, multi-select focus handling,
  and responsive classification-field wrapping. Updated those assertions and
  the ingredient-table keyboard sequence. The long derived-density amount was
  visibly colliding with its icon; reallocating width from Divide to Amount
  corrected it. Focused density, recipe editor, Tags, nutrition, and row-order
  tests now pass. Oversized public-print pagination remains under investigation.
- 2026-11-15: Fixed public-print width divergence by constraining the ingredient
  table and wrapper to the generated output column; the focused print test now
  passes on Chromium and Fold 6. Updated the HTML-download assertion to ignore
  React's serialization comments while checking the visible `1 : 3` text. All
  seven E2E failures from the default full run passed when rerun individually;
  the single-worker accessibility suite passed (127, 1 skipped), while the
  two-worker run had four timeouts. The full single-worker E2E run completed
  with 437 passes, 10 skips, and four failures. Each of those four tests passed
  when rerun alone; the mobile ISBN flow also passed three repeated runs. This
  leaves intermittent full-suite failures unreconciled, with no clean-baseline
  comparison or verified root cause.

## Save Point

- Goal/status: DLC 38 and its approved refinements are implemented and
  documented in app version 1.12.0; Markdown lint is clean, and failure
  remediation is active.
- Repository/branch: `jlcbusiness/recipe-box`, `main`.
- Current step: Report the verified print fix and the unresolved full-suite-only
  failures; no remaining failure has been reproduced in a focused rerun.
- Last verified result: `npm run lint:md` checks 125 Markdown files with zero
  errors; typecheck, focused Biome, and `git diff --check` pass. The focused
  print test passes on Chromium and Fold 6. The accessibility suite passes with
  one worker (127 passed, 1 skipped); the full serial E2E run had 437 passes,
  10 skips, and four failures, all of which passed in focused reruns. Desktop
  and Fold 6 screenshots confirm the long derived value and calculator icon do
  not overlap. The full-suite failures have no verified root cause or clean
  baseline.
- Next action: If further diagnosis is requested, reproduce against a fresh
  local test state before changing unrelated tests; preserve all existing
  uncommitted DLC 38 changes. The proposed desktop unified-Amount layout remains
  deferred. A prior local seed may have ensured synthetic accounts/admin before
  stopping; that provisioning was not reconciled.
- Checklist: [checklist.md](./checklist.md)
- Trace: [trace.md](./trace.md); last entry: 2026-11-15, session
  `a471872d-f4e4-45e1-8534-c7608c40f234`; last action: verified full test
  outcomes, isolated the remaining E2E failures, and inspected desktop/Fold 6
  density screenshots.
