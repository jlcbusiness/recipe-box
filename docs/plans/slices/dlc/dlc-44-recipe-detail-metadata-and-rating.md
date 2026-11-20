# DLC 44: Recipe Detail Metadata and Rating

**Status:** Draft candidate. DLC 43 owns the Rating control and edit workflow;
confirm the affected reader surfaces before implementation.

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
- Do not add or redefine a Rating control in this slice. Reuse the control and
  behavior defined by [DLC 43](./dlc-43-rating-scale-guidance.md).
- Preserve Rating's score values, Tried-only rule, and privacy boundary.

## Proposed behavior

- Remove only the five named fields from recipe detail metadata. Do not remove
  their filters, edit controls, or saved values.
- Leave Rating presentation and editing to DLC 43. Do not add a separate
  numeric metadata value beside its detail control.
- Do not change the existing behavior that clears Rating when State changes
  away from Tried.

## Acceptance criteria

1. The five fields remain stored and editable, and continue to affect the
   existing search/filter behavior, but no longer appear in recipe detail
   metadata.
2. Other detail metadata, time entries, notes, ingredients, and recipe
   content retain their current order and presentation.
3. Detail shows exactly one Rating control as defined in DLC 43, not a duplicate
   standalone Rating metadata value.
4. Tests cover hidden detail fields and retained search/edit behavior; Rating
   control, save/clear, history, and conflict behavior are covered by DLC 43.

## Open decisions

- This draft assumes the five fields are hidden only on the private recipe
  detail screen. Confirm whether the same reduction applies to public detail,
  print, offline, or standalone HTML output.
- Reconcile the new detail order with the current visual-design and
  comprehensive-reference contracts before implementation.

## Initial sizing

Low-to-medium difficulty; about **0.5–1.5 days**; medium churn. The Rating
control is delivered by DLC 43, leaving this slice focused on metadata
presentation and its output boundaries.

## References

- [Recipe card and metadata reference](../../comprehensive-reference/01-recipe-card-and-metadata.md)
- [Visual design guide](../../visual-design.md)
- [DLC 10: Recipe ratings, stars, and hearts](./dlc-10-ratings-and-favorites.md)
- [Recipe detail page](../../../../src/app/recipes/[id]/page.tsx)
- [Recipe form](../../../../src/app/recipes/recipe-form.tsx)
- [Recipe actions](../../../../src/app/recipes/actions.ts)
