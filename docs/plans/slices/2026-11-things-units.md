# November 2026 Things Wording and Addable Units (#7 and #10)

**Status:** Implemented and verified with focused unit, migration/database,
and browser tests.

## Outcome

Make Things amounts read naturally in Standard view and allow people to add or
reuse a Things unit while editing a recipe. Preserve numeric scaling while
supporting an explicitly entered standalone `a` for one Thing.

## Requirements and references

- Fixes #7 and #10 in the [November Updates intake](./2026-11-updates-page-fix-intake.md).
- See the [C+F input-consistency overview](./2026-11-numeric-input-consistency.md)
  for shared decisions and the input inventory.
- Relevant contracts: [Things measurements and density](../comprehensive-reference/02-ingredients-and-presentation.md#3-ingredient-rows-measurements-and-density),
  [scaling](../comprehensive-reference/02-ingredients-and-presentation.md#34-scaling-math-and-rounding-rules),
  [Settings picklists](../comprehensive-reference/05-settings-and-taxonomies.md#8-settings-taxonomies-and-picklists),
  [data model](../data-model.md), [design philosophy](../design-philosophy.md),
  [visual design guide](../visual-design.md), and [decision log](../decision-log.md).
- Current implementation patterns:
  [`measurement-editor.tsx`](../../../src/app/recipes/measurement-editor.tsx),
  [`ingredient-rows-editor.tsx`](../../../src/app/recipes/ingredient-rows-editor.tsx),
  and the revision-checked [recipe picklist action](../../../src/app/actions/recipe-picklists.ts).
- Measurement persistence boundaries:
  [measurement save RPC](../../../supabase/migrations/20261008000000_add_recipe_ingredient_measurements.sql)
  and [public-copy payload](../../../src/lib/recipes/public-copy-rules.ts).

## Existing behavior and nearest patterns

Before this slice, Standard Things output did not consistently include “of”.
The Things picker was Settings-managed but had no inline Add option, and the
recipe picklist action did not allow `informal_unit`. The implementation reuses
the addable suggestion pattern and revision-checked picklist lifecycle.

Recipe measurements are numeric and scale. The measurement RPC accepts an
explicit key allowlist, and public copies use a separate measurement payload;
an authored `a` marker must be explicitly carried through both.

## Behavior contract

- Standard-view Things wording includes “of” where the saved unit does not
  already include it. Never duplicate a saved “of”. Ingredients-First shows
  the ingredient in a separate column, so its Things amount omits a trailing
  “of” (for example, `a bunch`), including when the saved unit label ends in
  “of”. Preserve current pluralization for scalar amounts and legacy ranges.
- Permit the trimmed standalone token `a` only in a Things amount field. It
  represents numeric one but is an explicit author choice: never rewrite a
  typed `1` to `a`. Reject `a` in other categories and reject any arithmetic
  expression containing `a`.
- Persist the explicit choice separately from the numeric value. Show `a`
  only when the marker is present, the reader is displaying the Things
  measurement, and the effective scaled amount is exactly one. If the reader
  switches to an equivalent Volume or Weight value, show that numeric
  equivalent—even if it equals one. Switching back to Things may show `a`
  again when its effective amount is one.
- Keep scaling and conversion numeric. If the effective Things amount is not
  exactly one, show the numeric result rather than `a`.
- Recipe editing can add or reuse a Things unit inline. Adding the unit updates
  the account-managed picklist through its existing authorization,
  uniqueness, revision, and conflict behavior. Assigning the unit to a recipe
  remains a draft until the recipe is explicitly saved. Cancelling the recipe
  does not undo a successful account-picklist addition.
- Reuse the arithmetic dispatch defined in the
  [Numeric Arithmetic brief](./2026-11-numeric-arithmetic.md): standalone `a`
  is handled as a Things literal before expression evaluation; `a` inside an
  expression is invalid. No arithmetic beyond this integration is part of
  this slice.
- Help explains the explicit `a` choice versus numeric `1`, scaling behavior,
  Standard and Ingredients-First wording, and how to add a Things unit.

## Data, migration, and failure boundaries

- Add a backward-compatible `amount_is_a` marker, defaulting to false and valid
  only for a scalar Things amount of one.
- Carry the marker through recipe save/load, versioned history, public recipe
  copies, print, offline output, and supported import/export bundles. Update
  the SQL RPC's strict measurement-key allowlist and public-copy allowlist;
  do not rely on an unknown JSON field being ignored.
- The migration must preserve existing amounts and range bounds. It must not
  infer the marker from an existing numeric one or otherwise change recipe
  meaning. Public output exposes the marker only with the same ingredient
  measurement already exposed by that recipe's projection.
- Failed Things additions show existing authorization, duplicate, or
  revision-conflict feedback. Do not silently use a non-persisted unit or
  report success after a failed catalog write.

## Test-first acceptance

- Unit tests cover “of” composition with and without a built-in “of”,
  pluralization, explicit `a`, numeric equivalence to one, and the distinct
  Standard and Ingredients-First wording, including a saved unit ending in
  “of”; they also cover rejection outside Things and inside arithmetic and no
  automatic conversion from numeric `1`.
- Reader tests prove `a` appears only in Things presentation, disappears when
  showing an equivalent Volume or Weight, and returns when switching back if
  the effective Things amount is exactly one. Test other scales and legacy
  ranges as well.
- Migration and API tests cover the marker default and constraints, recipe
  save/load/history, public-copy allowlists, and bundle/offline round-trips.
  Measurements without the marker retain existing behavior.
- Focused browser tests cover keyboard search, inline Add/reuse, duplicate or
  concurrent additions, visible failures, draft-only recipe assignment,
  cancellation, standard/mobile text entry of `a`, and private/shared output.
  The authenticated Help test checks the amount guidance and verifies the
  page remains accessible and overflow-free at desktop and narrow mobile
  widths.

## Completion

This separate Things implementation slice was approved and completed after the
Numeric Arithmetic work. The canonical comprehensive reference, data-model
contracts, and Help page were updated alongside implementation; focused
verification passed.
