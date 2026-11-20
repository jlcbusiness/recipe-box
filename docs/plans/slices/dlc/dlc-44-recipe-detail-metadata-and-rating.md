# DLC 44: Recipe Detail Metadata and Rating

**Status:** Implemented in app version 1.17.0. DLC 43 owns the Rating control
and edit workflow; this slice reuses it.

## Outcome

Private recipe detail focuses on information that helps someone understand or
cook the recipe. Search-oriented classification stays attached to the recipe
and available in editing and search, while Rating can be changed without
opening the full recipe editor.

## Scope

- Hide State, Verdict, Enthusiasm, Reason, Occasion Details, Food Type, Meal
  Type, and Cuisine from private recipe detail, except that a **Will not try**
  recipe shows State and Reason together.
- Keep public detail and public print unchanged. Their allow-listed recipe
  payload already excludes all eight fields.
- In private Print and standalone HTML, preserve State and its applicable
  response (Enthusiasm, Verdict, or Reason), plus Occasion Details when
  present, when the existing **Include private-only details** option is
  enabled. Omit Food Type, Meal Type, and Cuisine, and preserve the existing
  preference gating.
- Offline recipe detail snapshots follow private detail, including the
  **Will not try** State-and-Reason exception.
- Keep all fields saved, editable where applicable, and preserve existing
  Find and publication recipe search/filter behavior.
- Do not add or redefine a Rating control in this slice. Reuse the control and
  behavior defined by [DLC 43](./dlc-43-rating-scale-guidance.md).
- Preserve Rating's score values, Tried-only rule, and privacy boundary.
- Do not change the database schema, save payloads, or public recipe payload.

## Transition to DLC 49

The reduced-metadata private detail presentation in this slice is an interim
posture. DLC 49 will shift the private detail experience by adding the Made
control, count, and last-made information. DLC 49 should revisit the detail
composition and responsive layout; that does not change DLC 44's metadata
visibility rules.

## Proposed behavior

- Remove the named evaluation and classification fields from private recipe
  detail, except show State and Reason together for **Will not try** recipes.
  Keep every other field and recipe content in its current order and
  presentation. Do not remove filters, edit controls, list columns, or saved
  values.
- The public detail and print output remain unchanged because their
  allow-listed payload already omits all eight fields.
- Private Print and standalone HTML retain State and its applicable response
  (Enthusiasm, Verdict, or Reason), plus Occasion Details when present, under
  the existing private-details preference. They omit the three classification
  fields. Offline detail snapshots match the reduced private detail page,
  including its **Will not try** exception.
- Leave Rating presentation and editing to DLC 43. Do not add a separate
  numeric metadata value beside its detail control.
- Do not change the existing behavior that clears Rating when State changes
  away from Tried.

## Acceptance criteria

1. Private detail omits Verdict, Enthusiasm, Reason, Occasion Details, Food
   Type, Meal Type, and Cuisine. For a **Will not try** recipe only, it shows
   State and Reason together. Other detail content remains in its existing
   order and presentation.
2. The metadata remains saved and editable where applicable; existing Find and
   publication search/filter behavior remains unchanged.
3. Public detail and public print remain unchanged and expose none of the
   eight fields.
4. With **Include private-only details** enabled, private Print and standalone
   HTML retain State and only its applicable response (Enthusiasm, Verdict, or
   Reason), plus Occasion Details when present. They omit Food Type, Meal Type,
   and Cuisine; the existing preference gating remains unchanged. Offline
   detail snapshots omit the hidden fields, except State and Reason are shown
   together for **Will not try** recipes.
5. Private detail shows exactly one Rating control as defined in DLC 43, not a
   duplicate standalone Rating value; eligible private output retains its
   existing numeric Rating behavior.
6. Tests cover the Want to try, Tried, and Will not try detail states,
   including the State-and-Reason exception, and verify that editing and
   existing search/filter behavior remain intact.
7. Tests cover public-output privacy, offline detail, and private Print and
   standalone HTML with **Include private-only details** both on and off.
   Responsive checks verify the remaining detail layout at desktop and mobile
   widths. Rating control, save/clear, history, and conflict behavior remain
   covered by DLC 43.

## Current decisions

- Hide the evaluation and classification fields from private detail, except
  show State and Reason together for **Will not try** recipes. Public detail
  and print already omit them through the public payload allow-list, so no
  public change is needed.
- In private Print and standalone HTML, preserve State and its applicable
  response (Enthusiasm, Verdict, or Reason), plus Occasion Details when
  present, when the existing **Include private-only details** option is
  enabled. Omit Food Type, Meal Type, and Cuisine without changing the
  preference gating.
- Match offline private detail snapshots to the online private detail page,
  including the **Will not try** State-and-Reason exception.
- Keep the field editor, list/search behavior, and Rating implementation
  unchanged.

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
- [Public recipe projection](../../../../src/lib/recipes/public-rules.ts)
- [Recipe output generator](../../../../src/app/recipes/recipe-output-generator.ts)
