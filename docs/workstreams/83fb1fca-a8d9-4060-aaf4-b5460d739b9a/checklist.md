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
