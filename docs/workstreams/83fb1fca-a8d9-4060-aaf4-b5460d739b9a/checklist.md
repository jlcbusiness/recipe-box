# Purpose: Turn November Updates fixes into a review-ready slice proposal

- [x] Confirm the slice workflow, intake, repository guidance, and applicable product contracts.
- [x] Finish mapping all ten candidates to current behavior and test coverage; separate completed work from open fixes.
- [x] Recommend a coherent split and document observable acceptance criteria and unresolved decisions.
- [x] Validate the proposal's Markdown structure and links.
- [x] Pause for user review and collect package selection; package B was selected.
- [x] Prepare the standalone brief for package B and validate its local links
  and Markdown.
- [x] Incorporate the user-provided text-size references and exact checkbox
  spacing into the brief.
- [x] Obtain user approval to implement package B with the supplied visuals.
- [x] Update reader CSS for the accepted typography and checkbox geometry.
- [x] Add/adjust focused private and shared E2E assertions before production
  CSS changes.
- [x] Verify desktop/mobile behavior, mobile table alignment/wrapping,
  wake-lock preservation, and screenshots.
- [x] Reconcile verified behavior with the visual guide and decision log.
- [x] Keep the 48px Cook-mode target mobile-only and preserve desktop row
  height; verify the mobile ingredient row itself reserves that space.
- [x] Update the slice, visual, and comprehensive contracts for the clarified
  target behavior.
- [x] Vertically center Ingredient-first table cells in private and shared
  readers and verify parity.
- [x] Match private/shared Ingredient-first cell padding, text line-height, and
  tinted-row boundaries.
- [x] Apply the mobile-only 48px unit-control target consistently in private
  and shared readers while keeping desktop controls compact; verify responsive
  row-height and hit-area parity.
- [x] Draft selected packages D+H and E as separate review briefs and update
  the intake with their grouping and scope.
- [x] Verify local links and Markdown lint in the two briefs and updated intake.
- [x] Confirm the 1mm measurement gap target and omission of zero-time text in
  publication Details and Grid.
- [x] Resolve the single-set title presentation: hide the heading while
  preserving the stored label when one set remains.
- [x] Obtain approval for packages D+H and E before implementation.
- [x] Add focused E2E assertions for the measurement gap, single-set heading,
  and publication zero-time display.
- [x] Implement the approved recipe-editor spacing and single-set heading
  behavior.
- [x] Implement the approved publication zero-time display behavior.
- [x] Run focused browser checks and inspect representative desktop/mobile
  layouts; Chromium and Fold 6 checks verified the editor behavior, and
  Chromium verified publication zero-time behavior. Fold 6 publication
  verification remains incomplete.
- [x] Update the visual/product contracts to match verified behavior.
- [x] Reconcile the publication test's intermittent mobile geometry assertion
  and complete zero-time verification on Fold 6.
- [x] Inventory editable numeric entry surfaces and separate them from
  identifiers, selections, and computed outputs.
- [x] Split C+F into separate arithmetic and Things implementation briefs
  under the shared input-consistency overview.
- [x] Specify standard mobile text-keyboard entry without added operator
  controls, Things-only display of `a`, and legacy-range preservation tests.
- [x] Validate the revised briefs and intake links, heading anchors, Markdown,
  and whitespace; confirm the decision log has only its known prior lint issue.
- [x] Obtain user review and explicit implementation approval for both briefs.
- [x] Implement the shared exact arithmetic parser and apply it to every
  approved numeric input surface, including updated time-expression behavior.
- [x] Preserve legacy quantity ranges through unrelated recipe saves and reject
  new ranges or edited range values that are not replaced with scalars.
- [x] Implement Things wording, explicit `a` persistence/presentation, and
  inline unit addition through the revision-checked picklist workflow.
- [x] Update the Numeric Arithmetic brief and canonical product/data-model
  contracts, with focused arithmetic tests.
- [x] Update canonical product/data-model contracts and focused tests for the
  Things slice.
- [x] Verify numeric entry, legacy-range preservation, and relevant mobile
  behavior with focused unit and browser checks.
- [x] Verify Things output, persistence, and mobile behavior with focused unit,
  database, and browser checks.
- [x] Keep Things wording presentation-specific: Standard includes “of”;
  Ingredients-First omits it, including for saved unit labels ending in “of”;
  verify desktop and mobile output.
- [x] Measure the Updates content track and tracker at normalized desktop and
  mobile viewports; identify the active tab panel as the constraining box.
- [x] Make the Updates tracker/list fill the Settings content track, and verify
  width, overflow, and existing controls with desktop/mobile browser tests.
- [x] Resolve package G's note semantics and exact Standard/Ingredient-first
  formatting with the user.
- [x] Trace the new ingredient field through editing, save/history, public
  projection, print/offline output, and import/export.
- [x] Add the distinct optional ingredient field and propagate it through every
  supported recipe-data lifecycle.
- [x] Add focused unit, migration, lifecycle, and browser coverage, including
  desktop/mobile editing and both reader presentations.
- [x] Update the package G brief and canonical product/data-model contracts.
- [x] Verify the migration, relevant lifecycle tests, browser behavior,
  typecheck, lint, and worktree.
- [x] Reproduce and correct the reported table expansion when activating a
  long Alternative / note value; verify stable geometry at 1024px and 1210px.
- [x] Move Alternative / note to the final editor field and after Divide in
  Standard view; verify editor and reader ordering.
- [x] Correct the narrow mobile Ingredient-first layout, including section
  divider spans and collapsed desktop-only tracks; verify normal and Cook
  modes plus desktop layout.
- [x] Update the reader contracts and regression tests, then run focused unit,
  browser, typecheck, lint, and whitespace checks.
- [x] Prevent collapsed mobile reader tracks from inflating ingredient rows
  and stack the Divide label above its portions.
- [x] Keep the complete desktop Divide editor group left-aligned within its
  cell with compact internal spacing.
- [x] Update the relevant reader/editor contracts and verify the desktop
  Divide layout and mobile row geometry with focused Playwright tests.
- [x] Balance the desktop gaps around Preparation at 1210px and 1410px while
  preserving left-aligned Divide controls and their containment.
- [x] Keep Preparation usable at constrained desktop widths by stacking Size
  controls below it from 761px through 1199px, while retaining the inline
  layout on wider screens.
- [x] Align the Type picker with Amount and verify Preparation/Size spacing
  and mobile editor field order with focused regression tests.
- [x] Update the visual-design, comprehensive ingredient, and DLC 38 contracts
  and pass the focused browser, typecheck, lint, and whitespace checks.
