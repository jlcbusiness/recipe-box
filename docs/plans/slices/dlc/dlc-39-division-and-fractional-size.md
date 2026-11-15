# DLC 39: Division and Fractional Size

## Status

Implemented in app version 1.13.1.

## Source and references

- User-provided requirements: simplify common divided ratios in the ingredient
  table, add a whole-ingredient instruction reference for divided rows, and
  accept fractional inch sizes for Cubed, Diced, and Sliced.
- [First-draft spec](../../first-draft-spec.md)
- [Comprehensive reference](../../comprehensive-reference.md), especially
  §§ 3.1, 3.7, and 5.1
- [Data model](../../data-model.md), divided rows, Size, and ingredient mentions
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide](../../visual-design.md), Recipe Editor and Ingredient
  Presentation
- [DLC 38](dlc-38-separate-divide-from-preparation.md), current Divide and Size
  behavior
- Current implementation: `instruction-rules.ts`, `ingredient-rules.ts`,
  `recipe-reader.tsx`, `ingredient-rows-editor.tsx`, `recipe-form.tsx`, and the
  corresponding instruction, ingredient, measurement, and reader tests.

This brief supersedes DLC 38's portion-pair display for the six ratios below
and the comprehensive reference's statement that divided rows have no whole-row
mention option. Portion arithmetic, ingredient totals, and the existing
per-portion tooltip behavior remain unchanged.

## Outcome

Common divisions are easier to scan, instructions can refer to either a
specific portion or the full amount of a divided ingredient, and cooks can
enter inch sizes as familiar fractions rather than decimals.

## Scope

- For the six supported ratios (`1 : 1`, `1 : 2`, `1 : 3`, `1 : 4`, `2 : 3`,
  and `3 : 4`), display the reduced `a : b` ratio instead of the portion
  amounts only when the portion pair selected for display uses metric units.
  Apply this in both Standard and Ingredient-first reader views. Determine
  metric eligibility from the current displayed units after scaling and unit
  conversion; for dual Volume/Weight rows, use the existing readable-pair
  selection. Preserve the formatted portion pair for customary, count,
  informal, unmeasured, and other ratios. This is display-only and does not
  change the stored ratio, portions, ingredient totals, or scaling. Print
  follows the active reader presentation and inherits the same display.
- Keep instruction mention popups independent from the table's ratio
  presentation. A portion mention continues to show that portion's actual
  scaled and converted amount and unit. Add a **whole** option for each divided
  ingredient; selecting it writes a readable token ending in `-whole`, such as
  `#carrot-main-whole`, and its popup shows the full ingredient amount and unit.
  Keep the existing single whole-row option for non-divided ingredients.
- For Cubed, Diced, and Sliced, accept positive simple and mixed fractions in
  the Size input when the unit is inches (`in`), while continuing to accept
  decimals. Keep centimeters (`cm`) decimal-only. Parse the entered size to
  the existing numeric `size_value`; reject zero, negative, range, malformed,
  and non-finite values. Display the numeric size with the existing recipe
  quantity formatter.
- Preserve existing set disambiguation in mention options. The whole option is
  labeled `<ingredient> (whole)`; when the ingredient occurs in multiple sets,
  retain the current set label as well. Its readable slug always includes the
  set identity and ends in `-whole`.
- Ensure the inch Size control permits entering `/` on mobile; its keyboard
  hint must not force decimal-only input. Keep the existing compact editor and
  mobile pane behavior.

## Data and compatibility

- No schema or bundle change is expected. `portion_one_ratio` remains the
  source for division; a whole-row mention uses the existing null
  `portion_ordinal`, while portion mentions retain ordinals 1 and 2.
- Size remains a numeric value plus `in` or `cm`; fractions convert to their
  numeric equivalent on save. Existing decimal values, saved mentions,
  non-divided rows, and public recipe projections remain compatible.
- Preserve scale and unit conversion for full-row and portion-specific
  instruction popups. Never show a simplified ratio in an instruction popup.

## Existing patterns to preserve

- DLC 38's Divide field and conditional Divide reader presentation.
- The reader's current dual-measure pair selection and amount formatting.
- Instruction mention markers' stable ingredient-row identity, set-aware
  readable slugs, and current popup interaction.
- Size's existing preparation eligibility, `in`/`cm` toggle, numeric storage,
  and recipe quantity formatting.

## Test-first acceptance

- **Ratio display — `tests/unit/recipe-reader-rules.test.tsx`:** each of the
  six supported ratios uses reduced text for metric display measures in both
  reader views; customary and non-dimensional measures retain their formatted
  portion pairs. Cover metric unit conversion, dual-measure readability
  selection, and non-listed ratios. Verify print follows the active reader
  presentation and table rendering does not change portion calculations,
  totals, or selected measurement pairs.
- **Whole-ingredient mentions — instruction-rules unit tests and
  `tests/e2e/instruction-mentions.spec.ts`:** divided rows offer both portion
  options and one `<ingredient> (whole)` option; the whole token ends in
  `-whole`, includes set identity, and resolves to the same row with a null
  ordinal. Verify selection, save/reload, and resolution preserve existing
  portion mentions and set disambiguation. On hover and keyboard focus, a
  whole mention shows the full scaled/converted amount and unit, while each
  portion mention shows its actual portion amount and unit, never the compact
  table ratio. Verify a non-divided row still has one whole-row option.
- **Fractional Size — `tests/unit/ingredient-rules.test.tsx` and
  `tests/e2e/ingredient-rows.spec.ts`:** all three eligible preparations
  accept inch decimals, simple fractions, and mixed fractions; values persist
  as numeric sizes and render through the existing formatter. Centimeter
  decimals and existing decimal inch input remain valid. Zero, negative,
  malformed, and range input remain invalid. Verify the input can accept a
  slash on mobile and fits representative fractions without breaking the
  existing row pane.
- **Regression and accessibility:** keep existing keyboard, focus, accessible
  labels, staged-save, public/private reader, and print behavior. Run the
  focused tests above and relevant type, lint, and build checks. Use browser
  checks at desktop and representative mobile widths for the reader, mention
  popup, and Size editor; assert no page-level horizontal overflow.

## Out of scope

- Changing portion arithmetic, supported measurement types, or saved totals.
- Replacing all portion pairs with ratios; only the six named ratios are
  abbreviated, and only for selected metric display measures.
- Applying table ratio text to instruction mention popups.
- Allowing fractional centimeters or size ranges.
- Adding a new persistence field or changing public-data permissions.
