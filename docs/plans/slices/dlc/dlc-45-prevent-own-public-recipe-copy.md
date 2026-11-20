# DLC 45: Prevent Saving an Own Public Recipe

**Status:** Implemented; app version 1.17.1.

## Outcome

When a signed-in User opens their own public recipe, the Save action does not
create a private duplicate. It displays the approved message:
`You already have this recipe. Use "copy" if you wish a duplicate.`

## Scope

- Detect the source recipe owner on the server before creating a copy or
  duplicating its photos.
- Keep the Save action and existing feedback placement; show the owner message
  as an accessible, distinct rejection rather than hiding or disabling Save.
- Do not link to the private recipe or return the source account identity.
- Return a distinct, non-success result for an owner attempting to copy their
  own public recipe.
- Show a clear status near the Save action; do not present this as a generic
  network or save failure.
- Enforce the same owner check in the database copy function before inserting
  a recipe, protected reference, or media row, so bypassing the UI cannot copy.
- Preserve normal copy behavior for other viewers and the existing
  already-saved-copy flow.

## Data and failure boundaries

- The server route compares the account from the verified session with the
  source account before uploading photo bytes. The database copy function
  repeats the comparison against the destination account before any database
  copy side effect.
- The API route translates the expected result into a stable response that the
  UI can render. Do not rely only on hiding or disabling the client button.
- An own-recipe attempt creates no recipe, reference, or photo assets.
- Do not expose another account's identity or add a new public owner-data
  response.

## Acceptance criteria

1. Clicking Save on one's own active public recipe returns the approved
   message in the existing accessible feedback area and creates or uploads no
   recipe, reference, or photo assets.
2. A direct database-function call for an account's own active public recipe
   returns the distinct non-success result before inserting copy rows.
3. A different signed-in viewer can still save the public recipe and receives
   the existing success flow.
4. The already-saved-copy confirmation and trashed-copy replacement flows
   remain unchanged for other viewers.
5. Focused route, database, and UI tests cover owner rejection, zero side
   effects, normal copy, duplicate copy, and the exact message.

## Accepted decisions

- Use the exact message `You already have this recipe. Use "copy" if you wish
  a duplicate.`
- Do not include a link to the private recipe. The public source is already
  open, and resolving a separate private destination is outside this flow.
- Keep the existing Save control and feedback location; distinguish this
  expected rejection from network and save failures without exposing owner
  identity.

## Initial sizing

Medium difficulty; about **1–2 days**; low-to-medium churn. This is a narrow
server, database, and UI error-path change without a new data model.

## References

- [DLC 31: Save public recipe copies](./dlc-31-save-public-recipe-copies.md)
- [Public recipe copy route](../../../../src/app/api/public-recipes/[publicId]/copy/route.ts)
- [Public recipe save action](../../../../src/app/recipes/public-recipe-save-action.tsx)
- [Public-copy database function](../../../../supabase/migrations/20261222000000_dlc31_public_recipe_copies.sql)
