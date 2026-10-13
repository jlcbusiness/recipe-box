# Slice 14B: Recipe Picklist Values

This slice makes the eight recipe-value catalogs configurable from Settings.
It preserves recipe assignments, measurement references, category ordering,
owner isolation, and the protected meaning of `Specific occasion`.

## References

- [Delivery roadmap](../delivery-roadmap.md), Slice 14B
- [First-draft specification](../first-draft-spec.md), Recipes and Ingredients
- [Comprehensive reference](../comprehensive-reference.md#81-centralized-picklist-management)
- [Data model](../data-model.md), Configuration Boundaries
- [Visual design guide](../visual-design.md), Design Philosophy, Controls and state, and Settings
- [Decision log](../decision-log.md)
- Installed Next.js 16 documentation: Server Actions, Forms, Vitest, and Playwright

## Outcome

A signed-in person can add, rename, reorder, delete, and merge values in Food
Type, Meal Type, Cuisine, Equipment, Verdict, Enthusiasm, Informal Unit, and
Unmeasured Phrase catalogs. Operations are account-scoped, version-checked,
transactional, and recorded in picklist history. Referenced values are
reassigned or explicitly cleared according to their field semantics.

## Screen and interaction contract

- Settings adds one full-width, unframed `Recipe picklists` section below
  Personal preferences. The section is collapsed by default behind an
  `Edit picklists` button. Expanding it reveals one labeled category Picklist
  and one ordered list, not a dashboard of catalog cards.
- The ordered list follows the ingredient/instruction editing vocabulary:
  compact rows, a small drag grip, visible order, keyboard reorder with
  `Ctrl+ArrowUp` / `Ctrl+ArrowDown`, and a trailing category-labeled add input.
- Activating a value name starts inline rename. Enter saves; Escape, an outside
  click, or browser Back cancels. Merge and Delete icon actions appear on row
  hover or keyboard focus and remain visible on touch devices.
- Merge and Delete actions open a focused pane for that value. The panes close
  with their close button, Escape, or an outside click. Protected values cannot
  be merged or deleted.
- Merge combines exactly two values. The row action chooses the source and a
  labeled single-select Picklist chooses its counterpart. `Keep as` offers one
  button for each value. After choosing or changing the counterpart, both
  choices are unselected and Merge remains disabled until the user explicitly
  chooses which value to keep. Protected values cannot be selected as the
  counterpart.
- Reordering, adding, renaming, merging, and deletion commit immediately after
  their explicit interaction; each operation has one pending/error status and
  restores the last server state on failure. A category revision prevents
  stale writes from silently replacing newer edits.
- Renaming trims outer whitespace and rejects empty or case-folded duplicates.
  `Specific occasion` in Verdict and Enthusiasm can be renamed and reordered,
  but cannot be deleted or merged.
- Delete of an unused value needs one confirmation. For a used value, the pane
  shows affected recipe/measurement counts and explains the consequence.
  Single-select nullable fields may be explicitly cleared in the confirmation;
  multi-select values may be removed from affected recipes. Informal Unit and
  Unmeasured Phrase references require a replacement because their measurement
  records require a value. Choosing a replacement rewrites assignments in the
  same transaction; this is the purpose of replacement, not an alternative to
  ordinary reordering.
- Mobile uses the same ordered list. Merge and Delete panes are compact,
  viewport-bounded overlays positioned above or below their selected row,
  whichever has more room; they are not full-screen sheets. Dragging and
  keyboard alternatives remain available, and the page does not scroll
  horizontally.
- Keep the existing account Units controls unchanged. No empty future Settings
  domains or ingredient-catalog controls appear in this slice.

## Data and security contract

- Derive the account only from `auth.uid()` in granted database functions; no
  client-supplied account ID is accepted.
- Authenticated clients retain read-only table access to picklist values.
  Management reads and writes use owner-derived functions; anonymous users
  cannot execute them.
- Each catalog has an optimistic revision. A successful mutation increments
  it; a stale expected revision returns a conflict without partial writes.
- Store trimmed values and enforce per-account, per-category uniqueness using
  case-folded trimmed text.
- Keep merge/delete assignment rewrites, recipe version updates, ordering,
  and picklist history in one transaction. Preserve recipe-row measurements,
  current selections, and optional-field semantics.
- Never clear a required Informal Unit or Unmeasured Phrase measurement.
- Record actor, category, action, before/after values, and affected records in
  append-only owner-scoped history.

## Test-first acceptance

- Unit tests validate action payloads, authentication, RPC parameters, stale
  revisions, and surfaced validation errors.
- Browser tests cover Settings navigation, category selection, labeled add and
  inline rename/cancel, stable ordering after reload, drag/keyboard reorder,
  protected value behavior, explicit merge keep selection, delete replacement,
  optional clearing, pane dismissal and mobile placement, error recovery, and
  axe/accessibility behavior on Chromium and Fold 6.
- Database tests prove owner isolation, case-folded uniqueness, required
  measurement references, protected-value rules, atomic rewrite behavior,
  recipe version/history updates, and stale revision rollback.
- Run focused 14B tests, the relevant unit tests, typecheck, lint, and
  `git diff --check`. Apply pending migrations without resetting local data.

## Completion criteria

- All eight recipe catalogs support the scoped management operations and
  persisted order from Settings.
- Assignment and measurement behavior matches the data contract for rename,
  merge, delete, and clearing.
- Protected values, optimistic conflicts, append-only history, and account
  isolation are verified by automated tests.
- Desktop and Fold 6 interactions are keyboard/touch accessible, require an
  explicit merge keep choice, and remain within the existing Settings visual
  language.
