# DLC 36: Duplicate Recipes

**Status:** Implemented; app version 1.10.0.

## Source request

The Updates entry asks for a way to duplicate a recipe instead of exporting and
importing it, so the person can make a copy for editing.

## References

- [Delivery roadmap](../../delivery-roadmap.md), Mandatory Slice Preparation,
  Standing Rules, and Completion Rule
- [First-draft specification](../../first-draft-spec.md), Import, Export,
  Lifecycle, and History
- [Comprehensive reference](../../comprehensive-reference.md), §§ 2, 6, 9, 11,
  and 12
- [Data model](../../data-model.md), Ownership, Core Entities, and Relationship
  Rules
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide](../../visual-design.md), Recipe detail actions,
  App data: Export and Import, and Public Recipe View
- [Decision log](../../decision-log.md)
- [Slice 21: Import](../21-import.md) and
  [Slice 21B: Scoped imports](../21b-scoped-import.md)
- [DLC 31: Save public recipe copies](dlc-31-save-public-recipe-copies.md)
- [Portable bundle format](../../import-export-format.md)

## Outcome

A signed-in owner can make a new private recipe from an active recipe they own,
choose its destination publication, and open the copy in the editor.

## Recommended approach

Use a dedicated **Duplicate recipe** action and copy operation, not the ZIP
import workflow. The import flow is designed for untrusted archives, match
resolution, replacement choices, and upload cleanup. A person duplicating a
recipe already has a trusted source in their account and should not have to
export a ZIP, select it, review import conflicts, or confirm an import.

Reuse the import and public-copy paths' applicable graph-remapping,
destination-selection, private-media, transactional, and cleanup patterns.
Do not route through `ImportAction`, the ZIP upload/preview API, or
`save_public_recipe_copy`: that public-only operation always targets Recipe Tin
and intentionally excludes private recipe data. Extract shared graph-copy
logic only where it can be separated cleanly from archive-specific behavior.

The recipe detail page's existing action row is the entry point. The closest
workflow references are the recipe detail Edit action, the scoped import
destination selector, and the public-copy action's server-owned, private-media
copy path. The current detail action row is a good fit for a compact icon
action, but has no duplicate control. On desktop, order Page Settings before
Print & Download, followed by Export, Duplicate, and Edit; give Page Settings
the filled treatment of Print & Download and Duplicate the outlined treatment
of Edit. On mobile, put Page Settings in the former Duplicate slot before Edit,
and put Duplicate in the former Page Settings slot immediately to the right of
Heart on the second row. Swap their mobile treatments as well. Preserve the
established action spacing and mobile hit areas. Use a focused dialog for the
name and destination rather than importing the ZIP preview's conflict UI.

## Scope and dependencies

- Duplicate one active recipe from its detail page. Do not add multi-select,
  publication-wide copy, or public-guest duplication in this slice.
- Require the authenticated owner on the server and derive account ownership
  from that session; never accept an account ID or source graph from the client.
- Allow the person to edit the new name before copying. Default it to
  `{source name} (Copy)`.
- Let the person choose any active destination publication, including Recipe
  Tin. Preselect the source recipe's current active publication; if it is no
  longer active, preselect Recipe Tin.
- Create the new recipe as private regardless of whether the source is
  linkable. Give it new recipe, public-link, child-record, and media identities.
- Copy the source recipe's account-owned content and relationships, including
  ingredients and sets, measurements, instructions and mentions, times,
  equipment, tags, nutrition, pairings, references, photos, and user-entered
  recipe metadata. Reuse the same account's canonical catalog records rather
  than copying catalog definitions.
- Keep links to other recipes in the same account. If a relationship points
  back to the source recipe itself, point the duplicate's relationship to the
  new recipe. Do not copy the source's history, signed URLs, or storage paths.
- Copy media bytes into new private destination paths and retain display
  metadata and framing. A failed copy must leave no partial recipe graph or
  orphaned objects.
- On success, navigate to the new recipe's edit route. Cancel creates no data;
  failure stays on the source recipe and offers a retry.
- The source and duplicate have independent content, privacy, lifecycle, and
  history after creation. Editing or trashing one does not mutate the other.

## Public-source attribution and direct-save identity

The direct **Save to Recipe Tin** operation and a local duplicate have different
meanings and must not share one deduplication marker:

- Keep the existing protected external-URL reference as immutable attribution.
  A duplicate of a saved public recipe copies its display text, URL, and
  `source_public_id`. This remains a reference to the original public recipe,
  not an internal recipe-to-recipe link.
- Add a recipe-level `saved_from_public_id` marker containing the source's
  public ID only on a recipe created by the direct public Save action. It is
  not a recipe's own ID. A local duplicate gets a new recipe ID, copies the
  protected attribution, and leaves `saved_from_public_id` null.
- Public Save checks this marker, not the protected reference. An active marked
  recipe is the one direct saved copy to open; a duplicate's attribution does
  not block a later direct Save. A trashed marked recipe does not block a new
  direct save. Preserve the existing concurrent-save protection for direct
  saves.
- Replace the current broad protected-reference uniqueness guard with
  active uniqueness for `saved_from_public_id` per destination account. Retain
  the guard for restoring a trashed marked recipe when another active marked
  copy now exists. Protected attribution itself may appear on multiple recipes
  in the same account.
- Backfill the marker for existing direct public copies before relaxing the
  reference guard. Preserve the marker through ordinary edits and faithful
  database export/import. Explicitly creating a duplicate clears it while
  retaining protected attribution.
- Extend the portable bundle format beyond v11 to preserve the marker.
  Older bundles import with a null marker. Define and test collision behavior
  when importing a marked recipe into an account that already has an active
  marked recipe from the same public source; do not silently create ambiguous
  direct-save identity.

## Data, security, and failure boundaries

- Read the complete source graph on the server after checking that it belongs
  to the signed-in account and is active. Recheck source identity/version at
  commit so a concurrent edit or trash cannot produce a partial or stale copy.
- Allocate destination-owned IDs for the recipe and all recipe-owned records;
  preserve references to the account's existing catalog and non-source recipe
  records. Keep the new recipe private at the database boundary.
- Stage/copy media into destination-owned private paths before the atomic
  database commit. Verify every expected object and metadata record; remove or
  queue staged objects if any step fails.
- Record one normal creation-history event for the new recipe. Never duplicate
  the source's history or claim that its prior edits occurred on the duplicate.
- Enforce account ownership and direct-save marker uniqueness in database
  functions/constraints, not only in UI state. Test cross-account attempts,
  duplicate submissions, concurrent direct saves, storage failures, stale
  sources, and rollback/cleanup.

## Interaction and accessibility

- Place a compact **Duplicate recipe** action beside existing recipe-detail
  actions, with an accessible name, tooltip, visible focus, and the established
  mobile hit area.
- The dialog contains a required editable name and a destination selector.
  Use the bold labels **Name** and **Publication**, stack each above its
  control, and give each field a distinct bordered area with clear spacing.
  Cancel closes without writes and restores focus to the trigger.
- Keep the square copy-icon action immediately left of Edit on desktop. Put
  Page Settings before Print & Download and use its filled treatment; use the
  outlined Edit treatment for Duplicate. At 640px and below, swap Page
  Settings into the first-row Duplicate slot before Edit and move Duplicate
  into the second-row Page Settings slot immediately after Heart, swapping
  their treatments too.
- Keep controls keyboard-operable with visible focus and announce progress,
  success, validation errors, and recoverable failures. Prevent duplicate
  submissions while the copy is running.
- In the mobile toolbar, keep the privacy switch 72px wide in both states;
  show `Private` or the two-line `Can` / `Link` label without resizing on
  activation.
- Test the detail action and dialog at desktop and mobile widths, including
  long recipe/publication names, keyboard cancellation, focus return, and
  non-overflow. Assert field label/control geometry and treatments, the copy
  button's placement before Edit, and at mobile widths assert Page Settings
  precedes Edit, Duplicate is to the right of Heart, and the first row does not
  overflow.

## Acceptance criteria

1. An owner can duplicate an active recipe from its detail page; a guest or
   another account cannot invoke the operation for it.
2. The dialog starts with `{source name} (Copy)` and the source's active
   publication selected, allows changing both, and creates nothing when
   canceled.
3. Confirming creates a new recipe and opens its editor. The source remains
   unchanged, and the new recipe starts private with distinct identities.
4. The duplicate contains the full agreed recipe graph and user-entered
   metadata, reuses same-account catalogs, preserves valid links to other
   recipes, and remaps self-links to the duplicate.
5. Recipe photos are private, separately stored objects. Copy success has no
   references to source storage paths or signed URLs.
6. A duplicate of a directly saved public recipe keeps its protected external
   attribution but has a null `saved_from_public_id`; the direct saved recipe
   retains its marker through edits and faithful export/import.
7. Direct public Save finds only an active `saved_from_public_id` match.
   Duplicates do not become save matches, a trashed marked recipe permits a
   fresh direct save, and concurrent direct Save requests cannot create two
   active marked copies.
8. Marker backfill, active uniqueness, restore behavior, legacy bundle
   compatibility, and marker collision behavior pass isolated database and
   import tests.
9. A source change/trash, validation error, authorization failure, database
   error, or media-copy failure leaves no partial graph or orphaned media and
   gives the owner a recoverable error.
10. Keyboard, visible focus, labels, accessible status, cancellation focus
    return, responsive layout, and Axe checks pass on the focused flow.
11. Desktop geometry places Page Settings before Print & Download and
    Duplicate immediately before Edit. At mobile widths, Page Settings fits
    before Edit on the first row, Duplicate sits immediately to the right of
    Heart on the second row, and the page has no horizontal overflow at
    representative widths including 390px and 314px.

## Behavior and implementation record

- The initial action is available on recipe detail only; list and bulk actions
  are out of scope.
- The final mobile swap puts Page Settings in the former Duplicate slot and
  Duplicate beside Heart; their filled and outlined treatments swap too.
- The destination defaults to the current active publication, and the name
  default remains editable even when the copy stays in the same publication.
- The public-save marker is `saved_from_public_id`, storing the source's public
  ID only on direct Save copies. Explicit copies retain the protected reference
  but not the marker.
- Faithful database export/import preserves the marker; choosing Duplicate for
  an import conflict clears it while retaining protected attribution. An
  active marker collision is rejected.
- The authenticated endpoint stages fresh private photo objects and commits
  the graph atomically. The database migration backfills only unambiguous
  protected source IDs and enforces active direct-save uniqueness.
- The comprehensive reference, data model, visual guide, decision log,
  schema-v12 import/export contract, roadmaps, focused tests, and app version
  metadata record the implemented behavior.
