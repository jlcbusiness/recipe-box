# DLC 45: Prevent Saving an Own Public Recipe

**Status:** Draft candidate.

## Outcome

An owner who opens their own public recipe cannot accidentally save a second,
private copy of it. Instead, the Save action explains that the recipe is
already theirs, using the requested friendly tone: “That's ya own recipe,
fam.”

## Scope

- Detect the source recipe owner on the server before creating a copy or
  duplicating its photos.
- Return a distinct, non-success result for an owner attempting to copy their
  own public recipe.
- Show a clear status near the Save action; do not present this as a generic
  network or save failure.
- Preserve normal copy behavior for other viewers and the existing
  already-saved-copy flow.

## Data and failure boundaries

- The database copy function is the authoritative guard. It must compare the
  authenticated destination account with the source recipe account before
  inserting a recipe or copying media.
- The API route translates the expected result into a stable response that the
  UI can render. Do not rely only on hiding or disabling the client button.
- An own-recipe attempt creates no recipe, reference, or photo assets.
- Do not expose another account's identity or add a new public owner-data
  response.

## Acceptance criteria

1. An authenticated owner attempting to save their own public recipe receives
   the distinct friendly message and no private copy is created.
2. The database guard rejects the operation even if the request bypasses the
   UI.
3. A different signed-in viewer can still save the public recipe and receives
   the existing success flow.
4. The already-saved-copy flow still opens the existing private copy.
5. Tests cover owner rejection, no media or recipe side effects, normal copy,
   duplicate copy, and UI feedback.

## Open decisions

- Confirm whether the message should include a link to the owner's private
  recipe when one can be resolved safely. The first version can simply prevent
  the duplicate and explain why.
- Confirm final punctuation and whether to keep the exact informal wording.

## Initial sizing

Medium difficulty; about **1–2 days**; low-to-medium churn. This is a narrow
server, database, and UI error-path change without a new data model.

## References

- [DLC 31: Save public recipe copies](./dlc-31-save-public-recipe-copies.md)
- [Public recipe copy route](../../../../src/app/api/public-recipes/[publicId]/copy/route.ts)
- [Public recipe save action](../../../../src/app/recipes/public-recipe-save-action.tsx)
- [Public-copy database function](../../../../supabase/migrations/20261222000000_dlc31_public_recipe_copies.sql)
