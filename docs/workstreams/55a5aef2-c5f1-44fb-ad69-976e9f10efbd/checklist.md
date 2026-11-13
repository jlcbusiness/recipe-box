# Purpose: Implement the approved recipe duplication slice

- [x] Approve the DLC 36 behavior, naming, attribution, and action placement.
- [x] Render and verify the existing recipe toolbar at desktop and mobile
  widths with a temporary local synthetic account.
- [x] Add tests for direct-save markers, import compatibility, and
  duplicate graph/attribution behavior.
- [x] Implement marker migration/backfill, direct-save uniqueness, and
  duplicate-safe protected attribution.
- [x] Implement the authenticated copy endpoint and atomic media/database
  workflow with fresh recipe and child IDs.
- [x] Add the copy dialog with editable name and active destination selection;
  preserve the approved desktop and mobile toolbar placement.
- [x] Update related product/data/visual documentation and version metadata.
- [x] Verify marker backfill with unambiguous and ambiguous legacy data, and
  verify photo-copy success and cleanup behavior in focused tests.
- [x] Run focused unit, migration, type, lint, build, and authenticated UI
  tests; inspect desktop and mobile behavior with local synthetic data.
- [x] Verify `git diff --check` and preserve unrelated worktree changes.
- [x] Refine duplicate dialog field labels/areas and desktop/mobile toolbar
  order and treatments per the user follow-up.
- [x] Verify the revised dialog and toolbar with rendered screenshots,
  responsive geometry, color, accessibility, and type checks.
- [x] Preserve the mobile privacy toggle's state label and intended width in
  both Private and Linkable states, without causing narrow-screen overflow.
- [x] Keep the toggle at the same width when switching between Private and
  Linkable at the same viewport.
