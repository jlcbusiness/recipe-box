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

## Save Point

- Goal: deliver Count and Things measure equivalents with trusted-density precedence.
- Status: implemented; app version 1.9.0 selected.
- Repository/branch: `/home/joshlamont/Code/recipe-box`, `main`.
- Current step: reader picklist copy and saved-unit restoration follow-up is
  complete; package metadata and DLC 35 docs now use app version 1.9.0.
- Last verified result: the focused reader unit tests (55), equivalent E2E on
  Chromium and Fold 6 (2), typecheck, targeted Biome, and `git diff --check`
  passed. Version metadata and the lockfile now match at 1.9.0; the scoped
  whitespace check passed. Markdown lint reports 30 unrelated repository
  errors, and the full whitespace check flags the pre-existing update prompt.
- Next action: no further versioning action; the earlier non-failing print-test
  stream-write log remains uninvestigated unless it recurs.
- Checklist: [checklist.md](./checklist.md)
- Trace: [trace.md](./trace.md) — session
  `46ab8600-3135-4196-bb9f-f8af616ee1a0`; last action: selected and updated
  app version 1.9.0.
