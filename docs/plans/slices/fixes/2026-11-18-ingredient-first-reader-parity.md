# Ingredient-first reader parity in Cook mode

**Status: Implemented and verified.**

## Outcome

Private and shared recipes use the same Ingredient-first typography on desktop.
Use the text size shown in the first user-provided visual reference in both
contexts; the larger size in the second reference is not acceptable. In Cook
mode, the checkbox sits 3px from the left border and 6px from the ingredient
text. Its target stays 48px tall on mobile, while the desktop checkbox remains
compact and does not expand short ingredient rows. Ingredient-first cells are
vertically centered in both private and shared tables, with matching cell
padding and text line-height plus visible rules around tinted stripe rows.
Mobile unit controls retain 48px hit areas; desktop controls remain compact.
Short mobile Cook-mode rows stay close to those 48px targets by omitting
vertical padding from checkbox and unit-control cells; wrapped content may
grow a row.

## Source requirements and authority

- Updates fixes #2 and #3 in the [November intake](2026-11-18-updates-page-fix-intake.md).
- The [comprehensive reference](../../comprehensive-reference/02-ingredients-and-presentation.md)
  is authoritative for Ingredient-first content and responsive behavior.
- The [visual design guide](../../visual-design.md#ingredient-presentation)
  records the accepted 18px desktop text size and 3px/6px checkbox spacing,
  replacing the earlier 50% size increase and 21px/1mm mobile rail.
- Preserve the reader and wake-lock rules in
  [DLC 02](../dlc/dlc-02-reader-and-measurement-polish.md) and the
  [decision log](../../decision-log.md).

## Current implementation and closest pattern

Both the private recipe route and the public shared route render the same
[`RecipeReader`](../../../../src/app/recipes/recipe-reader.tsx), so it is the
right place to preserve behavior; only the context-specific CSS needs to be
normalized. The public route is
[`src/pages/r/[publicId].tsx`](<../../../src/pages/r/[publicId].tsx>), and the
private route is
[`src/app/recipes/[id]/page.tsx`](<../../../src/app/recipes/[id]/page.tsx>).

The desktop rules in
[`recipe-reader.css`](../../../../src/app/styles/recipe-reader.css) now use 18px
ingredient names and 0.92em Specifics in both contexts. The Cook-mode checkbox
input keeps its existing 13.333px size; a 22.333px column and 3px/6px internal
spacing preserve the requested gaps at desktop and mobile widths. The target
is 48px tall on mobile; its desktop height follows the visible checkbox.

Before this fix, the CSS gave the desktop checkbox column a 32px width; the
mobile rules in
[`recipe-instruction-display.css`](../../../../src/app/styles/recipe-instruction-display.css)
set it to 21px and placed the checkbox 1mm from the table edge and ingredient
column. Those dimensions have been replaced by the accepted 3px/6px spacing.

The private-reader E2E coverage in
[`recipes.spec.ts`](../../../../tests/e2e/recipes.spec.ts) checks desktop/mobile
checkbox geometry and preserves the existing accessibility checks. The parity
test in
[`public-recipes.spec.ts`](../../../../tests/e2e/public-recipes.spec.ts) compares
private and shared reader typography and checkbox spacing at desktop, 390px,
and 320px widths, and verifies check-off after a rejected Wake Lock request.

The private and shared instances of `RecipeReader` are the closest working
pattern and serve this workflow well. Reuse them rather than creating a
separate presentation component.

## Scope and exclusions

- Match private and shared Ingredient-first name and Specifics sizes to the
  first user-provided visual reference; do not use the larger size in the
  second reference.
- In both contexts, set the Cook-mode checkbox 3px from the table's left border
  and 6px from the ingredient text.
- Vertically center all Ingredient-first table cells in private and shared
  readers.
- Match private/shared Ingredient-first cell padding and text line-height;
  retain visible top and bottom rules on tinted stripe rows.
- Keep unit controls at least 48px tall on mobile and compact on desktop in
  both contexts.
- Preserve the 48px-tall mobile target, compact desktop rows, mobile table
  alignment, wrapping, and no-overflow behavior. The new 3px/6px spacing
  replaces the previous 21px/1mm checkbox-placement target for this fix.
- Do not change Standard view, print, recipe data, persisted preferences,
  ingredient ordering, or public-data allow-lists.
- Do not change Cook-mode state, check-off behavior, or Wake Lock requests.
  Cook mode and checked ingredients remain transient; exiting Cook mode or
  changing recipes clears check-off. Wake Lock remains best-effort, and its
  failure must not disable check-off.
- No migration, API, authorization, or new network boundary is needed.

## Interaction and responsive behavior

The reader controls and checkbox keep their current accessible names, keyboard
order, focus behavior, and immediate interaction. The checkbox remains
operable when Wake Lock is unsupported or rejected. The public reader exposes
only the recipe data it already allows.

Apply the 3px/6px checkbox spacing at desktop and mobile widths in both private
and shared readers. Keep the table flush with the Ingredients section at mobile
widths, avoid checkbox/text overlap, and prevent page-level horizontal
overflow.

## Test-first acceptance

- Extend the private and public reader browser coverage with equivalent
  ingredient content, including Specifics. At the same desktop viewport,
  computed name and Specifics font sizes match between private and shared
  pages, and screenshots match the first visual reference rather than the
  larger second reference.
- At desktop and mobile widths, measure the checkbox input's left edge from
  the table border and its right edge from the ingredient text. Each gap is
  3px and 6px respectively, within 1 CSS px. Mobile targets remain at least
  48px tall; desktop targets do not force short rows to grow.
- At desktop and mobile widths, vertically center Ingredient-first cells in
  both private and shared readers.
- At desktop and mobile widths, assert matching Ingredient-first cell padding
  and text line-height, zero borders on neutral rows, and 1px top/bottom
  borders on tinted rows.
- Assert matching first-row heights and 48px unit-control targets on mobile;
  desktop unit controls remain compact.
- At 390px and 320px, retain left alignment and wrapping, meet the new 3px/6px
  spacing, and check for no page-level horizontal overflow.
- In both contexts, verify Cook-mode checkbox labels, check-off, and continued
  check-off when the Wake Lock request is unavailable or rejected. Keep the
  existing accessibility checks.
- Capture and inspect representative private and shared screenshots at
  desktop and mobile widths; screenshots supplement, not replace, geometry
  and behavior assertions.

## Assumptions and verification limits

- The first visual reference is the intended text-size target for both private
  and shared readers; the second reference is explicitly too large. The
  accepted reference is implemented as 18px desktop ingredient names with
  0.92em Specifics.
- The 3px/6px checkbox spacing replaces the prior 21px/1mm rail geometry for
  this fix; preserve the 48px mobile target and desktop row density.
- The closest private/shared reader component and its CSS/tests were inspected.
  Focused Playwright checks passed in Chromium and Fold 6 at desktop, 390px,
  and 320px widths. The desktop and 390px screenshots were captured and
  inspected; the 320px no-overflow and spacing assertions also passed.

## Review gate

The user approved the visual target and scope on 2026-11-18. The CSS, focused
E2E coverage, visual guide, decision log, and Slice 16 contract now reflect the
verified behavior. No version change is proposed for this planning brief.
