# DLC 03: Ingredient sets

This slice lets a recipe group its ingredient rows into named parts, such as
“For the sauce” and “For the filling.” The visible reader treatment is only a
thin divider with its label interrupting the rule; it is not a card or nested
panel. Ingredient set identity is the foundation for DLC 04 and DLC 05.

## Outcome and scope

- Create, rename, order, and remove recipe-owned ingredient sets.
- Assign each ingredient row to exactly one set and move it without changing
  its stable row ID, measurements, or structured instruction mentions.
- Show non-empty sets in set order in edit, Standard, Ingredient-first, public,
  print, and offline recipe views.
- Keep scaling, unit conversion, cooking check-off, and ingredient sorting
  functional within each set.
- Carry sets through recipe save, optimistic concurrency, history, Trash and
  restore, public projection, and scoped/database export and import.

Later set-aware amounts and instruction references belong to DLC 04 and DLC 05.
This slice does not link sets to instruction sections, add set-level quantities,
or introduce set catalogs in Settings.

## Data and lifecycle contract

- Every recipe has at least one set. Existing recipes migrate into one set named
  `Main`; new recipes start with the same default. The migration includes
  trashed recipes so restore remains complete.
- A set has a stable UUID, owning recipe/account, trimmed required label, and
  contiguous zero-based position. Labels are at most 80 characters and unique
  within a recipe after trimming and case-folding.
- Ingredient rows keep their existing stable IDs and receive one set ID. The
  composite foreign keys and row-level security enforce matching account and
  recipe ownership. Set deletion is restricted while rows still reference it.
- Empty sets persist and may be renamed, reordered, or removed. A populated set
  must first be emptied by explicit row moves; the last set cannot be removed.
- Set order is stable and independent of ingredient order. The active reader
  sort applies within each set only; it never merges or moves rows across sets.
  Manual row reorder remains persistent within a set.
- Recipe save remains explicit, atomic, and version-checked. A failed save
  keeps the editor draft. Existing ingredient-row IDs and mention targets do
  not change when a row moves between sets.
- History snapshots capture set IDs, labels, ordering, and row membership.
  Trash retains the complete graph, restore recovers it, and permanent purge
  removes it with the recipe.
- Export advances to schema version 2 and includes set records in database,
  publication, and recipe scopes. Import continues accepting version 1 bundles
  by assigning their ingredient rows to a synthesized `Main` set. Version 2
  import validates ownership, membership, IDs, labels, and order before commit.
- Public payloads expose only the set labels and ingredient rows needed to read
  the recipe; no additional private recipe fields are added. Offline snapshots
  use the same rendered grouping and remain read-only.

## Interaction and presentation

- The recipe editor shows each set as a compact labeled rule, with inline
  rename, move-set controls, and remove only when empty. `Add set` creates the
  next ordered set. Ingredient assignment is an explicitly labeled compact
  control; set membership is not inferred from visual row order.
- Set and ingredient order changes are staged with the recipe draft and commit
  only on Save. Closing, navigating away, or canceling discards them. Removing
  a populated set is unavailable until its rows have been moved; no row is
  silently reassigned.
- In readers, one non-empty set renders exactly as the current ingredient list
  with no extra label. Multiple non-empty sets render in order with a thin
  horizontal rule and the label on the rule. Empty sets do not appear.
- Standard and Ingredient-first keep their existing row formats inside each
  group. Sort and direction controls, scaling, unit overrides, and cook-mode
  check-off retain their current behavior within the group. Print removes
  controls but keeps set dividers and labels. Public view uses the same group
  order and does not expose private recipe fields.
- On desktop, the reader keeps a stable 46% Ingredients track regardless of
  which row fields are populated; the Ingredient-first table fills that track.
  At 760px and below, Ingredients stacks above Instructions and the table fills
  its section width.
- Divider labels are semantic headings associated with their ingredient
  group. Keyboard focus remains on the edited control after rename, move, or
  reorder; every action has a visible focus state and accessible name. Controls
  remain usable by pointer and touch without horizontal page overflow.
- Loading uses the existing server-rendered recipe path. Validation and save
  failures are announced in the existing form error region without clearing
  the draft. A one-set recipe remains a valid empty state if it has no rows.

## Automated acceptance

- Unit tests cover default-set construction, label normalization and limits,
  duplicate labels, contiguous positions, cross-set row moves with stable row
  IDs, and within-set sorting. Browser tests cover empty/last-set removal rules,
  title-edit Escape and navigation cancellation, and duplicate-label validation
  retaining the draft.
- The isolated migration test (`npm run test:migration:public-links`) creates
  active and trashed legacy recipes with ingredient rows before applying the
  ingredient-set migration. It verifies deterministic `Main` backfill and row
  membership, owner isolation, database label/position constraints, and that a
  stale versioned save rolls back both set and recipe changes. Browser tests
  cover history snapshots and Trash/restore of grouped recipes; permanent purge
  removes both set rows and recipe history.
- Import/export tests cover database/publication/recipe scope, version 1
  compatibility, version 2 round-trip, invalid set references, and no partial
  writes on rejected bundles.
- Browser tests cover create, rename, reorder, move rows, remove only empty
  sets, explicit save/cancel/failure, and stable instruction mentions. They
  cover desktop and mobile editor behavior, Standard and Ingredient-first
  readers, public view, print, offline snapshots, keyboard operation, visible
  focus, labels, contrast, and axe checks.
- Responsive checks exercise the editor and reader immediately around the
  actual layout reflow widths, plus an intermediate width where labels wrap.
  Reader geometry checks verify the Ingredients track is content-independent,
  the Ingredient-first table fills its section, and Instructions follows
  Ingredients on mobile. Use automated geometry assertions; manual checks are
  limited to visual inspection of the running app at representative desktop
  and mobile sizes.

## References

- [Comprehensive reference, § 3](../../comprehensive-reference.md#3-ingredient-rows-measurements-and-density)
- [Comprehensive reference, § 4](../../comprehensive-reference.md#4-ingredient-presentation-and-sorting)
- [Comprehensive reference, § 5](../../comprehensive-reference.md#5-instructions-autocomplete-and-recipe-linking)
- [Comprehensive reference, § 9](../../comprehensive-reference.md#9-sharing-privacy-urls-and-image-delivery)
- [Comprehensive reference, § 11](../../comprehensive-reference.md#11-import-export-and-backup-bundles)
- [Comprehensive reference, § 12](../../comprehensive-reference.md#12-change-history-and-forensic-audit)
- [Data model](../../data-model.md)
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide, Ingredient Presentation](../../visual-design.md#ingredient-presentation)
- [DLC brainstorm](../../discussion/dlc.md)
- [DLC 04: Ingredient amount semantics and references](dlc-04-ingredient-amounts-and-references.md)
- [DLC 05: Instruction authoring and references](dlc-05-instruction-authoring-and-references.md)
