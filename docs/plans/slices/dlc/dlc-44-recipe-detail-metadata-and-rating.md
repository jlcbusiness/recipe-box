# DLC 44: Recipe Detail Metadata and Rating

**Status:** Draft candidate. Confirm the Rating edit workflow and affected
reader surfaces before implementation.

## Outcome

Recipe detail focuses on information that helps someone understand or cook the
recipe. Search-oriented classification stays attached to the recipe and
available in editing and search, while Rating can be changed without opening
the full recipe editor.

## Scope

- Hide these five fields from the recipe detail metadata display: State,
  Verdict, Food Type, Meal Type, and Cuisine.
- Keep those fields saved, editable, and available to Find and publication
  recipe search.
- Add a view-mode Rating interaction for Tried recipes.
- Preserve the existing Rating values, Tried-only rule, and privacy boundary.

## Proposed behavior

- Remove only the five named fields from recipe detail metadata. Do not remove
  their filters, edit controls, or saved values.
- Show the numeric Rating on detail as it is today. Let an owner open a compact
  Rating picker there and save a selection without entering full Edit mode.
- Keep the change owner-scoped, version-checked, and represented in recipe
  history, consistent with the existing private Rating contract.
- Recommended direction: make the detail picker the single Rating edit path
  and remove Rating from the staged edit form. This avoids having both an
  immediate and staged control for the same value.
- Do not change the existing behavior that clears Rating when State changes
  away from Tried.

## Acceptance criteria

1. The five fields remain stored and editable, and continue to affect the
   existing search/filter behavior, but no longer appear in recipe detail
   metadata.
2. Other detail metadata, time entries, notes, ingredients, and recipe
   content retain their current order and presentation.
3. A Tried recipe's owner can select or clear Rating from detail without
   opening Edit. The saved value survives reload and appears in existing
   private Rating surfaces.
4. Concurrent or stale Rating updates show the existing conflict/error
   treatment and do not silently overwrite another edit.
5. Tests cover hidden detail fields, retained search/edit behavior, view-mode
   save/clear, history, and the Tried-only constraint.

## Open decisions

- Confirm whether Rating should be removed from Edit once the detail picker
  exists. If it remains there, define how staged edits interact with an
  immediate view-mode update.
- This draft assumes the five fields are hidden only on the private recipe
  detail screen. Confirm whether the same reduction applies to public detail,
  print, offline, or standalone HTML output.
- Reconcile the new detail order with the current visual-design and
  comprehensive-reference contracts before implementation.

## Initial sizing

Medium difficulty; about **1.5–3 days**; medium churn. The metadata change is
small, but the Rating control changes a currently staged write into an
immediate, version-checked detail action.

## References

- [Recipe card and metadata reference](../../comprehensive-reference/01-recipe-card-and-metadata.md)
- [Visual design guide](../../visual-design.md)
- [DLC 10: Recipe ratings, stars, and hearts](./dlc-10-ratings-and-favorites.md)
- [Recipe detail page](../../../../src/app/recipes/[id]/page.tsx)
- [Recipe form](../../../../src/app/recipes/recipe-form.tsx)
- [Recipe actions](../../../../src/app/recipes/actions.ts)
