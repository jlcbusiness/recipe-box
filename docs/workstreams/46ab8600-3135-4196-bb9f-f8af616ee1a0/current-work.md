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

## Save Point

- Goal: deliver Count and Things measure equivalents with trusted-density precedence.
- Status: implemented; app version 1.9.0 selected, and the legacy-pair,
  Guest/public, and nutrition database-bundle acceptance paths are verified
  on Chromium and Fold 6. The repository-wide E2E and accessibility runs still
  report untriaged failures.
- Repository/branch: `/home/joshlamont/Code/recipe-box`, `main`.
- Current step: requested validation is complete; no DLC 35-specific check is
  pending.
- Last verified result: full unit phase 653/653 passed; the E2E phase reported
  380 passed, 52 failed, and 10 skipped; separate accessibility run reported
  100 passed, 25 failed, and 1 skipped. The production build, typecheck,
  scoped Biome, and focused DLC 35 nutrition/equivalent E2Es passed. Remaining
  broad-suite failures are not yet triaged.
- Next action: none for DLC 35 validation; the untriaged repository-wide
  failures are a separate follow-up.
- Checklist: [checklist.md](./checklist.md)
- Trace: [trace.md](./trace.md) — session
  `55a5aef2-c5f1-44fb-ad69-976e9f10efbd`; latest action: focused nutrition,
  database-bundle, and public-nutrition E2Es passed on Chromium and Fold 6;
  typecheck, scoped Biome, and production build passed. Broad-suite failures
  remain untriaged.
