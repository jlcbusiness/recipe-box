# November 2026 Recipe editor spacing and single-set labels (#5 and #9)

**Status: Implemented and verified in Chromium and Fold 6.**

## Outcome

Make two small recipe-editor refinements: keep a visible gap between the
measurement Type control and its Amount fields, and do not offer section-title
editing when a recipe has only one ingredient set.

These fixes share the existing recipe editor and require no schema change. The
updated [slice prompt](../../../.github/prompts/slice.prompt.md) recommends one
demonstrable outcome but permits smaller fixes to be grouped when they do not
require significant restructuring. Keep the behaviors separately testable.

## Requirements and references

- Fixes #5 and #9 from the
  [November Updates intake](./2026-11-updates-page-fix-intake.md).
- [Slice 6: Measurements](./6-measurements.md) and
  [DLC 03: Ingredient sets](./dlc/dlc-03-ingredient-sets.md).
- [Comprehensive reference, §3](../comprehensive-reference/02-ingredients-and-presentation.md#3-ingredient-rows-measurements-and-density),
  including [§3.6](../comprehensive-reference/02-ingredients-and-presentation.md#36-ingredient-sets).
- [Data model](../data-model.md), [design philosophy](../design-philosophy.md),
  [visual design guide](../visual-design.md#ingredient-presentation), and
  [decision log](../decision-log.md).
- Current implementation and tests:
  [`measurement-editor.tsx`](../../../src/app/recipes/measurement-editor.tsx),
  [`ingredient-rows-editor.tsx`](../../../src/app/recipes/ingredient-rows-editor.tsx),
  [`measurements.spec.ts`](../../../tests/e2e/measurements.spec.ts), and
  [`ingredient-sets.spec.ts`](../../../tests/e2e/ingredient-sets.spec.ts).

## Existing behavior and closest patterns

The recipe editor already places the Type picker beside the Amount controls in
one compact row. Its E2E geometry check requires the gap to be no more than
9px, which still passes at zero; it also checks that the controls remain on one
line at 901px. The Updates report identifies the missing positive separation.
Reuse this Type/Amount layout and preserve its compact sizing and keyboard flow.

The editor uses the same section-heading pattern for every set: a title button
opens an inline editor, while move/remove actions are present only when there
are multiple sets. The single-set title button remains active. Existing
ingredient-set browser coverage tests multi-set rename and removal, but does
not assert the single-set title behavior. The closest working pattern is this
existing multi-set editor; keep its save, focus, validation, and cancellation
behavior.

The reader already omits a set label when there is only one non-empty set.
Ingredient sets still require a stored label, and the editor draft saves
explicitly. Do not remove or rewrite a stored label as part of this visual
change.

## Scope and interaction

### Measurement Type-to-Amount spacing

- Add a visible, consistent gap between the Type picker and the first Amount
  field in the desktop ingredient table.
- Proposed geometry at the existing 901px test width: at least 1mm
  (approximately 3.8 CSS px) and no more than the current 9px upper bound.
- Keep the controls on one line at 901px. Preserve the existing category,
  amount, unit, keyboard, validation, and density behavior.
- Keep the current mobile control order and wrapping. Do not introduce
  page-level horizontal overflow.

The user confirmed the 1mm lower bound as the measurable target for the
reported zero-gap problem.

### Single-set section-title affordance

- With one set, do not allow the section title to be renamed. With a second set
  present, retain the existing rename controls for both sets.
- If removing a set returns the recipe to one set, remove the rename
  affordance without changing the remaining label or other draft data.
- Count the set records in the editor, including empty sets, consistently with
  the current multi-set action logic and the persistent-empty-set contract.
- Preserve explicit Save, discard on cancel/navigation, multi-set reorder and
  removal, unique-label validation, keyboard focus, visible focus, and
  accessible names.

**Confirmed presentation:** When exactly one set remains, hide the
section-title heading entirely and do not offer a rename action. Preserve the
stored set label. If a second set is added, show the existing editable titles
again; if the recipe returns to one set, hide the heading without changing its
stored label.

## Exclusions and boundaries

- No ingredient-set schema or migration changes; required labels, IDs,
  positions, uniqueness, save/version checks, and history remain unchanged.
- No change to multi-set reader, public, print, offline, import, or export
  behavior.
- No change to measurement parsing, saved values, picklists, density
  derivation, or recipe-save behavior.
- No new API, authorization boundary, or persisted field.

## Test-first acceptance

- Extend `measurements.spec.ts` to assert the proposed positive gap and the
  existing 9px maximum at the desktop viewport and 901px. Verify the controls
  remain on one line at 901px and that existing mobile layout and no-overflow
  checks still pass.
- Extend `ingredient-sets.spec.ts` at desktop and mobile widths to verify the
  heading is hidden with one set, editable titles appear after adding a second
  set, and the heading is hidden again after returning to one set.
- Remove back to one set and verify the remaining label is preserved through
  Save and reopen. Keep existing multi-set keyboard, focus, Escape,
  cancellation, duplicate-label, and save behavior covered.
- Inspect representative editor screenshots at desktop and mobile widths.
  Screenshots supplement the geometry and interaction assertions.

## Review gate

The single-set presentation and 1mm minimum gap are implemented and verified.
No schema or migration change was needed.
