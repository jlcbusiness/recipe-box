# Purpose: Deliver Count and Things measure equivalents

## Progress History

- 2026-11-12: Started a candidate slice for switching recipe quantities between
  Count/Things and configured measure equivalents. The user clarified that a
  saved trusted density must return when the equivalent no longer has both
  volume and weight, and that derived effective density should have an icon
  tooltip.
- 2026-11-12: Reviewed the comprehensive reference, data model, roadmap,
  related DLC briefs, transient reader unit picker, density conversion rules,
  and Settings equivalent editor. No production code or canonical product
  contract has been changed.
- 2026-11-12: Drafted candidate DLC 35 and added it to the roadmap. The brief
  proposes a derived effective-density display that preserves the saved
  trusted density as fallback. `git diff --check` passes; repository Markdown
  lint reports no issues in the new brief or workstream, with 30 existing
  errors in other files.
- 2026-11-12: The user revised the precedence rule: trusted density takes
  precedence over paired measure estimates. Updated the candidate direction so
  one equivalent dimension derives the other when density exists, while both
  may be explicit without density. Existing two-dimensional equivalents need
  a compatibility decision before implementation.
- 2026-11-12: Revised the brief and roadmap to use the green density-calculator
  treatment in the equivalent editor and to keep the trusted density
  authoritative. Rechecked documentation; changed files have no Markdown
  lint errors, `git diff --check` passes, and 30 unrelated repository lint
  errors remain.
- 2026-11-12: The user chose Weight as the temporary source for existing
  two-dimensional mappings with a trusted density, preserving both values
  until edit and prompting for the source choice then. The calculated field is
  read-only; clearing the source switches dimensions. Updated the brief to
  record these choices.
- 2026-11-12: The user suggested explaining the calculated value with a
  tooltip on the calculator icon. Updated the brief to require a hover,
  keyboard-focus, and touch tooltip while retaining the `Derived from density`
  accessible status.
- 2026-11-12: Rechecked the tooltip revision. `git diff --check` passes; the
  candidate brief and current workstream remain free of Markdown lint errors,
  while the same 30 existing errors remain elsewhere.
- 2026-11-12: Reviewed the existing nutrition calculation path and found that
  it prefers an explicit equivalent for the target dimension before using
  density. Updated the brief to require consistent resolution in nutrition
  calculations, including public recipe-level output without exposing Settings.
- 2026-11-12: The user approved the revised DLC 35 brief, including trusted
  density precedence, the legacy Weight-source behavior, the icon tooltip, and
  consistent nutrition calculation. Implementation is now authorized.
- 2026-11-12: Completed DLC 35 implementation and updated the canonical
  contracts, slice brief, and roadmap. Focused Vitest passed 77 tests; the
  density/equivalent E2E suite passed all six Chromium and Fold 6 cases; private
  print and public-link privacy tests passed on both projects. Typecheck,
  targeted Biome, and `git diff --check` passed. Markdown lint still reports 30
  existing errors in unrelated files. The print test also emitted a Next
  stream-write error while passing; its cause remains unresolved.
- 2026-11-12: The user clarified the reader interaction: when both equivalent
  dimensions are available, Count/Things initially switches to both physical
  dimensions, then each unit list switches its own slot back independently;
  collapse only when both select Count/Things. A single available dimension is
  shown initially with Count/Things in its normal unit list. Updated the
  contracts, reader state/rendering, and unit/E2E coverage. All 641 unit tests
  and typecheck passed; all six density UI E2E tests passed across Chromium and
  Fold 6, including print, accessibility, and mobile overflow checks. Targeted
  Biome and `git diff --check` passed. Markdown lint continues to report 30
  unrelated existing errors.
- 2026-11-12: Removed the extra `Recipe measurement` phrasing from
  Count/Things choices and removed the separate `Recipe default` menu item;
  choosing the saved unit restores that dimension. Updated DLC 35, the
  comprehensive reference, and visual design contract, and added focused unit
  and E2E assertions. The reader unit file passed (55 tests), the equivalent
  E2E passed on Chromium and Fold 6 (2 tests), typecheck, targeted Biome, and
  `git diff --check` passed. Markdown lint still reports 30 existing issues in
  unrelated files.
- 2026-11-12: The user selected app version 1.9.0 for DLC 35. Updated package
  metadata and the lockfile, the DLC 35 brief, and the delivery roadmap.
  Verified `package.json` and both lockfile version fields match. Scoped
  whitespace checks pass; the full check still reports trailing whitespace in
  the pre-existing `.github/prompts/update.prompt.md` edit.
- 2026-11-12: Resumed in session `55a5aef2-c5f1-44fb-ad69-976e9f10efbd` to
  close the remaining DLC 35 evidence gaps with focused E2E coverage for
  legacy paired-equivalent source selection and Guest/public privacy.
- 2026-11-12: Added both acceptance E2Es. The legacy case verifies an explicit
  pair becomes source-choice-required when density is added, then saves only
  the chosen source while preserving trusted density. The Guest case verifies
  private equivalent values are absent from public HTML and reader controls.
  Both tests pass on Chromium and Fold 6; typecheck, scoped Biome, and
  `git diff --check` pass.
- 2026-11-12: The user requested the full test suite and any additional checks
  that could increase confidence in DLC 35. The current task is to run
  `npm test` and the production build; the test web server applies local
  migrations but does not reset the local database.
- 2026-11-12: The full `npm test` run passed all 653 unit tests, then reported
  380 E2E passes, 52 failures, and 10 skips. Because the E2E command failed,
  the chained accessibility phase did not run; running `npm run test:a11y`
  separately produced 100 passes, 25 failures, and 1 skip. The production
  build passed.
- 2026-11-12: Investigated DLC 35-related nutrition E2E failures. The Settings
  checks needed to select the Recipe data tab, and the public nutrition check
  needed to set the required public username before publishing. After updating
  those test preconditions, the focused nutrition/settings/database-bundle
  group passed on Chromium and Fold 6 (5 passed, 1 expected Fold 6 skip).
  Scoped Biome and typecheck passed. The other broad-suite failures remain
  untriaged, so their relation to DLC 35 is undetermined.
- 2026-11-12: Fixed the source-links geometry test after the configurable-time
  editor removed the fixed Rest input it used as an alignment anchor. Removed
  the now-dead measurement effect, documented the current desktop 3-inch
  minimum/50%-row maximum, and verified the source-links E2E on Chromium and
  Fold 6. Typecheck, focused TypeScript Biome, and `git diff --check` passed.
  A broader Biome check including `recipe-media.css` still reports diagnostics
  elsewhere in that stylesheet. Other broad-suite failures remain.
- 2026-11-12: Reproduced the public offline-cache E2E failure on both projects:
  the test created a private recipe and visited its stable public ID. Added the
  existing public-username and visibility setup before navigation; both
  projects now pass. The media cleanup queue E2E also passes on both projects
  without changes, so that prior failure did not reproduce in isolation.
- 2026-11-12: The complete measurements E2E file reproduced two failures on
  both projects: its text-width assertion contradicted the established
  suggestion-sized Preparation editor. Updated the test to check the actual
  3mm input/control gap and click that gap; all 8 measurement tests now pass
  on both projects. Focused Biome passes. The passing run logged one
  non-failing Next destination-stream write error; its cause remains unknown.
- 2026-11-12: The reported-fixes E2E timeout came from using the private
  `Make private` switch on a public recipe and opening a nonexistent public
  Print menu; corrected the fixture to publish the recipe and use the public
  Print action. The complete reported-fixes file passes all four cases across
  Chromium and Fold 6. The complete recipe-search file passes 31 tests with
  one existing Fold 6 skip.
- 2026-11-12: The accessibility rerun exposed stale checks for the Settings
  heading size and hidden dialog buttons in a mobile toolbar row count. The
  admin test now expects the responsive 34px heading, and the export test
  measures visible actions only; both focused cases pass on both projects.
  The full accessibility suite passes 125 tests with one skip.
- 2026-11-12: The full E2E rerun exposed three remaining test issues. The
  saved Count-average test now opens Recipe data on both Settings visits; the
  public Rating check matches the numeric token so a test username cannot
  cause a false positive; and the Fold 6 offline failure passed both in
  isolation and in the full offline spec. A final full E2E run passes 432
  tests with 10 skips. The full unit suite passes 653 tests, typecheck and
  production build pass, `npm run lint` exits successfully with 171 advisory
  warnings, and `git diff --check` passes. Non-failing Next.js stream-abort
  messages still appear during E2E execution; their cause remains unknown.

## Save Point

- Goal: deliver Count and Things measure equivalents with trusted-density precedence and clear the repository-wide test failures uncovered during validation.
- Status: DLC 35 and the repository-wide suite cleanup are complete. All
  full unit, E2E, and accessibility suites pass; only expected skips remain.
- Repository/branch: `/home/joshlamont/Code/recipe-box`, `main`.
- Current step: report verified results; no test failures remain.
- Last verified result: 653 unit tests, 432 E2E tests, and 125 accessibility
  tests passed; there are 10 expected E2E skips and 1 expected accessibility
  skip. Production build, typecheck, `npm run lint` (with 171 advisory
  warnings), and `git diff --check` pass. Next.js stream-abort messages remain
  non-failing and unexplained.
- Next action: none unless new failures are reported.
- Checklist: [checklist.md](./checklist.md)
- Trace: [trace.md](./trace.md) — session
  `55a5aef2-c5f1-44fb-ad69-976e9f10efbd`; latest action: final full E2E,
  accessibility, and unit suites passed with expected skips.
