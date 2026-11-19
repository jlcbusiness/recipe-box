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
- 2026-11-18: Completed the numeric-input inventory and prepared the combined
  C+F brief. The user confirmed that existing quantity ranges should remain
  readable and unchanged, while new or edited amounts must be scalar. The
  brief covers exact arithmetic before field normalization, all editable
  numeric inputs, standalone Things `a`, inline unit addition, and the required
  persistence/public-data lifecycle. No product code or migration changed.
  Focused Markdown checks for the brief and intake, local links/headings, and
  `git diff --check` passed. Full repository Markdown lint reported 32
  findings, including existing issues outside the new brief and intake.

- 2026-11-18: In response to review, split the C+F implementation scope into
  separate Numeric Arithmetic and Things briefs while retaining the shared
  overview. The user chose standard mobile text-keyboard entry without added
  operator controls, restricted `a` display to Things presentation, and
  requested explicit coverage that an unchanged legacy range survives an
  unrelated save. All four planning documents pass focused Markdown and local
  link checks; the decision log has only its known pre-existing lint finding.
  No product code or migration changed.
- 2026-11-18: The user approved both the Numeric Arithmetic and Things briefs.
  Implementation starts with arithmetic because Things input dispatch reuses
  its parser; the app's existing text-based ingredient amount input is the
  closest UI pattern. No product implementation has started yet.
- 2026-11-18: Completed Numeric Arithmetic implementation and focused
  verification. Corrected the trusted-density browser assertion to match its
  live status role; the density and Library Explorer tests now pass in
  Chromium, and relevant Serves/Makes, scaling, density, and Recipe Count
  browser checks pass on Fold 6. Typecheck and 133 focused unit tests pass.
  Updated the arithmetic brief and canonical contracts. The Things slice
  remains approved but deferred.
- 2026-11-18: Started the separately approved Things Wording and Addable Units
  slice after arithmetic verification. Confirmed the shared MeasurementEditor
  is the desktop/mobile UI reference and reviewed its picklist and the
  revision-aware add/reuse action. The local app is not currently running, so
  rendered baseline inspection remains outstanding.
- 2026-11-18: Completed Things Wording and Addable Units. Explicit `a` is
  persisted only for Things, inline units are added to the account picklist
  while recipe assignment remains draft-only, and readers use natural “of”
  wording. The local migration and 138 focused unit tests passed; focused
  database and Chromium save/reload tests passed. Desktop editor and mobile
  reader screenshots were inspected.
- 2026-11-18: The first responsive browser rerun exposed an outdated
  “2 bunches cilantro” assertion; updating it to “2 bunches of cilantro”
  matched the approved wording and both Chromium flows then passed. Typecheck
  and whitespace checks passed. Biome exited successfully with one unused
  parameter warning in the existing measurement test; repository Markdown
  lint still reports 32 findings outside the Things brief and product
  contracts. A non-fatal Next.js destination-stream error appeared during a
  passing E2E run; its cause remains unverified.
- 2026-11-18: Updated Things amount wording by presentation: Standard retains
  `a <thing> of <ingredient>`, while Ingredients-First shows only `a <thing>`
  because the ingredient has its own column. Trailing “of” is also omitted
  from saved Things labels in Ingredients-First. Focused unit and Chromium
  tests pass; desktop and mobile screenshots confirm the output. The browser
  test now normalizes its persisted presentation preference before asserting
  Standard output.
- 2026-11-18: The user selected package A, the full-width Updates tab. Its
  contract requires the tracker and list to span the Settings content track
  without changing row behavior. The previous desktop measurement used a
  mismatched CSS viewport, so the baseline will be remeasured at normalized
  desktop and mobile widths before choosing a layout fix.
- 2026-11-18: Completed package A. At a normalized 1280px Chromium viewport,
  the Settings content track measured 1118px while the active tab panel and
  Updates list stopped at 407px. Giving `.settings-tab-panel` an explicit
  100% width makes the panel and its tracker fill the track. Browser
  assertions verify the panel, tracker, and list within 1 CSS px at desktop
  and responsive widths, with no page overflow. The admin Updates flow passes
  in Chromium and Fold 6. The shared Settings tab test also passes in both
  after waiting for its streamed heading and tablist before running axe.
  Inspected desktop and mobile screenshots. Typecheck and `git diff --check`
  pass; Biome reports five existing CSS specificity warnings.

## Save Point

- **Goal/status:** Packages B, D+H, E, Numeric Arithmetic (#4), Things Wording
  and Addable Units (#7/#10), and package A are implemented and verified.
  Package G (#8) remains unstarted.
- **Repository/branch:** `/home/joshlamont/Code/recipe-box`, `main`.
- **Current step:** Package A is complete; wait for direction on the next
  package.
- **Last verified:** The admin Updates flow and the Settings tabs/keyboard
  accessibility flow passed in Chromium and Fold 6. Width assertions cover
  the Settings track at 1280px and responsive widths of 641px, 640px, 473px,
  and 390px. `npm run typecheck` and `git diff --check` passed; targeted
  Biome exited 0 with five existing specificity warnings.
- **Next action:** Wait for the user to select whether to begin package G
  (#8), alternate-ingredient notes.
- **Checklist:** [checklist.md](./checklist.md)
- **Trace:** [trace.md](./trace.md); session
  `83fb1fca-a8d9-4060-aaf4-b5460d739b9a`; latest section records package A
  implementation and verification.
- **Trace boundary:** The latest section records package A; earlier
  implementation history remains partial.
