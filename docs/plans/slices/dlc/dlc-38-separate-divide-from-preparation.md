# DLC 38: Separate Divide from Preparation

## Status

Implemented in app version 1.12.0.

## Source and references

- Update entry supplied for this slice: separate “divided” as its own field
  rather than treating it as Preparation.
- [First-draft spec](../../first-draft-spec.md)
- [Comprehensive reference](../../comprehensive-reference.md), especially
  §§ 3.1, 3.7, and 4.1
- [Data model](../../data-model.md), recipe-ingredient and divided-row rules
- [Visual design guide](../../visual-design.md), Recipe Editor and Ingredient
  Presentation
- [DLC 04](dlc-04-ingredient-amounts-and-references.md), existing portion
  semantics
- [DLC 37](dlc-37-recipe-metadata-picklist-typeahead.md), current editor
  behavior
- Current implementation: `ingredient-rows-editor.tsx`,
  `recipe-reader.tsx`, `ingredient-rules.ts`, and their ingredient, measurement,
  and reader tests.

This brief is the current implementation contract. Its separate Divide field
and reader presentation supersede the corresponding older wording in DLC 04
and DLC 37; portion arithmetic and persistence remain unchanged.

## Outcome

A person can record an ingredient’s preparation (such as “sliced”) and its
division independently. Edit and View Recipe present division as a separate
field, so a divided ingredient no longer has to use “divided” as its
Preparation value.

## Scope

- Move the existing first-portion and read-only remainder controls out of the
  Preparation editor into a separate **Divide** field. Always show the
  first-portion input; a blank value means the ingredient is not divided, and
  entering an amount stages a division. Clearing the amount clears only the
  staged division. Keep Size in Preparation.
- In the mobile ingredient editor, provide a separate Divide field in the
  existing row pane; preserve its viewport-bounded, no-internal-scroll
  workflow.
- In desktop Ingredient-first View Recipe, show a **Divide** column only when
  at least one row has a division. Label the column **divided** and put a
  **divided** label on the first line of each divided cell, above its formatted
  portion pair. Keep Preparation text and Size in their own column.
- Render Ingredient-first ingredient names in small caps on desktop and mobile.
- For a dual-measure row, show one portion pair, not both. Format both
  dimensions with the active scale and unit preferences; choose the pair with
  more whole-number formatted amounts. If tied, choose the pair with the
  smaller sum of displayed amounts; if still tied, choose Volume. This is a
  display-only readability rule and never changes the saved ratio or either
  measurement.
- Keep Standard view and print readable with a separate, clearly labeled
  **divided** value rather than appending the division to Preparation. Public
  and private readers use the same presentation contract.
- Keep canonical ingredient catalog names title-cased, but display every
  multiword ingredient name in lowercase in recipe views. This is display-only;
  it does not change saved recipe or catalog values.
- In mobile Standard view, keep the amount, specifics, and ingredient name
  left-aligned. Let Preparation, Size, and Divide stay on the same line when
  the continuation fits; otherwise wrap the intact continuation to a
  right-aligned line with no extra row gap or leading comma. Keep the
  continuation's first line about one-quarter of the text size below the
  preceding line, with the same line-to-line spacing after it. Keep the desktop
  presentation inline.
- Preserve the saved total, ratio math, scaling, unit conversion, sorting,
  ingredient sets, and portion-specific instruction references.
- Keep division staged in the existing recipe form and committed only on Save.
  Cancel, close, and navigation discard the draft; conflicts and validation
  failures preserve it.

## Data and compatibility

- `portion_one_ratio` already stores the first portion’s ratio; the second is
  derived. Prefer that existing value as the persisted indication of division.
  Do not add a redundant boolean or new portion table unless implementation
  research shows the existing contract cannot represent the approved behavior.
- The unit selected while entering the first portion is draft-only: Save derives
  and persists one dimensionless ratio, not a preferred Volume or Weight
  dimension. That ratio applies to every populated measurement on the row.
  Preserve this behavior; remembering one display dimension would require a
  separate product and data-model decision.
- If Preparation is `divided`, a valid ratio is present. When loading existing
  rows, move that state to the separate Divide field and leave Preparation
  available for actual processing instructions; do not change the stored ratio.
- A non-null ratio continues to require a positive scalar Unit, Count, or
  Things total and to reject ranges and Feel values. Dual measurements retain
  the existing populated-dimension selection rules.
- Keep bundle format and public payload unchanged unless the audit demonstrates
  that a schema or payload change is necessary. Do not expose private
  ingredient-catalog data.

## Responsive and interaction proposal

- Desktop Edit retains the current table and keyboard behavior, adding a
  separate Divide field beside Preparation. Keep the recipe form up to 1200px
  wide on desktop so the added field and existing amount controls have room;
  at widths from 761px through 1199px, place Size controls below Preparation
  so the input remains usable, with 3mm between them. At 1200px and wider, keep
  Size inline when it fits. Mobile retains the current row-pane flow and touch
  targets. The first-portion input is always available, and only a nonblank
  amount records a division.
- Ingredient-first uses a semantic **Divide** column on desktop. Keep the
  “divided” column header accessible but visually hidden, and put “divided”
  above each row’s portion pair. When no row is divided, omit the column and
  preserve the current table width. When a row is divided, size the column for
  the formatted portion pair, including the proposed upper-width example
  `8 8/8 : 8 8/8`.
- Mobile does not add a physical column. Reflow the existing table to
  Ingredient, Amount, and the existing Prep column, whose divided rows also
  show the separate Divide value. Stack Volume
  above Weight in Amount when both exist; keep a single value on one line.
  Keep the existing Prep header. In a divided row, put preparation before
  `divide a : b` in the same cell; keep the Divide label and portion pair
  together on one line. Use the existing formatted portion amounts without
  repeating units. These are the two amounts, not a newly simplified integer
  ratio. Do not add another header, subheading, or physical column. Keep at
  least 8px between internal mobile columns, with no padding at the table’s
  left or right outer edge. Keep ingredient-row content unwrapped, sizing the
  table to its widest content and using the existing horizontal scroll region
  if it exceeds the viewport. Leave at least 3px between stacked Volume and
  Weight values. The mobile Preparation input should fit its widest option or
  draft plus padding, rather than filling the available row width. For dual
  measurements, use the same readable-pair rule as desktop; the chosen
  measurement is inferable from the Volume and Weight totals above.
- Re-evaluate the readable-pair choice when scaling or unit preferences change.
  This may change which measurement is shown, but never changes saved recipe
  data.
- Keep any unavoidable overflow inside the existing keyboard-scrollable
  ingredient table region, not the page. Verify the reflow with dual measures,
  long names, and the maximum-width portion pair at narrow mobile sizes.
- In Standard view and print, visually distinguish the “divided” value from
  Preparation and retain an accessible “divided” label.
- On mobile Standard view, keep the complete ingredient entry on one line when
  it fits. Otherwise, keep Preparation and Size with the primary text when
  they fit and place Divide on a compact, right-aligned line; if they do not
  fit, move Preparation, Size, and Divide together to a compact, right-aligned
  continuation. Do not add paragraph spacing; keep the continuation's first
  line about one-quarter of the text size below the preceding line and preserve
  the same line-to-line spacing after it. Keep the divided label and portion
  pair unbroken.
- Preserve visible focus, semantic labels, table headers, and current save,
  cancel, error, and screen-reader announcement behavior.

## Out of scope

- Changing portion arithmetic, supported measurement types, or the canonical
  recipe total.
- Changing desktop Volume and Weight columns or their formatting.
- Adding a new division persistence model or changing public-data permissions
  without evidence that the existing ratio model is insufficient.

## Test-first acceptance

- **Editor — `tests/e2e/ingredient-rows.spec.ts` and
  `tests/e2e/measurements.spec.ts`: Preparation can be “sliced” while a
  nonblank Divide amount records a division; the always-visible blank
  first-portion input has no checkbox and does not divide the row, and clearing
  it clears the staged ratio without changing Preparation. Size remains tied to
  Preparation; divide controls retain current scalar validation, dual-measure
  selection, keyboard behavior, focus, and mobile pane fit. At narrow and wide
  desktop widths, Preparation and Size remain usable with 3mm separation.
  Verify Cancel
  discards the staged division and that the desktop recipe form can use 1200px
  at a wide viewport. `tests/e2e/recipes.spec.ts` verifies ingredient references
  use the separate Divide field. `tests/e2e/measurements.spec.ts` verifies a
  legacy divided row loads into Divide, accepts a real Preparation value, and
  retains its ratio on save.
- **Reader — `tests/unit/recipe-reader-rules.test.tsx`:** divided and
  non-divided rows render independently of Preparation in Standard and
  Ingredient-first views; “sliced” and divided amounts can appear together;
  formatting, scaling, and units remain correct. Unit tests cover the
  dual-measure choice: most whole-number amounts wins, then the lower displayed
  sum, then Volume on an exact tie. Multiword ingredient names display in
  lowercase across recipe views without changing canonical catalog values.
- **Responsive reader — `tests/e2e/measurements.spec.ts` and relevant
  ingredient/public-reader tests:** no Divide column when no divisions exist,
  with measured table width matching the existing layout; with divisions,
  values remain visible and the semantic desktop header is accessible but
  visually hidden. At 760px, 390px, and
  320px, assert the mobile table has no extra physical Divide column, dual
  measures stack in Amount, and a divided Prep cell shows preparation followed
  by the computed portion amounts labeled `Divide a : b`, with no extra
  heading. Verify the selected dual-measure pair follows the readability rule
  and updates when scale or unit preferences change. Assert wrapped continuation
  spacing is about one-quarter of the text size and the next ingredient keeps
  the same vertical rhythm. Assert no page-level horizontal overflow, overlap,
  or clipped content.
- **Compatibility and outputs:** cover existing `Preparation = divided` rows
  with valid ratios; verify they load into the Divide field, preserve the
  ratio, and can also have a real preparation value. `tests/e2e/public-recipes.spec.ts`
  verifies private and public reader, print, and HTML-download output;
  `tests/e2e/offline.spec.ts` verifies online and offline readers;
  `tests/unit/export-rules.test.tsx` and `tests/unit/import-rules.test.tsx`
  verify exported and imported bundles preserve the ratio. These outputs
  preserve the separate-field presentation without changing saved totals.
- **Accessibility:** assert the Divide editor label and table header, keyboard
  operation, visible focus, screen-reader-accessible values, and no automated
  accessibility violations at desktop and mobile.
