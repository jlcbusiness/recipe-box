# Purpose: Aligning app documentation and tests with current behavior

## Repository-wide documentation and test audit — 2026-11-14

- [x] Inventory product contracts and documentation against the current app.
- [x] Inventory test runners, suites, documented commands, and workflow coverage.
- [x] Run full and focused suites; isolate affected tests and record remaining
      failures without assuming their baseline status.
- [x] Update stale or conflicting documentation, add justified focused tests,
      and correct actionable test fixtures/assertions.
- [x] Run focused and full validation; record remaining failures and limits.

- [x] Update the accepted product, visual, decision, and DLC index contracts.
- [x] Add focused tests for editor, reader, and dual-measure display.
- [x] Move Divide controls out of Preparation in desktop and mobile editing.
- [x] Render the conditional desktop Divide column and compact mobile layout.
- [x] Run focused tests, typecheck, lint, and responsive browser checks.
- [x] Record verified behavior, completion status, and app version in the docs.

## Clarified follow-up — 2026-11-14

- [x] Replace the Divide toggle with an always-visible amount input; blank
      means no division, and clearing removes the staged ratio.
- [x] Expand the desktop recipe form to a 1200px maximum.
- [x] Update the DLC 38 brief and visual design guidance.
- [x] Verify focused unit, browser, typecheck, build, and documentation checks.

## Reader layout refinements — 2026-11-13

- [x] Show the desktop Ingredient-first “divided” header and use “divided” in
      Standard view; use “divide” in mobile Ingredient-first.
- [x] Keep ingredient-set dividers table-width and apply the requested mobile
      Preparation sizing, zero right padding, and Volume/Weight spacing.
- [x] Update the DLC 38 brief, visual-design contract, and focused E2E assertions.
- [x] Verify responsive behavior, accessibility, geometry, screenshots, unit
      tests, typecheck, build, and changed-document lint.

## Reader content and spacing follow-up — 2026-11-13

- [x] Correct the title-cased Chickpea Flour name in the synthetic sample data.
- [x] Put “divided” above each desktop portion pair; add the mobile preparation
      comma and at least 4px between internal columns without outer-edge padding.
- [x] Update the slice brief, visual-design contract, and focused regression tests.
- [x] Verify desktop/mobile behavior, screenshots, tests, and changed-document lint.

## Mobile Standard wrapping — 2026-11-13

- [x] Reduce mobile Standard ingredient line-height and right-align row text.
- [x] Update the visual-design contract and DLC 38 slice brief.
- [x] Verify wrapped content at 300px and run focused reader tests on Chromium
      and Fold 6, plus typecheck and targeted formatting/document lint.

## Reader layout and casing follow-up — 2026-11-13

- [x] Right-align only the mobile Standard continuation, keep its primary line
      left-aligned, and remove the continuation's leading comma.
- [x] Keep the desktop Divide header semantic but visually hidden, and increase
      internal mobile Ingredient-first spacing to 6px without outer padding.
- [x] Update the product contracts and verify responsive screenshots, E2E,
      unit tests, typecheck, lint, and formatting.
- [x] Lowercase all multiword names in recipe views only; preserve canonical
      catalog names and editor formatting.
- [x] Verify Standard and Ingredient-first output on Chromium and Fold 6, plus
      focused unit tests, typecheck, Biome, and product-document lint.

## Mobile reader spacing and alignment — 2026-11-14

- [x] Keep mobile Standard Preparation and Divide together when they fit, with
      tight, right-aligned continuation when they wrap.
- [x] Keep Ingredient-first mobile text unwrapped with at least 8px between
      columns, flush outer edges, and no page-level horizontal overflow.
- [x] Preserve lowercase multiword names in Ingredient-first reader output.
- [x] Verify responsive behavior on Chromium and Fold 6, plus typecheck,
      formatting, product-document lint, and patch whitespace.

## Standard mobile wrapping — 2026-11-14

- [x] Keep a complete Standard entry inline when it fits; otherwise break at
      the Preparation/Size and Divide boundary that fits the available width.
- [x] Keep Divide and its formatted portion pair unbroken, with compact,
      right-aligned continuation text.
- [x] Update the visual-design contract, DLC 38 brief, and responsive E2E
      assertions.
- [x] Verify Chromium and Fold 6 behavior, inspect authenticated mobile
      screenshots, and run typecheck, formatting, docs lint, and patch checks.

## Wrapped continuation vertical spacing — 2026-11-14

- [x] Position a wrapped continuation about one-quarter text-size below the
      preceding line, and keep the following ingredient at the same rhythm.
- [x] Update the visual-design contract, DLC 38 brief, and responsive E2E
      geometry assertions.
- [x] Verify Chromium and Fold 6, typecheck, focused lint, patch whitespace,
      and the rendered mobile ingredient list.

## Ingredient-first name styling — 2026-11-14

- [x] Render Ingredient-first ingredient names in small caps on desktop and
      mobile without changing their lowercase text content.
- [x] Update the visual-design contract, DLC 38 brief, and responsive E2E
      computed-style assertions.
- [x] Verify Chromium and Fold 6, typecheck, focused lint, document lint, and
      authenticated desktop/mobile screenshots.

## Reader toolbar alignment — 2026-11-14

- [x] Keep reader controls at a stable right edge independent of status text,
      with the mobile toolbar remaining below the summary.
- [x] Update the visual-design contract and add responsive geometry coverage
      across the reader's sort/status summaries.
- [x] Verify Chromium and Fold 6 behavior, typecheck, lint, and patch hygiene;
      inspect and remove generated screenshots.

## Failure remediation follow-up — 2026-11-15

- [x] Fix the repository-wide Markdown lint findings and verify all files.
- [x] Fix focused ingredient-editor/accessibility assertions and density-input
      geometry; rerun the affected tests.
- [ ] Resolve full-suite E2E failures without weakening acceptance criteria;
      the four failures from the serial run passed individually, but their
      full-suite cause remains unknown.
- [ ] Resolve the default two-worker accessibility timeouts; the serial suite
      passed (127 tests, 1 skipped), but the parallel-run cause remains unknown.
- [x] Run the unit, full E2E, and accessibility suites and record the results,
      non-reproducible failures, and verification limits.
