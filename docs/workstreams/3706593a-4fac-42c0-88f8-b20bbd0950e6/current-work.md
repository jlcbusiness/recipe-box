# Purpose: Research and draft a new small-adjustments slice brief

## Progress History

- 2026-11-16: Researched the slice template, product contracts, implementation
  paths, and tests. Found a documented mobile-scroll conflict and unresolved
  URL-fetch and Time Type Enter behavior. The local app was unavailable for
  rendered checks.
- 2026-11-16: The user chose a dated umbrella with focused work packages,
  approved bounded URL-title lookup with URL fallback, confirmed output-only
  Equipment casing and mobile wrapping, chose app-wide page titles, and
  specified Enter should add a row and focus Minutes.
- 2026-11-16: Drafted the umbrella brief and updated the related product
  contracts, visual guide, and decision log. The brief's local links and
  changed Markdown passed focused checks; repository-wide Markdown lint still
  reports pre-existing issues outside the new content.
- 2026-11-16: The user reviewed the brief and confirmed it looks accurate.
- 2026-11-16: The user authorized implementation of all three packages. Research
  confirmed private routes use the App Router and public recipes use the Pages
  Router, so both need title and Equipment-output coverage.
- 2026-11-16: Implemented all three packages. TypeScript, 34 focused unit tests,
  Biome, and the isolated Time Type Enter e2e test passed. Broader e2e runs
  stalled with both local app servers unresponsive; one reference assertion
  also failed, so title, Equipment, and mobile geometry remain unverified in a
  browser.
- 2026-11-16: Follow-up to the desktop editor screenshot: changed its table to
  size to content up to the editor width, preserving minimum room for Specifics
  and keeping Amount wider than Divide. The populated desktop screenshot and
  focused geometry/accessibility e2e test passed. A first run stayed in
  `Saving…` at a later assertion; a subsequent run passed. Biome passed with
  warnings in the existing CSS files.
- 2026-11-16: The responsive ingredient-entry e2e test passed at widths from
  901px through 390px, confirming the table change does not introduce page
  overflow at those widths.
- 2026-11-16: Opened the EatingWell reference in Playwright; it loaded with the
  document title “Stovetop Chicken & Broccoli Casserole.” Earlier server-side
  probes, including one with an identifying app User-Agent, returned HTTP 403.
  The request-path difference is confirmed, but the site's specific denial
  reason is not.
- 2026-11-16: The user approved an optional manual label for external URL
  references. Added it using the existing display-text field, documented the
  precedence and fallback behavior, and verified save, reader display, URL
  destination, and edit persistence in Chromium and Fold 6. The test now waits
  for the edit heading after client navigation; both projects pass.
- 2026-11-16: Refreshed reader wrapping coverage, fixed stale mobile assertions
  and confirmed the 320px no-overflow behavior. Focused Chromium checks passed
  for Time Type Enter (including the Recipe Tin title), public Equipment
  casing/catalog preservation, public recipe title and Size output, offline
  Size output, and Ingredient-first responsive geometry. Focused unit tests
  passed (106 tests); TypeScript passed. Initial browser attempts hit local
  server timeouts/port contention, but isolated retries passed. Markdown lint
  still reports the pre-existing long decision-log row and prior workstream
  formatting issues. Authenticated reader screenshots were inspected at 902px
  and 390px; temporary files were removed.
- 2026-11-18: Resumed to close the remaining acceptance-test and documentation
  gaps identified during the brief-compliance review. Existing mobile geometry
  coverage lacks explicit long-name and long-measurement assertions; Equipment
  output and automatic title lookup need stronger save/print/export evidence.
- 2026-11-18: Added long-name/measurement geometry coverage, private/public
  Equipment assertions for reader, print, and standalone output, and a
  deterministic automatic-title save-payload test. The tests exposed and fixed
  protected-reference metadata being cleared during new-recipe title resolution.
  Focused unit tests (15), browser tests (6 across Chromium and Fold 6),
  typecheck, and whitespace checks passed.
- 2026-11-18: Reopened the acceptance review after identifying missing explicit
  coverage for long Preparation/divided text, Settings Equipment casing,
  failure-path URL-title fallback, title-text regression paths, and Time Type
  keyboard edge cases. No implementation changes have been made for this batch.
- 2026-11-17: Added long Preparation, specifics, measurements, and divided-value
  wrapping assertions across mobile widths; verified Equipment's catalog casing
  in Settings; covered timeout, blocked, non-HTML, and missing-title save
  fallbacks; and strengthened title-text preservation cases for bundle import,
  export, public copies, and duplication. Added a direct Time Type blur assertion
  and updated the slice brief's coverage note. The focused unit tests passed 118
  cases, eight browser tests passed across Chromium and Fold 6, typecheck passed,
  Biome exited successfully with warnings, and `git diff --check` passed.
  Recipe history snapshots do not include reference rows, so there is no
  reference-title history field to preserve or add a regression assertion for.
- 2026-11-17: The user approved narrowing the breakpoint acceptance: no
  horizontal-scroll requirement applies through 760px, and the 761px check
  verifies the desktop presentation rather than Standard-view overflow. Updated
  the slice brief; the existing browser test already follows this boundary.
  Under that clarified scope, the recorded focused validation supports calling
  the slice complete. No tests were rerun for this documentation-only change.
- 2026-11-17: Bumped the app and lockfile from 1.14.1 to 1.14.2 and recorded
  the version in the slice brief. `npm pkg get version`, the lockfile root
  version fields, and the retained `parse5` dependency were verified;
  `git diff --check` passed. No tests were rerun for this metadata-only change.

## Save Point

- **Goal/status:** Complete under the clarified mobile-only no-horizontal-scroll acceptance; app version 1.14.2.
- **Repository/branch:** `jlcbusiness/recipe-box`, `main`.
- **Current step:** Complete; no pending implementation or verification.
- **Last verified result:** Seven focused unit test files passed 118 tests;
  eight browser tests passed across Chromium and Fold 6; `npm run typecheck`
  passed; Biome checked 10 files and exited successfully with 33 warnings; and
  `git diff --check` passed. The browser stress case verifies the Ingredient-first
  layout through 760px and confirms Standard view is shown at 761px. The brief
  now makes the no-scroll boundary explicit; tests were not rerun for this
  documentation-only clarification. Package and lockfile versions are 1.14.2.
  Checklist:
  [checklist.md](./checklist.md); trace: [trace.md](./trace.md). The latest
  trace entry records verification for session
  `3706593a-4fac-42c0-88f8-b20bbd0950e6`.
