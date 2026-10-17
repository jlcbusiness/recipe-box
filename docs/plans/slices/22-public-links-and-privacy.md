# Slice 22: Public Links and Privacy

**Status:** Complete.

## References

- [First-draft specification](../first-draft-spec.md), Recipe Privacy and Share Links
- [Comprehensive reference](../comprehensive-reference.md), §§ 2, 5, 9, 11
- [Data model](../data-model.md), Ownership, Core Entities, and Relationship Rules
- [Design philosophy](../design-philosophy.md)
- [Visual design guide](../visual-design.md), Recipe Detail and Responsive Layout
- [Decision log](../decision-log.md), public-link and guest-reference decisions
- [Slice 13: Scaling and unit conversion](13-scaling-and-unit-conversion.md)
- [Slice 16: Cooking views](16-cooking-views.md)
- [Slice 12: Images](12-images.md)
- [Portable bundle format](../import-export-format.md)
- Installed Next.js 16 Pages Router request-rendering documentation

## Outcome

An owner can copy a stable recipe link and switch the recipe between linkable
and private. A guest can read and cook a linkable active recipe without an
account, while private and trashed recipes remain indistinguishable (404) and
permanently purged links return 410.

## Public data contract

The guest page uses an explicit server-side projection, never the private
`RecipeRecord` or a serialized full database row. It may include the recipe
title, servings, timings, equipment, ingredients and measurements, instructions,
static publication attribution, and approved relationship display data. It
must not include verdict, enthusiasm, occasion details, reason, notes, gotchas,
tags, history, owner identity, account preferences, or private media metadata.

Per the owner-approved boundary, external HTTP(S) reference URLs remain usable
links. In-app recipe References and Pairs With entries show their saved display
names as plain text only; do not include target IDs, route links, target recipe
content, or incoming relationship data. Validate external link schemes before
rendering. Publication attribution is static text, never an owner-only route.

The public-link ID is a stable, opaque, cryptographically random identifier,
unique independently of recipe UUIDs. Backfill IDs for existing recipes. New
recipes receive an ID on creation; imports never copy an ID. Privacy changes do
not rotate it. Enforce uniqueness in Postgres and prove collisions cannot bind
a link to another recipe.

## Request, lifecycle, and storage boundaries

Render `/r/{publicId}` per request through the Pages Router so the page response
can set the required status directly. Set `Cache-Control: no-store` on public,
unavailable, and gone responses so privacy and lifecycle changes are observed
on the next request. Do not add a separate public recipe JSON response. Invalid,
unknown, private, and trashed IDs render the same calm unavailable page with
HTTP 404 and no recipe-specific details. A tombstoned ID returns HTTP 410 with
a generic gone page and no recipe data.

Keep recipe and tombstone records inaccessible to `anon`; do not add public
RLS policies. A server-only loader may use the existing service-role client,
but queries only the fields needed to establish lifecycle and build the
allow-listed projection. Generate photo URLs only after confirming the ID maps
to a non-private, active recipe. Keep the bucket private, sign only recipe
photos (never publication covers), and retain the existing 15-minute expiry.

Insert a minimal tombstone containing only the public ID when an individual
recipe is purged, when an expired recipe is purged, and when a trashed
publication purge deletes its recipes. Tombstone creation and recipe deletion
must be in the same transaction. Tombstones are retained so repeated requests
continue to return 410; they contain no account or recipe content. Trashing
alone does not create a tombstone. Restore keeps the same public ID.

## Guest and owner experience

The guest page has no private navigation, account actions, edit/delete/clone
controls, or links into the owner's library. Open in Ingredient-first view;
reuse the established transient scaling, unit switching, and print behavior
without persisting guest choices. Keep controls keyboard-operable and labeled,
retain visible focus, and ensure print output uses the active scaled and unit
presentation. External URLs are the only clickable references; in-app recipe
names remain non-interactive.

The public page uses 24px horizontal gutters. Keep the recipe title and Print
button on one row; when Serves is set, show it inline after the title as
lowercase `- serves n`, separated from the title by a space, in regular 16px
text. Cap public photos at 420px wide
and `min(280px, 60vh)` high. On wide screens, place the photo gallery beside a
summary containing Times and Equipment; on narrow screens, stack the summary
below the photos. Do not repeat Serves in that summary.

The owner can copy the stable link and toggle Private/Linkable from the recipe
workflow. Make sharing discoverable with a recognizable copy/share icon button,
including an accessible name and tooltip. The toggle is owner-authorized,
version-checked, and recorded in recipe history. Existing recipes default to
linkable as defined by the schema; private recipes must stop rendering their
page and photos on the next request.

## Test-first acceptance

- Unit tests prove the public projection includes only approved fields and
  never leaks personal fields, IDs, linked-target content, or owner data; cover
  safe external URL schemes, text-only in-app relationships, and media gating.
- Isolated database/API tests prove unique random IDs and existing-row
  backfill, default-linkable behavior, owner-only privacy changes, stale-version
  rejection and history, import ID regeneration/preservation rules, no anon
  table access, and tombstone insertion for every purge path. Re-running purge
  is safe, restore retains the ID, and tombstones retain no recipe content.
- HTTP tests assert 200 for active/linkable, identical generic 404 behavior for
  unknown/private/trashed, 410 for tombstoned IDs, `Cache-Control: no-store`
  on every result, and no photo signing for unavailable recipes.
- Chromium and Fold 6 tests cover owner copy/toggle behavior, guest cooking
  controls, serving scaling, unit switching, print content, safe references,
  title/Print alignment, inline serving-label typography, page gutters, capped
  photo sizing, responsive photo/summary placement, no private navigation or
  actions, privacy changes taking effect on reload, unavailable/gone states,
  and Axe checks.
- Do not reset or stop the active local Supabase stack. Use a uniquely named,
  isolated temporary Supabase project for destructive migration and purge
  acceptance. Do not run `npm run dev:local`.

## Completion criteria

All privacy, lifecycle, field-projection, media, and guest interaction tests pass
before the implementation is considered complete. Run focused unit and isolated
database/API tests, then Chromium and Fold 6, followed by typecheck, Biome,
Markdown lint, and `git diff --check`. Update the roadmap and product references
only to match behavior verified by the implementation.
