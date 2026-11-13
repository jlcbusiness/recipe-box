# DLC 37: Recipe editor entry behavior

**Status:** Implemented in app version 1.11.0.

## Outcome

The recipe editor's existing entry patterns work consistently across recipe
metadata and ingredient preparation: a person can search and explicitly add
metadata picklist values, record Size for Cubed, Diced, and Sliced ingredients,
and divide an ingredient using a populated measurement dimension.

## Existing pattern and requested change

The recipe editor already uses `SuggestionCellEditor` for Ingredient,
Preparation, and Time Type. It opens the available values on focus, filters as
the person types, and presents an explicit Add suggestion for unmatched text.
Food Type currently uses the shared single-select `Picklist`; Meal Type,
Cuisine, and Equipment use `MultiPicklist`. All four metadata menus currently
append a separate labeled text input and Add button, as specified by the
earlier recipe-editor picklist slice.

Use the existing suggestion interaction for all four fields. Preserve their
current selection models: Food Type remains single-select; the other three
remain multi-select toggles. A typeahead input is needed within the multi-select
menus, so adapt the suggestion pattern rather than replacing multi-select
behavior with a single-choice editor.

Structured ingredient Size currently appears only for Cubed, although the
preparation catalog also includes Diced and Sliced. Extend the existing Size
input and `in`/`cm` toggle to Diced and Sliced; keep the same stored fields and
formatting rather than introducing a new dimension model.

For divided Unit measurements, the editor currently remembers whichever Volume
or Weight unit control received focus, even if that measurement has no amount.
Keep this focus shortcut when both dimensions have amounts, but do not let an
empty dimension override the populated one.

## Scope and interaction contract

- Replace the separate add input/button in these four recipe-editor menus with
  a searchable input and filtered suggestions. Do not change Settings' catalog
  manager or other picklists.
- Focusing an open menu's search input shows its full, ordered catalog. Typing
  filters values case-insensitively by substring. A non-empty query that does
  not match an existing value after trimming, collapsing whitespace, and
  case-folding offers one explicit `Add "query"` suggestion.
- Selecting an existing Food Type sets it and closes the menu. Selecting an
  existing Meal Type, Cuisine, or Equipment value toggles that value and keeps
  the menu open for further selections.
- Activating an Add suggestion calls the existing account-scoped
  `createOrGetRecipePicklistValue` action. It normalizes whitespace, preserves
  entered casing for a new value, and reuses a case-insensitive match in the
  same category rather than creating a duplicate. The resulting value is
  selected in the recipe draft; Food Type closes its menu, while multi-select
  menus remain open.
- Catalog creation is immediate after explicit Add confirmation. Recipe
  assignments remain in the form draft until the explicit recipe Save action.
  Typing or leaving an unmatched query never creates a value.
- Escape and menu dismissal discard the query without changing the selection.
  Creation failures preserve the current recipe draft and show an accessible
  error; they must not imply that the value was added.
- Food Type uses the single-select editable-combobox suggestion model. Its
  Arrow keys move the active suggestion and Enter selects the active value or
  explicit Add suggestion. Tab leaving unmatched text does not add it.
- MultiPicklist fields keep a labeled search textbox and their existing
  `aria-pressed` toggle buttons; do not represent them as single-select
  comboboxes or put interactive buttons inside listbox options. ArrowDown from
  the search textbox focuses the first filtered option; ArrowUp/Down on an
  option moves among matching buttons, and Space toggles the focused option.
  Tab/Shift+Tab moves through the search input and buttons. The explicit Add
  suggestion is a button operable by Enter or Space. Escape closes the menu and
  returns focus to its trigger. Preserve visible focus and selected-state
  announcements.
- Keep menus anchored, viewport-bounded, and consistent with compact recipe
  metadata controls. Do not introduce horizontal page overflow at mobile
  widths.
- The mobile ingredient details pane places its 48px Close target beside the
  Ingredient label. It dismisses without submitting, returns focus to the row
  trigger, and keeps the full editor visible without internal scrolling.
- In the ingredient row editor, selecting Cubed, Diced, or Sliced shows the
  existing positive-decimal Size input and underlined `in`/`cm` toggle. Store
  the value and unit in the existing `size_value` and `size_unit` fields, and
  render the saved preparation followed by its formatted Size.
- Switching among Cubed, Diced, and Sliced preserves the current Size draft.
  Switching to a preparation that does not support Size clears it, matching
  the current behavior when leaving Cubed. Size remains optional; when entered,
  it requires a positive decimal and one of the two supported units.
- For divided Unit measurements, a focused Volume or Weight unit control
  selects that dimension only when it has a populated amount. If only one
  dimension has an amount, use it even when keyboard focus passed through the
  other, empty unit control. If both dimensions have amounts, preserve the
  existing behavior where focusing either unit control selects the first-portion
  dimension, and the resulting ratio applies to both. If the remembered
  dimension becomes empty, fall back to the populated dimension. Keep existing
  Count and Things behavior.

## Data, security, and failure boundaries

- Reuse `createOrGetRecipePicklistValue` and the existing owner-derived
  `manage_recipe_picklist` path. No picklist schema, catalog revision, or
  authorization changes are in scope.
- New values retain the existing normalization, category isolation,
  case-insensitive deduplication, and `picklist.added` history behavior.
- A confirmed catalog value remains in Settings if the recipe is canceled or
  its save fails. A failed add leaves selected recipe values unchanged and
  exposes the failure accessibly.
- Size continues through the version-checked recipe save path and existing
  ingredient row fields; no new table or bundle fields are required. Add a
  forward database migration to widen the current Size/preparation constraint
  from Cubed-only to Cubed, Diced, or Sliced, and update the database-side save
  validation in that migration. Preserve account isolation, recipe version
  checks, history, and existing Size values.
- Invalid Size values and invalid preparation/Size combinations remain visible
  as recipe-save errors without partially saving the recipe.
- Portion selection uses the existing version-checked recipe save path and
  ratio representation; no new persisted fields are needed. Focusing an empty
  unit control must not change which populated measurement is divided.

## Test-first acceptance

- Component tests cover query filtering, full-list restoration, explicit Add
  suggestions, normalized exact-match behavior, keyboard selection,
  Escape/dismissal, accessible names and selected states, and surfaced add
  failures.
- Browser tests cover adding and selecting all four categories, normalized
  duplicate reuse, ordinary existing-value selection, and discard of
  unconfirmed text. Verify that Food Type closes after selection and the
  multi-select menus remain open after toggling or adding a value.
- Verify that values appear in Settings immediately after Add, while recipe
  assignments persist only after explicit Save; reopening the recipe restores
  its saved selections.
- Run active-menu axe checks and keyboard/focus assertions at desktop and Fold
  6/mobile widths. Assert the popup stays within the viewport and the page does
  not scroll horizontally.
- Unit tests prove Size validation accepts Cubed, Diced, and Sliced
  case-insensitively, still rejects unsupported preparations and invalid
  values, and preserves or clears the draft correctly when Preparation
  changes.
- Database tests prove the migration updates the Size constraint and trusted
  save validation atomically, retaining existing Cubed Size values and
  rejecting Size on unsupported preparations.
- Browser tests cover showing, editing, saving, reopening, and rendering Size
  for all three preparations, including switching between them and switching
  to a preparation without Size. Verify the Size controls remain keyboard and
  touch accessible and do not overflow at desktop and Fold 6/mobile widths.
- Unit tests cover selecting a populated dimension, ignoring an empty focused
  dimension, and falling back when a previously selected dimension is cleared.
- Browser tests cover a populated Volume followed by Tab through an empty
  Weight unit control and then selecting `divided`: the first portion uses the
  Volume unit and amount. Also verify Weight-only rows use Weight, and rows
  with both dimensions still switch the first-portion unit when either unit
  control receives focus.
- Run focused ingredient-editor and database tests, then relevant typecheck,
  lint, accessibility, migration, and diff checks.

## Research and design rationale

- The WAI-ARIA Authoring Practices Guide describes a combobox with a listbox
  popup as single-select, while its listbox guidance cautions against putting
  interactive controls such as buttons inside options. Therefore Food Type can
  use the editable-combobox pattern, but searchable multi-select menus should
  retain their search textbox plus toggle-button model instead of forcing all
  four controls into one combobox/listbox pattern. Keep the existing fieldset
  grouping and `aria-pressed` state.
- Local `SuggestionCellEditor` and `MultiPicklist` implementations remain the
  primary visual and interaction references. No broader product or external
  research is needed; verify the combined semantics with focused keyboard,
  screen-reader-oriented, and mobile browser tests.

## Exclusions and documentation follow-up

- No changes to recipe metadata fields, single-/multi-select meaning, Settings
  catalog management, other picklists, or recipe-save transaction behavior.
- After implementation, update the older inline-add interaction wording in the
  [comprehensive reference](../../comprehensive-reference.md#81-centralized-picklist-management),
  [visual design guide](../../visual-design.md#picklist-behavior), and
  [decision log](../../decision-log.md) to match the verified behavior.
- Update the Size contract in the [data model](../../data-model.md), the
  [comprehensive reference](../../comprehensive-reference.md#37-divided-portions-and-size),
  [visual design guide](../../visual-design.md#ingredient-presentation), and
  [decision log](../../decision-log.md) from Cubed-only to Cubed, Diced, and
  Sliced.
- Update divided-measurement guidance in the [comprehensive
  reference](../../comprehensive-reference.md#37-divided-portions-and-size),
  [DLC 04 brief](dlc-04-ingredient-amounts-and-references.md), and
  [decision log](../../decision-log.md) to say that focusing an empty
  measurement dimension cannot override the populated dimension.
- Decide and apply the package version at implementation completion, following
  the delivery-slice prompt.

## References

- [Delivery roadmap](../../delivery-roadmap.md), current implementation and
  mandatory slice rules
- [First-draft specification](../../first-draft-spec.md), Recipes
- [Comprehensive reference](../../comprehensive-reference.md), §§ 2, 8.1, and
  13
- [Data model](../../data-model.md), ownership and picklist values
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide](../../visual-design.md), Recipe Metadata Entry
- [DLC 00: Recipe editor entry and picklist behavior](dlc-00-recipe-editor-entry-and-picklist-behavior.md)
- [DLC 01: Navigation and picklist typeahead](dlc-01-navigation-and-picklist-typeahead.md)
- [DLC 04: Ingredient amount semantics and references](dlc-04-ingredient-amounts-and-references.md)
- [Ingredient and Preparation suggestion editor](../../../src/app/recipes/ingredient-rows-editor.tsx)
- [Recipe multi-picklist](../../../src/app/recipes/multi-picklist.tsx)
- [Recipe form](../../../src/app/recipes/recipe-form.tsx)
- [Measurement editor](../../../src/app/recipes/measurement-editor.tsx)
- [Ingredient rules](../../../src/lib/recipes/ingredient-rules.ts)
- [Size and ingredient-row migration](../../../../supabase/migrations/20261115000000_add_ingredient_portions_and_size.sql)
- [DLC 37 Size migration](../../../../supabase/migrations/20261225000000_dlc37_ingredient_size_preparations.sql)
- [Ingredient row browser tests](../../../../tests/e2e/ingredient-rows.spec.ts)
- [Ingredient rule unit tests](../../../../tests/unit/ingredient-rules.test.tsx)
- [Measurement browser tests](../../../../tests/e2e/measurements.spec.ts)
- [Picklist action tests](../../../tests/unit/recipe-picklists.test.tsx)
- [Recipe editor browser tests](../../../tests/e2e/recipes.spec.ts)
- [WAI-ARIA APG: Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [WAI-ARIA APG: Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)
