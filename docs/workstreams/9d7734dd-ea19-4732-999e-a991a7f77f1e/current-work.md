# Purpose: Implement and verify DLC 46 nested library breadcrumbs

## Progress History

- 2026-11-20: Resumed DLC 46 in session
  `9d7734dd-ea19-4732-999e-a991a7f77f1e`. The user-approved rule is to show a
  breadcrumb only when the parent page is not directly reachable from
  navigation; public pages are excluded and Settings tabs are not route levels.
  The shared component and nested-route paths are implemented. Updated the
  legacy Recipe Tin attribution expectation to use the breadcrumb instead.
- 2026-11-20: The focused Chromium breadcrumb E2E passed while capturing
  desktop and mobile screenshots. Visual review confirmed the route hierarchy,
  wrapping, and touch target; mobile had no horizontal overflow. Removed the
  temporary screenshot instrumentation and files, and removed the trailing
  separator before the source link after observing it in the mobile screenshot.
- 2026-11-20: Dedicated private breadcrumb and public no-breadcrumb acceptance
  tests passed on Chromium and Fold 6 (6/6). History breadcrumb assertions and
  Axe checks also passed before broader history tests failed on their existing
  expected-404 checks (actual response 200); a separate Library Axe test fails
  its existing level-one-heading check in Chromium. These unrelated outcomes
  are recorded without changing the route privacy contract or Library markup.
- 2026-11-20: Updated the visual guide, first-draft and comprehensive references,
  historical Recipe Tin note, slice brief, and roadmaps. Bumped package and lock
  versions to 1.18.0. Typecheck, focused Biome, and `git diff --check` pass.
  Repository Markdown lint reports 37 errors in other files; none are in the
  changed documentation. Removed the one orphan local test account by its
  unique recipe marker and verified the marker is gone.
- 2026-11-20: In response to the user's visual feedback, changed breadcrumb
  separators to `>`, removed the Add Recipe eyebrow, and aligned its breadcrumb
  with the title in the former eyebrow position. Desktop and Fold 6 screenshots
  were reviewed. The focused Add Recipe geometry/separator test passes on both
  projects; typecheck, focused Biome, Markdown lint for related files, and
  `git diff --check` pass.
- 2026-11-20: Applied the later title/path refinements across private routes:
  omitted duplicate title crumbs, reduced title spacing, aligned the recipe
  action toolbar with its breadcrumb, and kept the section divider close to the
  heading. Updated current references and added geometry assertions for spacing,
  toolbar alignment, and divider placement.
- 2026-11-20: The detail and Add Recipe tests pass on Chromium and Fold 6. The
  latest combined nested-route run has a known Axe failure on the final Account
  App Data route's missing H1; all breadcrumb assertions pass before that check.
  Typecheck and whitespace checks pass. Targeted Biome reports one existing
  descending-specificity warning in the unrelated recipe thumbnail selectors.
  Repository Markdown lint still reports 37 unrelated errors.
- 2026-11-20: Rechecked the reported H1 failure. The Account App Data page
  already renders its H1; the nested-route test scanned Axe before waiting for
  that page to finish loading. Added an explicit H1 wait, and the test passes on
  Chromium and Fold 6. The publication-history Axe check also waits for streamed
  metadata before scanning.
- 2026-11-20: Reproduced the history tests' expected-404/actual-200 failures.
  The installed Next.js 16.4.6 docs explain that these loading boundaries stream
  before page-level `notFound()` checks, preserving HTTP 200. Updated the tests
  to assert `noindex`, no breadcrumb, and no private heading instead; all six
  focused history and nested-route checks pass on Chromium and Fold 6.
- 2026-11-20: Ran the complete history E2E file after the focused checks; all
  10 tests pass across Chromium and Fold 6. Updated the DLC brief and index to
  document the streaming not-found verification and current test status.

## Save Point

- Goal: implement and verify DLC 46 nested library breadcrumbs.
- Status: implemented and acceptance-verified, including title de-duplication,
  spacing, and recipe-detail toolbar/divider refinements. The previously
  reported history-status and Account App Data Axe failures are addressed in
  the focused E2E checks.
- Repository/branch: `/home/joshlamont/Code/recipe-box`, `main`.
- Current step: report completed fixes and validation.
- Last verified result: all 10 history tests and six focused history/nested-route
  checks pass on Chromium and Fold 6; typecheck, targeted Biome, and
  `git diff --check` pass. The edited DLC/workstream docs are absent from the
  37-error repository Markdown lint output.
- Next action: none. Remaining Markdown lint errors are outside the edited docs.
- Checklist: [checklist.md](./checklist.md)
- Trace: [trace.md](./trace.md) — session
  `9d7734dd-ea19-4732-999e-a991a7f77f1e`; latest action: history/not-found
  test corrections verified on both browser projects.
