# Slice 14D: Tags and Assignment

Slice 14D adds an account-owned tag catalog and lets a person assign tags to
recipes and publications. Catalog changes and assignment saves are atomic,
version-aware, owner-scoped, and represented in forensic history.

## References

- [Delivery roadmap](../delivery-roadmap.md), Slice 14D
- [Comprehensive reference § 2.1](../comprehensive-reference.md#21-recipe-metadata)
- [Comprehensive reference § 6](../comprehensive-reference.md#6-publications-magazine-handling-and-the-recipe-tin)
- [Comprehensive reference § 8](../comprehensive-reference.md#8-settings-taxonomies-and-picklists)
- [Comprehensive reference § 12](../comprehensive-reference.md#12-change-history-and-forensic-audit)
- [Data model](../data-model.md), Core Entities and Relationship Rules
- [Visual design guide](../visual-design.md), Settings and recipe/publication detail
- [Decision log](../decision-log.md)
- [Slice 14C: Ingredient catalog management](14c-ingredient-catalog-management.md)

## Outcome

A signed-in account owner can create and manage tags in Settings or create and
reuse them inline while editing a recipe or publication. Selected tags remain a
draft until the entity is saved, and can be removed from that entity without
changing the shared catalog. Private detail views show the assigned tags with
their shared pastel colors. Merging or replacing a tag preserves every
affected assignment and records the change.

## Data and security contract

- Tags belong to one account. `tags`, `recipe_tags`, and `publication_tags`
  have row-level security; composite owner-aware foreign keys prevent assigning
  another account's tag to a recipe or publication.
- Tag names are trimmed but preserve the entered display casing. A unique
  account-scoped index on trimmed, case-folded names prevents duplicates.
  Names are limited to 160 characters. Each tag stores one key from the fixed
  16-color translucent pastel palette; color is a visual distinction, not a
  category or hierarchy. Tags have no user-defined ordering.
- Inline create/reuse trims and case-insensitively matches the account catalog.
  A newly created tag is persisted immediately with catalog revision and
  history, then selected in the entity form draft. If the form is abandoned,
  the tag remains in the catalog and can be removed from Settings.
- Recoloring a tag changes its shared catalog color for every assigned recipe
  and publication. Recolor is revision-checked and records before/after
  catalog history; entity assignment versions do not change for a visual-only
  catalog update.
- Tag IDs submitted for a recipe or publication are validated against the
  authenticated account. Assignments are saved in the same transaction as the
  entity, using the existing recipe/publication version checks. A rejected or
  stale save changes neither metadata nor assignments.
- Every catalog mutation and its catalog-history record commit together.
  History records the actor, action, affected recipe and publication IDs, and
  before/after catalog snapshots.
- Recipe and publication history snapshots include the assigned tag IDs,
  names, and color keys. A tag rename, merge, or replacement updates affected
  entity versions and creates the corresponding entity-history snapshots in
  the same transaction.
- Merge combines exactly two tags and requires an explicit `Keep as` choice.
  Changing the counterpart clears that choice. Duplicate assignments collapse
  to one link on the retained tag.
- Deleting an assigned tag requires a replacement; this is an atomic assignment
  transfer followed by removal. An unused tag can be deleted without a
  replacement. Replacing a tag already assigned to the same entity does not
  create a duplicate assignment.
- Tags remain private metadata. Public recipe payloads do not expose them.
  Cross-record query/search behavior remains in Slice 17.

## Screen and interaction contract

- Settings adds a full-width, unframed Tags section after Ingredient catalog.
  It is collapsed by default, uses a left-side disclosure chevron (right when
  closed, down when open), and follows the existing accessible-focus and
  section-spacing conventions. Ingredient catalog and Recipe picklists use
  the same left-side chevron treatment.
- The alphabetical tag list shows eight rows before scrolling. Search and add
  follow the Ingredient catalog pattern: the magnifying glass is at the search
  field's trailing edge, the clear `x` is outside the field, and an unmatched
  query offers italicized `add {tag}` text. Clicking it or pressing Enter adds
  the trimmed query; Escape cancels the pending add. Do not show a separate
  `+ Add tag` action.
- The tag list is alphabetical. Add, inline rename, pairwise merge, delete,
  and a 16-swatch pastel color picker are available; there is no manual sort or
  reorder control. Merge and Delete use the established accessible row panes;
  color editing uses the same pane pattern with swatches arranged 4 by 4.
  Recoloring is shared by all assignments. Use the Ingredient catalog's
  spacing treatment around search, list, and add affordances. Destructive
  replacement panes remain within the mobile viewport.
- Recipe and publication create/edit forms expose a labeled searchable
  multi-select. Suggestions reuse matching account tags or offer to create the
  typed name. Selected tags appear as removable chips; removing a chip changes
  only the form draft. Entity assignments are committed with the entity's
  explicit Save, while a newly created catalog tag is persisted immediately.
  The compact italic `add tag` affordance opens an approximately one-inch
  input that grows only enough to fit entered text and wraps on the same line
  as selected chips.
- Recipe and publication detail display selected tags as alphabetized text
  chips with translucent pastel fills and borders. Color is decorative, text
  remains readable, and the Tags display is omitted when there are no
  assignments. Recipe detail is the exception: its tag/action line remains for
  Print/Edit controls immediately after the chips, even with no assigned tags.
  The actions share the tag line, whose vertical margins match the action
  spacing. In
  recipe edit mode, a standard 48px icon-only `x` with a 24px icon in the
  heading returns to view; Delete is a separate text action below it. Chips
  are not interactive links.
- Controls support keyboard and touch input, expose selected state to assistive
  technology, provide visible focus and pending/error feedback, and do not
  introduce horizontal overflow on mobile.

## Test-first acceptance

- Settings browser tests cover add, trim, rename, case-insensitive duplicate
  rejection, alphabetical display, shared color changes, merge keep-choice
  behavior, required replacement for an assigned tag, deletion of an unused
  tag, and accessible error/success states. They also cover the eight-row scroll
  threshold, search icon and clear-control placement, click/Enter add behavior,
  Escape cancellation, viewport-safe Merge/Delete panes, and the 4-by-4 color
  pane.
- Recipe browser/API tests cover create and edit assignment, removing a tag,
  inline create/reuse, detail presentation, optimistic version conflicts, and
  before/after recipe history snapshots including tag colors. Browser checks
  cover the compact inline `add tag` affordance, its content-sized input, chip
  wrapping, tag-line Print/Edit placement, and the edit-header close `x` with
  Delete kept separate.
- Publication browser/API tests cover create and edit assignment, removing a
  inline create/reuse, detail presentation, optimistic version conflicts, and
  before/after publication history snapshots including tag colors.
- Database/API tests cover account isolation, invalid cross-account tag IDs,
  transactional merge/replacement, assignment de-duplication, revision
  conflicts, entity version increments, and catalog history.
- Settings and assignment workflows pass Chromium, Fold 6, and automated axe
  checks. Mobile checks verify no horizontal page overflow and that management
  panes remain within the visible viewport.

## Completion criteria

- Owners can manage tags and assign/remove them on both supported entity types.
- Catalog and assignment mutations are owner-scoped, transactional, and
  version-aware; tag IDs cannot cross account boundaries.
- Merge/replacement preserves assignments without duplicates and captures
  catalog plus affected entity history.
- Inline tag creation/reuse preserves the catalog's case-insensitive
  uniqueness; recoloring updates the shared catalog and records its history.
- Private detail views show tags accessibly; public payloads remain unchanged.
- The focused database/API, browser, and accessibility acceptance tests pass
  locally before the roadmap marks the slice complete.
