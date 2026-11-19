# November 2026 Input Consistency Overview (#4, #7, #10)

**Status:** Coordination overview. Numeric Arithmetic (#4) is approved and
being implemented. Things Wording and Addable Units (#7 and #10) is separately
approved but deferred until arithmetic verification is complete.

## Outcome

Use one exact arithmetic model across editable numeric inputs, including
recipe-time expressions, and make Things amounts read naturally without losing
their numeric scaling behavior. This overview records their shared rationale;
the arithmetic and Things changes are separate implementation slices.

## Requirements and references

- Fixes #4, #7, and #10 in the
  [November Updates intake](./2026-11-updates-page-fix-intake.md).
- [Comprehensive reference, ingredient amounts and density](../comprehensive-reference/02-ingredients-and-presentation.md#3-ingredient-rows-measurements-and-density),
  [scaling and rounding](../comprehensive-reference/02-ingredients-and-presentation.md#34-scaling-math-and-rounding-rules),
  [portion and Size fields](../comprehensive-reference/02-ingredients-and-presentation.md#37-divided-portions-and-size),
  [recipe metadata and time expressions](../comprehensive-reference/01-recipe-card-and-metadata.md#22-time-tracking-and-overlapping-times),
  [numeric query filters](../comprehensive-reference/04-publications-and-search.md#71-recipe-and-publication-search-and-filters),
  [Settings picklists](../comprehensive-reference/05-settings-and-taxonomies.md#8-settings-taxonomies-and-picklists),
  [data model](../data-model.md), [design philosophy](../design-philosophy.md),
  [visual design guide](../visual-design.md), and
  [decision log](../decision-log.md).
- Current arithmetic implementation:
  [`time-rules.ts`](../../../src/lib/recipes/time-rules.ts),
  [`measurement-rules.ts`](../../../src/lib/recipes/measurement-rules.ts),
  and [time expression unit and browser tests](../../../tests/unit/recipe-time-rules.test.tsx).
- Current input surfaces:
  [`recipe-form.tsx`](../../../src/app/recipes/recipe-form.tsx),
  [`ingredient-rows-editor.tsx`](../../../src/app/recipes/ingredient-rows-editor.tsx),
  [`measurement-editor.tsx`](../../../src/app/recipes/measurement-editor.tsx),
  [`ingredient-density-manager.tsx`](../../../src/app/settings/ingredient-density-manager.tsx),
  [`ingredient-catalog-manager.tsx`](../../../src/app/settings/ingredient-catalog-manager.tsx),
  [`nutrition-pane.tsx`](../../../src/app/nutrition/nutrition-pane.tsx),
  [`recipe-reader.tsx`](../../../src/app/recipes/recipe-reader.tsx),
  and the [recipe](../../../src/app/recipes/find/recipe-filter-builder.tsx) and
  [publication](../../../src/app/publications/publication-filter-builder.tsx)
  filter builders.
- The [measurement save RPC](../../../supabase/migrations/20261008000000_add_recipe_ingredient_measurements.sql)
  accepts an explicit measurement-key allowlist. Public copies use a separate
  [measurement payload contract](../../../src/lib/recipes/public-copy-rules.ts).
- The existing inline-add pattern is
  [`SuggestionCellEditor`](../../../src/app/recipes/ingredient-rows-editor.tsx);
  recipe picklist writes use the existing revision-checked
  [picklist action](../../../src/app/recipes/actions.ts).

## Existing behavior and nearest patterns

The shared parser now evaluates numeric expressions with exact rational
arithmetic before field-specific normalization. Recipe-time fields, ingredient
amounts, and other listed numeric inputs use that parser; unchanged saved
measurement ranges remain readable and survive unrelated saves, while new or
edited amounts must be scalar. The Things marker and addable-unit workflow have
not started.

The Things selector is Settings-managed but does not offer inline Add. The
recipe picklist action does not currently allow adding `informal_unit` values.
The existing addable suggestion pattern and picklist revision/conflict rules
are the required interaction and persistence precedents.

## Numeric input inventory and scope

Arithmetic applies to **all editable numeric value inputs**, whether they
persist recipe/settings data or control a query or reader. Resolve the
following surfaces; do not limit the implementation to whole-number fields.

### Persisted recipe values

- **Time entry minutes:** currently accepts integer arithmetic and stores the
  resolved non-negative whole minutes. Update it to the shared exact parser.
- **Ingredient measurements:** Volume, Weight, Count, and Things amount text
  fields currently use the quantity parser. Accept expressions and preserve
  each field's existing positive-value and measurement validation.
- **First-portion amount:** the Divide editor currently parses a scalar
  quantity. Accept arithmetic, then apply its existing scalar and ratio rules.
- **Ingredient Size:** accept expressions in the numeric value for `in` and
  `cm`; retain inches' supported decimal/fraction syntax and centimeters'
  decimal behavior.
- **Serves and Makes quantity:** both are optional positive integers. Evaluate
  exactly, then normalize to an integer using nearest rounding with halves up.

### Persisted Settings and nutrition values

- **Trusted density Volume and Weight amounts:** accept arithmetic in both
  editable amounts; preview and save must resolve to the same validated values.
- **Ingredient average measure equivalents:** accept arithmetic in editable
  Volume and Weight amounts. A density-derived, read-only amount is not an
  input.
- **Nutrition values:** accept arithmetic in editable serving-size and nutrient
  amounts, then apply their current non-negative and field-specific constraints.
  Calculated or inherited read-only values are not inputs.

### Transient numeric controls

- **Recipe scaling:** accept arithmetic in target servings, multiplier, and
  divisor controls, then preserve each mode's existing positive integer or
  decimal constraints.
- **Recipe Finder numeric filters:** include Serves, Total Time, and Rating
  values. A Rating selected in the recipe editor remains a discrete choice;
  its numeric filter value is editable and in scope.
- **Publication numeric filters and column filters:** include numeric values
  and each separately labeled `Between` bound. These query controls keep their
  explicit two-field range behavior.

### Exclusions

- Numeric identifiers such as ISBN remain text identifiers, even where the
  mobile keyboard is numeric.
- Discrete rating choices are not converted into free-form numeric inputs.
- Computed totals, density-derived values, calculated nutrition, read-only
  portion remainders, display text, and pagination state are not entry fields.
- Removing hyphenated ranges applies to quantity amounts, not to the explicit
  `Between` controls in numeric filters.

## Separate implementation briefs

- **#4, Numeric Arithmetic:** extend exact arithmetic to every editable
  numeric input, update time expressions to that model, and preserve legacy
  ranges. See the [Numeric Arithmetic brief](./2026-11-numeric-arithmetic.md).
- **#7 and #10, Things Wording and Addable Units:** implement natural Things
  wording, standalone `a`, and inline unit addition with its persisted marker.
  See the [Things brief](./2026-11-things-units.md).

Each brief has its own acceptance criteria and approval. Numeric Arithmetic is
approved and in progress. The Things slice reuses the arithmetic parser
boundary but does not expand the arithmetic slice's completion gate; its
implementation remains deferred.

## Behavior contract

### Arithmetic

- Use a shared, non-evaluating parser for integer and decimal operands,
  parentheses, unary signs, and `+`, `-`, `*`, and `/` with standard precedence.
  Evaluate with exact rational arithmetic; never use JavaScript `eval`.
- Recognize actual expressions before field-specific normalization. A valid
  non-expression literal is passed unchanged to its field parser, preserving
  supported fraction text and glyphs. An attempted but malformed expression,
  incomplete expression, division by zero, or out-of-range result is an
  explicit validation error; it must not fall through as a successful literal.
- Evaluate first and normalize second. Integer fields use nearest-integer,
  half-up rounding, with ties away from zero. Decimal fields retain the exact
  result until their own supported precision and formatting rules are applied.
  Then run the field's ordinary validation. Do not save the equation as the
  field value.
- Formula-enabled fields use text inputs and the standard mobile text keyboard
  (`inputMode="text"` where an input mode is specified), not the numeric
  keypad. Do not add an `fx` toggle, operator strip, popup, or other controls.
  People type operators and parentheses normally; preserve labels, visible
  focus, and existing layout.

### Quantity ranges and existing data

- Do not accept new hyphen-delimited ranges in quantity input. The hyphen is
  available for subtraction; users enter one exact amount instead.
- Preserve already-saved range values and their current read presentation
  without rewriting their stored bounds. An unchanged legacy range may pass
  through unrelated edits; editing that amount requires replacing it with one
  scalar value. Do not silently choose a bound or otherwise rewrite existing
  data.

### Things wording and explicit `a`

- Standard-view Things wording includes “of” where the saved unit does not
  already include it, and does not duplicate an existing “of”. Preserve the
  current unit pluralization rule for scalar values and legacy ranges.
- Permit the trimmed standalone token `a` only in a Things amount field. It
  represents numeric one but is an explicit author choice: never rewrite a
  typed `1` to `a`. Reject `a` in other measurement categories and reject
  arithmetic containing `a`.
- Persist the explicit `a` choice separately from the numeric amount. Display
  `a` only when the authored choice is present, the reader is displaying
  Things, and its effective scaled amount is exactly one. If the reader shows
  an equivalent Volume or Weight value, show that numeric value even when it
  equals one. This keeps scaling and conversions numeric.
- Recipe editing can add or reuse a Things unit inline. The new unit is saved
  to the account-managed picklist using its existing revision, authorization,
  uniqueness, and conflict behavior; selecting it in a recipe remains a draft
  until the recipe is saved.

## Data, migration, and failure boundaries

- Adding the explicit `a` choice requires a persisted marker with a backward-
  compatible false default. The precise column name is an implementation
  detail; it must be valid only for a scalar Things amount of one.
- Carry the marker through recipe save/load, versioned history, public recipe
  copies, print, offline output, and supported import/export bundles. Update
  the SQL RPC's strict measurement-key allowlist and public-copy allowlist;
  do not rely on an unknown JSON field being ignored.
- The migration must preserve existing amounts and range bounds. It must not
  change a recipe's meaning by converting a range or inferring the `a` marker.
- Invalid arithmetic or field values remain visible with a correction message
  and block the affected save or query apply. Failed Things additions show the
  existing explicit authorization, duplicate, or revision-conflict feedback;
  do not silently fall back to a normal numeric amount or an unsaved unit.
- Preserve existing account ownership and public-data boundaries. The marker
  is public only as part of the same ingredient measurement already exposed by
  that recipe's public projection.

## Test-first acceptance

- Unit tests cover exact decimal and fraction arithmetic, precedence,
  parentheses, unary signs, malformed/incomplete input, division by zero,
  field normalization, and validation after normalization. Include a case such
  as `0.1 + 0.2` to prove evaluation does not round intermediate results.
- Tests cover non-expression pass-through for supported mixed fractions and
  glyphs; malformed expressions must not pass through as literals.
- Field-level tests cover integer half-up normalization and decimal preservation
  for every surface in the inventory, including limits and invalid values.
- Quantity tests prove new hyphenated ranges fail, an unchanged legacy range
  survives an unrelated recipe edit/save with both bounds and history intact,
  and editing that amount requires a scalar.
- Things tests cover standalone `a`, numeric equivalence to one, rejection
  outside Things and inside expressions, no automatic conversion from `1`,
  display only in Things mode, numeric output in converted Volume/Weight mode,
  scale changes, “of” composition, and pluralization.
- Migration and API tests cover the marker's default, Things-only constraints,
  recipe save/load/history, public-copy allowlists, and bundle/offline
  round-trips. Preserve existing behavior for measurements without the marker.
- Focused browser tests exercise formula entry, normalization, visible errors,
  save/apply behavior, and keyboard/mobile entry on each input surface.
  Things tests also cover inline Add/reuse, duplicate or concurrent additions,
  draft-only recipe assignment, and cancellation/failure recovery.

## Review gate

The user grouped #4, #7, and #10 as an input-consistency effort. The
implementation has since been split into two independently reviewable slices
because the arithmetic coverage and Things persistence workflow have distinct
demonstrations and data boundaries. Approve each child brief before its
implementation. Update the canonical comprehensive reference and any affected
data-model contracts alongside each implementation.
