# Slice 5: Ingredient Rows

This brief defines the canonical ingredients and ordered recipe rows needed by
Slice 5. Measurements and instruction mentions remain separate slices. The
product authority is [the comprehensive reference](../comprehensive-reference.md),
with related boundaries in [the data model](../data-model.md),
[the delivery roadmap](../delivery-roadmap.md), and
[the visual design guide](../visual-design.md).

## Outcome

A recipe owner can add canonical ingredients and ordered rows containing Main,
Detail, and Preparation. Rows can be created and reordered by keyboard; pointer
dragging is an additional shortcut. Saving a new or edited recipe persists the
recipe and rows together, and opening the edit page restores the rows in their
saved order.

## Scope

Included:

- Account-owned canonical ingredient names, searchable from the recipe editor.
- Inline creation of a canonical ingredient when a user enters a new name.
- Ordered recipe-ingredient rows with Main, Detail, and Preparation.
- Add, remove, and persistent reorder operations.
- Recipe detail display of saved ingredient names and row properties.
- One recipe version increment and one append-only history event per explicit
  save, including ingredient snapshots.
- Owner isolation, optimistic version conflict handling, visible focus, and
  keyboard-only workflows.

Excluded:

- Quantities, units, measurement types, density, scaling, and unit conversion
  (Slice 6).
- Instruction steps, structured ingredient mentions, and mention-driven sorting
  (Slice 7).
- Ingredient settings management, renaming, merging, deletion, and aliases
  (Slice 14).
- Temporary display sorting, public recipes, printing, and cooking controls.

## Data and save contract

Add `public.ingredients` with a UUID primary key, owning account, nonblank
trimmed name, and creation timestamp. Canonical names are unique per account
without regard to surrounding whitespace or letter case. Inline creation uses
that uniqueness rule to reuse an existing ingredient instead of creating a
duplicate.

Add `public.recipe_ingredients` with a UUID primary key, account and recipe
ownership, canonical ingredient reference, zero-based persistent position,
Main boolean, Detail text, and Preparation text. Enforce one row per position
within a recipe, nonnegative positions, and composite foreign keys that keep
the account, recipe, and ingredient ownership aligned. A recipe may contain the
same canonical ingredient more than once.

Extend the existing versioned `public.save_recipe` RPC with a JSON ingredient
row payload. A row identifies either an existing ingredient ID or a new
trimmed name, plus Main, Detail, and Preparation. Resolve new names inside the
transaction. Replacing, adding, removing, or reordering rows is part of the same
RPC transaction as the parent recipe and picklist assignments. Stale versions,
invalid rows, and cross-account ingredient IDs must reject the entire save.

Every new table uses row-level security. Owners can read their own ingredients
and recipe rows. Writes are permitted only through the authenticated recipe
save path, using the existing transaction-local save context; direct REST
writes remain unavailable. The RPC remains `SECURITY INVOKER`, checks
`auth.uid()`, and retains the existing recipe version and ownership checks.

History remains one event per recipe save. Its before/after JSON snapshots
include the ordered ingredient rows and canonical names as well as recipe
metadata. A failed save creates no history event and changes neither parent nor
child data.

## Interface and states

Use a text-first semantic table on desktop. Ingredient, Detail, and Preparation
cells display their values until activated; editing opens a compact control in
that cell. The table always has exactly one trailing empty row, which becomes a
populated row when an ingredient is submitted. Do not add a separate Add
Ingredient action or generic per-row controls. The only row action is a compact
delete `x` on populated rows: reveal it on desktop row hover or keyboard focus,
and provide a 48px touch target on mobile.

Place Main checkboxes in a narrow rail outside the table, beside a 12px drag
handle. Keep the checkbox at normal browser size. Dragging the handle changes
the persistent row order; keyboard users use Ctrl+ArrowUp and Ctrl+ArrowDown on
a focused row. Ingredient picklists open above and align to the left edge of
the active cell. Activating a picklist shows its full existing option list;
typing filters the list and offers an add-new option when there is no exact
match. For Ingredient and Preparation, Enter selects the active suggestion
without committing the field; Enter again commits it. Tab accepts a typed or
keyboard-selected suggestion and commits the field. Ingredient Tab advances to
Detail in the same row; Preparation Tab advances to Ingredient in the next row.
Clicking a suggestion fills the editor; leaving the field commits it. Enter
commits a Detail text edit directly. Clearing Ingredient and leaving the field
removes that row because an ingredient row cannot be nameless. Preparation is a
single-value picklist seeded with common and account-used values; users can add
a value by typing it.

On mobile, show a one-column ingredient list with a normal Main checkbox and
a pale 24px drag grip. Tapping a row opens a compact popover for Ingredient,
Detail, and Preparation. Activating Ingredient or Preparation shows its full
existing option list; typing filters options and exposes add-new suggestions.
Menus support touch, mouse, and keyboard selection, align to their field, and
stay inside the viewport, opening below where space permits or above when
needed. Submit uses a compact 32px visual control with a 48px hit area. Do not
show a horizontal ingredient table on mobile.

Save errors remain visible without discarding the current draft. An empty
ingredient list is valid.

On recipe detail, display rows in saved order with Ingredient, Detail, and
Preparation. Main is an edit-only classification and is not shown as a
read-only checkbox. Do not expose edit controls or measurement content in view
mode.

## Acceptance tests

Write these tests before production code:

- Unit tests cover row serialization, trimmed-name validation, empty lists,
  and deterministic move-up/move-down ordering.
- End-to-end tests create a recipe with existing and newly entered ingredients,
  save it, verify recipe-style detail rendering, reopen edit mode, and verify
  all fields and order persist.
- Desktop tests verify the trailing blank row, value-first cells, full
  picklists on activation, typed and addable suggestions, normal Main
  checkboxes, a 12px drag handle, and Ctrl+ArrowUp / Ctrl+ArrowDown reorder
  behavior. They also verify the delete control is hidden until hover or focus,
  removes the selected row, and preserves the trailing blank row. Keyboard
  tests verify Enter selects a picklist option before a second Enter commits,
  Ingredient Tab accepts and moves to same-row Detail, Preparation Tab accepts
  and moves to the next row, and Detail Enter commits immediately.
- Mobile tests verify the one-column list, full picklists on activation,
  typed and addable Ingredient and Preparation suggestions, viewport-contained
  options, a 24px grip, compact row popover,
  Submit behavior, a visible delete touch target, row removal, and no horizontal
  page overflow.
- Pointer tests verify dragging the handle changes the persistent row order.
- Database/API tests prove same-account name reuse, cross-account read
  isolation, cross-account ingredient ID rejection, and direct write denial.
- A stale-version save that also changes ingredient rows leaves recipe
  metadata, rows, and history unchanged.
- History tests assert one creation/update event per successful save and verify
  the before/after ordered row snapshots.
- Automated accessibility checks cover the ingredient editor, labels, focus,
  keyboard operation, live announcements, and mobile layout.

## Verification

Run the focused unit tests and Slice 5 end-to-end/accessibility tests against the
existing local Supabase stack without resetting or replacing it. Then run
TypeScript typecheck, Biome, and the full relevant recipe test suite. Do not
run `npm run dev:local`; it resets the database.

## Completion criteria

- Owners can add, reuse, edit, remove, and reorder canonical ingredient rows;
  saved rows reload in order, and detail mode omits the edit-only Main flag.
- Recipe metadata, ingredient rows, and their ordered before/after history
  snapshots commit atomically in one versioned save. Invalid or stale saves
  leave all three unchanged.
- Owner isolation, keyboard operation, and responsive editor behavior meet the
  acceptance tests above.
- All focused unit, database/API, end-to-end, and accessibility tests pass, as
  do TypeScript typecheck, Biome, and the relevant recipe suite.
- Slice 5 introduces no measurement, scaling, or instruction-mention behavior.
