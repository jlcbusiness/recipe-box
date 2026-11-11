# DLC 33: Configurable Recipe Times

**Status:** Implemented in app version 1.7.0. The User and assistant are the
only reviewers.

## Outcome

A recipe can have any number of ordered time entries, each with a
Settings-managed time type and a whole-minute value. The recipe editor provides
an **Add time** control and a read-only **Total time** that is always the sum of
the entries. A time value can be entered as an arithmetic expression; when the
field loses focus, the expression is evaluated, rounded to a whole minute, and
replaced with that value.

## References

- [DLC roadmap](README.md), approved DLC 33
- [First-draft specification](../../first-draft-spec.md), Recipes
- [Comprehensive reference](../../comprehensive-reference.md), §§ 2 and 2.2
- [Data model](../../data-model.md), Recipe records and Configuration Boundaries
- [Design philosophy](../../design-philosophy.md) and [visual design guide](../../visual-design.md), Recipe Metadata Entry
- [Decision log](../../decision-log.md)
- Current implementation: [recipe form](../../../../src/app/recipes/recipe-form.tsx),
  [recipe save action](../../../../src/app/recipes/actions.ts),
  [recipe time rules](../../../../src/lib/recipes/recipe-rules.ts), and
  [Settings picklist manager](../../../../src/app/settings/recipe-picklist-manager.tsx).
- Existing coverage: [recipe browser tests](../../../../tests/e2e/recipes.spec.ts),
  [ingredient-row browser tests](../../../../tests/e2e/ingredient-rows.spec.ts),
  [public recipe browser tests](../../../../tests/e2e/public-recipes.spec.ts),
  and [recipe time unit tests](../../../../tests/unit/recipe-rules.test.tsx).

## Existing pattern and requested change

The recipe form currently renders nine fixed time inputs (Prep through Rest),
an editable Total input, and a separate `Σ` button. `calculateTotalMinutes`
sums the nine component inputs only when the user activates that button.
Recipe detail and public detail use fixed labels, while save, export, import,
history, public-copy, and Explorer paths carry the fixed fields.

The form already uses compact, content-sized metadata controls and ordered
ingredient rows. Settings has a shared recipe-picklist manager with inline
creation from supported editor picklists, ordering, and managed rename,
merge, and delete behavior. Reuse those patterns rather than adding a second
catalog or a new time-specific visual language.

The requested change is to replace the fixed component fields with ordered
time-entry rows. Keep the existing minute storage and duration display
conventions where they still apply. Remove component-time Explorer filters and
columns while retaining Total Time.

## Scope

- Replace the fixed component-time inputs with an initially empty ordered list
  and a full-width, italic **add time** row. Each time row has a whole-minute
  expression field, a searchable **Time Type** selector, a leading drag grip,
  and a remove action. Show one Minutes/Time Type header above the rows rather
  than repeating visible labels in each row.
- Add `Time Type` to the existing account-managed recipe picklist catalog and
  Settings manager. Reuse its revision, account isolation, inline creation,
  ordering, and safe rename/merge/delete behavior.
- Seed the existing types Prep, Mixing, Marinate, Chill, Freeze, Cook, Bake,
  Cooling, and Rest so current categories remain available. Users can add
  custom types. Multiple rows may use the same type.
- Support row removal and smooth pointer/touch drag ordering with the existing
  ingredient and instruction interaction patterns. Keep Ctrl+ArrowUp/Down
  keyboard reordering and announce position changes. Do not add a reusable time
  template, timer, or instruction-level duration.
- Keep one visible, read-only Total time value in the editor. It is the sum of
  all valid entries in minutes, is zero when there are no entries, and is
  recalculated when a valid entry changes, is added, or is removed. Do not
  discount overlapping activities; this is a sum, not an elapsed-time
  scheduler.
- On blur, evaluate expressions with integer literals, `+`, `-`, `*`, `/`,
  parentheses, and ordinary arithmetic precedence. A valid expression is
  replaced by its grouped whole-minute result. Round to the nearest minute,
  with half-minute values rounded up.
- Reject malformed or incomplete expressions, division by zero, negative
  results, and values outside the supported database integer range. Keep an
  invalid expression visible, associate an actionable error with its field,
  leave the total unchanged, and block form submission until corrected or the
  row is removed. Never evaluate input as JavaScript.
- Persist the time entries as the source of truth. Recompute the existing
  `total_time_minutes` value on the trusted save path so existing total-time
  sorting and filtering can continue to use a single numeric field; do not
  accept a separately edited total from the client.
- Update private, public, print, and standalone output to render the total
  followed by non-zero time entries in their saved order, using the existing
  minute/hour formatter. Preserve existing behavior that omits zero-valued
  times from recipe cards and summaries.
- Update account-scoped export/import, history and restore, Trash and purge,
  and public-copy paths to include the new entries and time-type references.
  Keep the existing public allow-list boundary; do not expose private recipe
  data through the new relation.

## Data, security, and failure boundaries

- Store ordered time entries with recipe ID, account ID, time-type ID,
  non-negative integer minutes, and position. Use account-aware foreign keys
  so a recipe cannot reference another account's time type.
- All recipe writes remain atomic with the recipe's expected-version check.
  Derive the account from the authenticated user in database functions; do not
  accept a client-supplied account ID or allow direct client writes around the
  save path.
- Extend the existing recipe-picklist category constraint and management
  functions for `time_type`. Preserve case-folded uniqueness, optimistic
  revisions, history, and the existing referenced-value merge/delete rules.
- Recipe updates, entry replacement, derived-total calculation, and history
  snapshots must commit or fail together. A stale recipe or picklist revision
  must not partially update entries or totals.
- Migrate all non-null fixed component values to entries with their matching
  seeded type, preserving their values and order. If a recipe has no component
  values but has a legacy manual total, migrate that number to a `Cook` entry.
  When component values exist, derive the new total from them even if the old
  manual total differed; see **Review decisions**. Keep the migration
  reversible until parity and account ownership are verified.
- A failed save or stale revision reports the existing visible error status
  and leaves the user's in-progress entry edits available for correction or
  retry.

## Interaction and responsive contract

- With no time entries, show the italic add time row and read-only Total time
  (`0` minutes); do not show placeholder rows or additional time controls.
- Add time appends one row with a blank value and an available time type. If
  the catalog has no selectable value, provide the existing inline-create
  path instead of silently inventing a value.
- Label the input as a minute expression and the selector as Time Type. Show
  one visible Minutes/Time Type header above the rows; keep each row's labels,
  value, type, drag grip, and remove action programmatically associated and
  keyboard operable. The Time Type editor follows the
  ingredient/preparation suggestion pattern: focus shows the full managed list,
  typing filters suggestions, and only selecting an explicit Add suggestion
  creates a new value. Leaving a partial unmatched query must not create a
  type. Keep the suggestion menu's height stable while scrolling when viewport
  space permits. Support Ctrl+ArrowUp/Down reordering from the grip and
  announce position changes. Announce evaluation errors and save status without
  moving focus.
- Keep minute controls no wider than three digits plus padding. Size all
  Time Type controls to the longest available type instead of expanding to fill
  the remaining row. Place the remove action beside the Time Type field at
  every viewport. Vertically center the minute and Time Type controls within
  each row. Left-align the Total label;
  align its read-only value to the minute column and use the same width.
- Place the single form Save action immediately after Instructions and before
  the Time section. Do not duplicate it in the read-only Total row.
- Use the recipe form's compact, content-sized controls and wrapping behavior;
  keep rows readable at narrow widths without horizontal page overflow. Reuse
  the existing paper, ink, focus, and leaf tokens.
- Validate the editor at the established desktop and Fold 6 viewports, including
  wrapping, visible focus, touch targets, and screen-reader labels. Preserve
  the existing private, public, print, and standalone duration formatting.

## Exclusions

- Editable total time or a manual override.
- Duration units other than minutes, seconds, countdown timers, or elapsed-time
  calculation that attempts to model overlapping work.
- Durations embedded in instruction steps, automatic extraction from recipe
  text, and ingredient or instruction grouping changes.
- New recipe-time dashboards or unrelated catalog-management redesign.

## Test-first acceptance

Write focused failing tests before production changes:

- Unit tests cover operator precedence, nested parentheses, every operator,
  whitespace, valid grouped integer display, division rounding, negative
  results, incomplete syntax, division by zero, unsupported tokens, overflow,
  and safe non-evaluation of arbitrary input.
- Browser tests cover the empty editor, italic add time row, type selection and
  inline creation, repeated types, pointer/touch and keyboard reorder, remove,
  evaluation on blur, total
  updates, accessible error recovery, and prevention of saving an invalid row.
- Settings tests cover Time Type catalog creation, rename, order, merge and
  delete behavior, including replacement when recipe entries reference a type,
  optimistic conflicts, and account isolation.
- Database tests cover the migration of all nine fixed fields, account-aware
  references, row ordering, atomic save/version checks, derived totals, history,
  Trash/restore, and purge behavior.
- Reader tests cover total-first ordering, custom labels, duration formatting,
  zero-value omission, and equivalent private, public, print, and standalone
  output.
- Export/import and public-copy tests prove entries and types round-trip without
  widening the public payload or leaking another account's data.
- Explorer tests verify the approved treatment of existing time-type filters
  and columns, and that Total Time continues to sort and filter correctly.
- Run focused recipe, Settings-picklist, Explorer, public-recipe, import/export,
  history, and database tests, then relevant typecheck, lint, accessibility,
  and diff checks. Inspect representative desktop and Fold 6 behavior.

## Review decisions

1. **Legacy totals:** The user's direction is that a recipe with only an old
   manual Total of 40 becomes a 40-minute `Cook` entry, so the derived Total
   remains 40. If a recipe has component values as well, preserve those values
   and calculate the new Total from their sum. For example, Prep 20 and Cook
   30 produce a Total of 50 even if the old manually entered Total was 40;
   retaining both the component values and old Total would require an exception
   to the auto-total rule. The user's rationale is that a recipe with a total
   but no breakdown is being cooked in the absence of other information, and
   the person can adjust the type later. A differing old manual total is
   intentionally replaced by the component sum so the new system encourages
   more accurate breakdowns.
2. **Expression rounding:** Use nearest whole minute, with half-minute results
    rounded up.
3. **Find Recipes compatibility:** Remove the filters and columns for fixed
    component types, keeping only Total Time filtering and its column. People
    generally remember overall duration (such as a recipe taking days), rather
    than searching by an individual stage such as marinating time.

## Completion criteria

- Recipe time entries use an account-managed Time Type and support the agreed
  safe arithmetic grammar, blur normalization, and accessible error recovery.
- Total time is read-only and always matches the sum of valid time entries.
- Existing recipe time data follows the approved migration policy; save,
  versioning, authorization, history, Trash/restore, bundles, public copies,
  and output paths remain consistent.
- Approved time-type query behavior and existing Total Time sort/filter
  behavior pass automated tests.
- Desktop and Fold 6 behavior is keyboard and touch accessible, and all
  applicable private/public/print/export paths display the same saved data.
