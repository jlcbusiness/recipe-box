# Purpose: Deliver Count and Things measure equivalents

- [x] Review the product contracts and closest reader, Settings, and conversion patterns.
- [x] Draft the candidate slice brief and roadmap entry with trusted-density precedence.
- [x] Run focused documentation checks. The new brief and workstream have no Markdown lint errors;
  `git diff --check` passes.
- [x] Resolve how existing two-dimensional equivalents behave when a trusted density exists.
- [x] Obtain approval of the revised brief and nutrition-consistency scope.
- [x] Update the canonical product, data, visual, and decision contracts.
- [x] Write focused conversion, Settings, reader, and nutrition tests.
- [x] Implement transient Count/Things conversion and density-backed equivalents.
- [x] Verify desktop/mobile behavior, accessibility, privacy, and regression tests.
- [x] Reconcile the roadmap with verified behavior and set the app version to
  1.9.0 after the user selected it.

## Reader interaction follow-up

- [x] Revise the reader contract for dual-dimension and single-dimension
  Count/Things equivalents.
- [x] Add per-measurement transient choices and unit-list return options.
- [x] Verify desktop/mobile reader, print, accessibility, and regression behavior.
- [x] Reconcile the workstream checkpoint with verified results.
- [x] Keep Count/Things option labels concise and remove the separate Recipe
  default option; selecting the saved unit restores that dimension.
- [x] Update the slice and product contracts and verify the related unit and
  desktop/mobile E2E tests.

## Acceptance coverage follow-up

- [x] Add E2E coverage for editing a legacy paired equivalent when trusted
  density exists, including requiring a source choice and saving only it.
- [x] Add Guest/public E2E coverage proving private equivalent amounts do not
  appear in the rendered public recipe or its interactive controls.
- [x] Run both focused E2E tests on Chromium and Fold 6, then run typecheck.
- [x] Run the full unit and E2E phases: 653 unit tests passed; the E2E run
  reported 380 passed, 52 failed, and 10 skipped.
- [x] Run the accessibility suite separately after `npm test` stopped at E2E
  failures: 100 passed, 25 failed, and 1 skipped.
- [x] Correct DLC 35-related nutrition E2E setup uncovered during the run:
  open the Recipe data Settings tab and set a public username before publishing.
- [x] Rerun the focused nutrition/settings/database-bundle E2Es on Chromium and
  Fold 6: 5 passed and 1 desktop-only test was skipped on Fold 6.
- [x] Run the production build, typecheck, and scoped Biome check; all passed.
