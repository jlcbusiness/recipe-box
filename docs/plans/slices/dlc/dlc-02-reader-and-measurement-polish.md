# DLC 02: Recipe reader and measurement polish

This brief collects reader-control and display refinements that do not require a
new recipe data model.

## Outcome

Recipe readers expose clear view controls and editable unit affordances, retain
usable space for cook-mode checkboxes, and present time and small-volume values
consistently across private, public, and printed recipes where applicable.

## Scope

- Revisit the placement, alignment, and labels of reader view controls.
- Make editable gram/unit values visibly discoverable without relying on
  hover-only styling.
- Reduce ingredient-side margins in cook mode when they interfere with
  checkboxes, including narrow and screen-lock states.
- Rename the time summary to “Time Breakdown” and format durations over an hour
  in a readable hour/minute form.
- Evaluate “pinch” as a supported display conversion for 1/16 teaspoon.

## Decisions before implementation

- Confirm whether time values remain stored as minutes and only display changes.
- Define whether 1/16 teaspoon converts to the informal unit “pinch,” and the
  exact rounding and reverse-conversion behavior.
- Keep public and print behavior consistent with the accepted presentation
  contract from DLC 08; do not silently change stored measurements.

## Acceptance

- Reader controls are left-aligned and visually associated with their labels
  without shifting content when modes change.
- Editable amounts have visible affordance and accessible names.
- Cook-mode controls remain operable at mobile widths and with wake lock active
  or unavailable.
- Time and pinch formatting have deterministic unit, browser, and public/print
  regression tests.
