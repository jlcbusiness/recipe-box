# Slice 14C: Ingredient Catalog Management

This slice delivers account-scoped catalog management for canonical
ingredients. It defines the searchable, alphabetized Settings workflow and the
transactional behavior that preserves recipe rows and their instruction links.

## References

- [Delivery roadmap](../delivery-roadmap.md), Slice 14C
- [Comprehensive reference § 8.1](../comprehensive-reference.md#81-centralized-picklist-management)
- [Data model](../data-model.md), Core Entities and Configuration Boundaries
- [Visual design guide](../visual-design.md#settings-slice-14c), Settings
- [Decision log](../decision-log.md)
- [Slice 7: Instructions and mentions](7-instructions-and-mentions.md)
- [Slice 14B: Recipe picklist values](14b-recipe-picklist-values.md)

## Outcome

A signed-in account owner can add, rename, search, merge, and delete canonical
ingredients in Settings. Names are normalized and unique within the account;
the visible catalog is always alphabetical and has no manual sort or reorder
control. A merge explicitly asks which of the two names to retain.

## Screen and interaction contract

- Settings places the full-width, unframed Ingredient catalog section after
  Recipe picklists. Both sections are collapsed by default. Their disclosure
  chevrons point right while collapsed and down while expanded; only the label
  text is underlined, on hover or focus and persistently on touch devices.
- The catalog list is displayed alphabetically, independent of the order in
  which entries were added. No sort or reorder control is shown.
- A left-aligned search field filters the list as the person types. Search is
  case-insensitive, and a query ending in whitespace matches a whole word. The
  search remains in place after an action until cleared with the adjacent clear
  button.
- The Add ingredient affordance remains available while searching. If a
  non-empty search has no matches, it becomes an Add action for the searched
  text; trailing whitespace is removed before submission.
- With matching rows or no search, a labeled Add ingredient text field is
  paired with a compact icon-only submit button rather than a duplicate text
  button. Successful catalog changes announce a right-aligned status.
- Add and rename trim surrounding whitespace and normalize the stored name to
  title case. Names that differ only by surrounding whitespace or letter case
  are duplicates within one account.
- Activating an ingredient name begins inline rename. Enter saves; Escape
  cancels. Merge and Delete remain available as labeled, accessible row
  actions.
- Merge chooses a counterpart, then presents two mutually exclusive `Keep as`
  buttons. Choosing or changing the counterpart clears the keep choice. Both
  keep choices are disabled until a counterpart is selected, and Merge remains
  disabled until a keep choice is made. The selected ingredient or its
  counterpart may survive; the second button is labeled `ingredient` before a
  counterpart is selected.
- Deleting an ingredient used by recipe rows requires choosing a replacement.
  An unused ingredient can be deleted without one.
- Merge and Delete use compact panes that remain within the mobile viewport and
  appear above or below the affected row, whichever has more room. The Merge
  pane uses the same warm autumn-orange treatment and keep-choice controls as
  the recipe picklist Merge pane.

## Data and security contract

- Management derives the account from `auth.uid()`; callers cannot supply an
  account ID. Read and write operations remain scoped to that account.
- A catalog revision protects mutations from stale writes. Every successful
  catalog mutation advances the revision; a conflict does not partially apply
  changes.
- Ingredient names are trimmed and normalized to title case in the database.
  A per-account unique index on trimmed, case-folded names prevents duplicate
  canonical entries.
- Each mutation and its catalog history record commit transactionally. History
  records the action, actor, ingredient and replacement IDs, affected recipes,
  and before/after catalog snapshots.
- A merge moves recipe rows from the absorbed ingredient to the retained one,
  then removes the absorbed catalog entry. It does not coalesce duplicate rows:
  recipe ingredient row IDs, measurements, Main flags, specifics, preparation,
  and instruction mentions remain attached to their existing rows.
- Affected recipes receive version and history updates. Ingredient mentions
  continue to point to the same recipe ingredient rows; merging names does not
  rewrite or discard those links.
- Deletion of a referenced ingredient and reassignment to its replacement are
  atomic. Deleting an unused ingredient has no recipe references to rewrite.

## Test-first acceptance

- Browser tests cover alphabetical display, live search, whole-word matching
  for a trailing-space query, search retention and clearing, add and rename
  normalization, and the absence of manual sort or reorder controls.
- Merge tests cover both keep choices, mutually exclusive selection, clearing
  the keep choice when the counterpart changes, the disabled states, and the
  selected survivor.
- Database/API tests cover account isolation, normalized-name uniqueness,
  revision handling, catalog history, and replacement requirements for
  referenced ingredients.
- Recipe-row tests verify that merges preserve repeated rows, measurements,
  Main flags, specifics, preparation, instruction mentions, and recipe history.
- Settings browser and accessibility tests run on Chromium and Fold 6. Mobile
  tests verify that Merge and Delete panes appear above or below their row
  within the available viewport.

## Completion criteria

- Catalog management is owner-scoped, searchable, normalized, and always
  alphabetized in Settings.
- A merge requires a deliberate keep choice and preserves recipe-row identity
  and its associated measurements and instruction links.
- Replacement requirements, optimistic revisions, catalog history, and
  owner isolation are covered by automated tests.
- Desktop and mobile interactions remain keyboard- and touch-accessible, and
  the mobile management panes remain viewport-bounded.