# November 2026 Numeric Arithmetic (#4)

**Status:** Approved; implementation in progress.

## Outcome

Use one exact arithmetic model for every editable numeric input in Recipe Box,
including the existing recipe-time fields. Normalize only after evaluation,
then run the target field's existing validation.

## Requirements and references

- Fix #4 in the [November Updates intake](./2026-11-updates-page-fix-intake.md).
- See the [C+F input-consistency overview](./2026-11-numeric-input-consistency.md)
  for shared decisions and the complete source inventory.
- Relevant contracts: [recipe times](../comprehensive-reference/01-recipe-card-and-metadata.md#22-time-tracking-and-overlapping-times),
  [ingredient measurements and density](../comprehensive-reference/02-ingredients-and-presentation.md#3-ingredient-rows-measurements-and-density),
  [scaling and rounding](../comprehensive-reference/02-ingredients-and-presentation.md#34-scaling-math-and-rounding-rules),
  [Size and portions](../comprehensive-reference/02-ingredients-and-presentation.md#37-divided-portions-and-size),
  [numeric filters](../comprehensive-reference/04-publications-and-search.md#71-recipe-and-publication-search-and-filters),
  and the [data model](../data-model.md).
- Current parser and tests:
  [`time-rules.ts`](../../../src/lib/recipes/time-rules.ts),
  [`measurement-rules.ts`](../../../src/lib/recipes/measurement-rules.ts),
  [`recipe-time-rules.test.tsx`](../../../tests/unit/recipe-time-rules.test.tsx),
  and [`recipes.spec.ts`](../../../tests/e2e/recipes.spec.ts).

## Scope and input inventory

Apply arithmetic to all editable numeric values, including transient reader and
query controls:

- **Recipe values:** time-entry minutes; Volume, Weight, Count, and Things
  measurement amounts; first-portion amounts; ingredient Size in `in` or `cm`;
  Serves; and Makes quantity.
- **Settings and nutrition:** trusted-density Volume and Weight; editable
  ingredient average-measure Volume and Weight; nutrition serving-size amount
  and editable nutrient values.
- **Transient controls:** target servings, scaling multiplier and divisor;
  numeric Recipe Finder filters for Serves, Total Time, and Rating; and numeric
  publication filters and column filters, including each explicit `Between`
  bound.

Numeric identifiers such as ISBN, discrete Rating selections, calculated or
read-only values, and pagination state are excluded. The numeric Rating filter
remains in scope because it is a value-entry control.

The Things-only standalone `a` token, Things wording, and inline unit addition
belong to the separate
[Things brief](./2026-11-things-units.md), not this slice.

## Behavior contract

- Use a shared, non-evaluating parser for integer and decimal operands,
  parentheses, unary signs, and `+`, `-`, `*`, and `/` with standard precedence.
  Evaluate using exact rational arithmetic; never use JavaScript `eval`.
- Recognize expressions before field normalization. Pass valid non-expression
  literals unchanged to the field parser so supported mixed fractions and
  fraction glyphs retain their existing handling. Malformed or incomplete
  expressions, division by zero, and out-of-range results must produce visible
  errors rather than fall through as literals.
- Evaluate first, then normalize. Integer fields use nearest-integer, half-up
  rounding, with ties away from zero. Decimal values retain exact results until
  their own supported precision and formatting rules are applied. Then run the
  field's current validation. Save the resolved value, not the equation.
- Formula-enabled fields use text inputs and the standard mobile text keyboard
  (`inputMode="text"` where an input mode is specified), not the numeric
  keypad. Do not add an `fx` toggle, operator strip, popup, or other controls.
  People type operators and parentheses as ordinary text.
- Do not accept new hyphen-delimited quantity ranges; the hyphen is available
  for subtraction. Preserve existing saved ranges and their bounds. An
  unchanged legacy range must survive an unrelated recipe edit and save;
  editing that amount requires a scalar replacement. Do not silently select a
  bound or rewrite range data.
- Do not add standalone `a` handling here; that behavior belongs to the
  separate Things slice.

## Data and failure boundaries

- Arithmetic expressions are transient input. Persist only the resolved,
  field-normalized value.
- No migration may discard or rewrite existing range bounds. Retain the
  existing storage shape for legacy values.
- Invalid expressions or values remain visible and block the affected save or
  query apply. Do not show a success-shaped value or silently fall back.
- Preserve existing ownership, query, nutrition, and public-data boundaries.

## Test-first acceptance

- Unit tests cover exact decimal and fraction math, precedence, parentheses,
  unary signs, malformed and incomplete expressions, division by zero, and
  field validation after normalization. Include `0.1 + 0.2`.
- Verify that mixed fraction text and glyphs pass through to existing field
  parsers, while malformed expressions do not.
- Cover integer rounding and decimal preservation for every input class in the
  inventory, including limits and invalid values.
- Prove new hyphenated ranges fail; an unchanged legacy range survives an
  unrelated recipe edit/save with both bounds and history intact; editing that
  amount requires a scalar.
- Focused browser tests exercise formula entry, the standard mobile text
  keyboard, normalization, visible errors, and save/apply behavior on every
  listed input surface. Preserve labels, visible focus, and existing layouts.

## Implementation state

This brief is independent of the Things wording and picklist brief. Arithmetic
implementation is underway; the Things slice remains deferred until arithmetic
verification is complete. The C+F overview remains the shared record of why
these related fixes were prepared together.
