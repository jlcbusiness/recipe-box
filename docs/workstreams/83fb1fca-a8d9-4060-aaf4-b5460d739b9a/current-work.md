# Purpose: Turn November Updates fixes into a review-ready slice proposal

## Progress History

- 2026-11-18: Resumed the summarized slice-preparation work. The intake still
  contains ten unchecked Fix entries. Verified that recipe detail pages omit
  zero-minute entries, but the publication recipe explorer still renders
  `0 min` for a zero total. Readers already omit labels for a single ingredient
  set while the editor still exposes its rename control.
- 2026-11-18: Found the existing checklist, save point, and trace files were
  empty; initializing them from the available handoff and current evidence.
  No product code has been changed.
- 2026-11-18: Reworked the intake into an eight-package split proposal, grouped
  the two reader items and two Things items, and recorded current evidence,
  acceptance criteria, and decisions needed before implementation. The
  recommended first slice is Ingredient-first reader parity (#2/#3).
- 2026-11-18: The proposal's local file links resolve and the repository
  Markdown check reports no errors in this task's files. The full check still
  fails on 24 findings in pre-existing files outside this task.
- 2026-11-18: The user selected package B, Ingredient-first reader parity.
  Prepared a standalone brief that preserves existing private/shared reader
  behavior and flags desktop checkbox spacing as a proposed decision for
  review. The local app was unavailable for rendered inspection.
- 2026-11-18: The brief's local Markdown links resolve. Repository Markdown lint
  still reports 24 findings in other files; it reports none in the updated
  intake, brief, or continuity files.
- 2026-11-18: The user supplied three visual references: the first text size
  is preferred, the second is too large, and Cook-mode spacing is 3px left and
  6px right. Updated package B; this replaces the provisional 21px/1mm target.
- 2026-11-18: Rechecked the revised Markdown and local links. No findings were
  reported in the updated files; 24 repository lint findings remain in
  unrelated files.
- 2026-11-18: The user approved implementation of package B using the first
  reference's text size and 3px-left/6px-right checkbox spacing. Production
  work can now begin; preserve the 48px-tall target.
- 2026-11-18: Added test-first private/shared browser coverage. The initial
  run confirmed the existing 21px mobile rail did not meet the accepted
  geometry. CSS now gives both readers 18px desktop ingredient names and
  3px/6px checkbox spacing while preserving the 48px target and checkbox size.
- 2026-11-18: Focused reader tests passed in Chromium and Fold 6 at desktop,
  390px, and 320px widths. The tests verify matching private/shared typography,
  no mobile page overflow, and check-off after a rejected Wake Lock request.
  Desktop and mobile screenshots were captured and inspected.
- 2026-11-18: Updated the comprehensive ingredient reference, visual guide,
  decision log, Slice 16 brief, intake, and package B brief to match the
  verified behavior. TypeScript, targeted Biome, whitespace, and targeted
  Markdown checks passed; the decision log still has an MD013 finding at line
  183 outside the new entry.
- 2026-11-18: Strengthened mobile parity coverage to verify table alignment and
  long-name wrapping. The first run timed out because the exact locator used
  title case while the reader renders multiword names lowercase; the locator
  now matches the rendered text. The focused tests passed in Chromium and Fold
  6; typecheck, Biome, and whitespace checks passed. Repository Markdown lint
  still reports 24 existing findings, including the decision-log line outside
  the new entry; none are in this workstream's records.
- 2026-11-18: The user clarified that Cook-mode's 48px target is for mobile,
  not desktop. Ingredient-first checkboxes now use compact desktop height and
  retain 48px height on mobile. Private/shared tests passed at 1280px, 390px,
  and 320px, including unchanged desktop row height; related contracts were
  updated. Typecheck, Biome, and whitespace checks passed. Repository Markdown
  lint still reports 24 existing findings.
- 2026-11-18: The user reported that shared Ingredient-first table text was
  not vertically centered. The new parity assertion reproduced the mismatch;
  applying middle alignment to the shared table-cell rule fixed it. Focused
  Chromium and Fold 6 tests passed, as did typecheck, Biome, and whitespace
  checks. Biome reported seven existing specificity warnings; Markdown lint
  still reports 24 findings, including the existing decision-log line 183
  finding.
- 2026-11-18: The user reported different shared-table spacing and a missing
  top rule on tinted rows. Cell padding, text line-height, and stripe borders
  now match in both routes; editor table styles are scoped to the form to
  prevent them overriding the private reader. Focused Chromium and Fold 6
  checks pass. At 390px, diagnostics still measure a one-line tinted row at
  33px privately and 57px publicly because the shared unit button retains a
  48px mobile hit area while private CSS compacts it. Awaiting the user's
  choice on whether to preserve that target or compact the shared control.
- 2026-11-18: Applied the established mobile-only sizing decision consistently:
  private and shared unit controls retain a 48px mobile target and stay compact
  on desktop. The focused Chromium and Fold 6 parity test now verifies matching
  first-row heights and visible unit-control sizes and passes. Typecheck and
  whitespace checks pass; targeted Biome exits 0 with 18 warnings. Markdown
  lint still reports 24 existing findings outside this workstream's records.
- 2026-11-18: The user questioned whether Cook-mode checkboxes reserve 48px in
  shared recipes. Extended the parity test to measure the containing ingredient
  row after Cook mode is enabled, not just the checkbox wrapper. At 390px and
  320px, both private and shared rows are at least 48px and match; Chromium and
  Fold 6 pass. The test passes targeted Biome and whitespace checks. No
  production CSS change was needed.
- 2026-11-18: The user selected editor spacing/title behavior (#5/#9) and
  publication zero-time display (#6) for the next brief set. Created a combined
  D+H brief and separate E brief, with implementation blocked on the explicit
  display decisions. The updated intake links both briefs. Targeted Markdown
  lint and local-link/heading checks pass; full repository Markdown lint still
  reports 25 findings, including the user-edited slice prompt and unrelated
  files.
- 2026-11-18: The user confirmed the 1mm Type-to-Amount minimum and chose to
  omit zero-time text in both publication Details and Grid. They lacked context
  for the remaining single-set-title choice, so the options will be explained
  before requesting that decision. Implementation approval is still pending.
- 2026-11-18: After the behavior was explained, the user chose to hide the
  section-title heading when one set remains, while preserving the stored
  label. All requested display decisions are now settled; implementation
  approval remains pending.
- 2026-11-18: The user approved both D+H and E for implementation. Updating the
  briefs and checklist to reflect approval; next add focused tests before
  making the three UI changes.
- 2026-11-18: Implemented the 1mm measurement gap, single-set heading behavior,
  and zero-time omission in publication Details and Grid. Focused Chromium
  checks previously passed for the new assertions; measurement and ingredient
  set checks also passed in Fold 6. A later publication rerun failed at the
  mobile cell bounding-box assertion before reaching zero-time checks, while
  another rerun reached the Grid assertion and stalled on subsequent Library
  navigation. The outcome is intermittent; Fold 6 publication verification
  remains incomplete. TypeScript passes; targeted Biome exits successfully
  with 17 warnings. The latest `git diff --check` passes.
- 2026-11-18: Replaced the publication test's one-shot mobile cell
  `boundingBox()` reads with polling that waits for both cells and their
  expected geometry. The standalone flow passed three Chromium repeats and
  once on Fold 6; targeted Biome, typecheck, and `git diff --check` pass.
  Chromium emitted non-fatal React streaming warnings on some repeats, but
  those runs completed successfully.

## Save Point

- **Goal/status:** Package B, D+H, and E implementation and focused validation
  are complete.
- **Repository/branch:** `/home/joshlamont/Code/recipe-box`, `main`.
- **Current step:** Focused validation is complete.
- **Last verified:** The publication flow passed three Chromium repeats and
  once on Fold 6 after the mobile geometry assertion was made retryable.
  Targeted Biome, `npm run typecheck`, and `git diff --check` passed. Chromium
  emitted non-fatal React streaming warnings on some repeats.
- **Next action:** None for this slice; broader end-to-end testing is optional.
- **Checklist:** [checklist.md](./checklist.md)
- **Trace:** [trace.md](./trace.md); session
  `83fb1fca-a8d9-4060-aaf4-b5460d739b9a`; last action: standalone publication
  Playwright repeats and Fold 6 run, targeted Biome, TypeScript, and final
  whitespace check.
- **Trace boundary:** This checkpoint records the recent implementation and
  verification actions; earlier preparation history remains partial.
