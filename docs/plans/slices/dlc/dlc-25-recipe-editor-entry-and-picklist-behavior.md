# DLC 25: Recipe editor entry and picklist behavior

This repair slice addresses reported gaps in the existing recipe-edit workflow.
It is first in execution order despite its identifier because DLC identifiers
are kept stable.

## Outcome

A person can create supported picklist values while editing a recipe, enter
ingredient amounts without losing their place, use Enter to select and commit
editor values without submitting the entire recipe, and author unordered lists
in instruction steps.

## Scope

- Add in-editor value creation for Equipment, Food Type, Meal Type, and Cuisine.
  Reuse the account-owned picklist model and management rules; do not require
  leaving the recipe or silently create duplicate values.
- Repair the two-Enter interaction for ingredient amount fields: the first
  Enter selects an active suggestion where applicable, and the next Enter
  commits the field according to the editor contract.
- Repair amount-type selection so a second Enter commits the selected value
  rather than submitting the enclosing recipe form. Only the explicit recipe
  Save action may save the whole recipe.
- Make unordered Markdown lists work in instruction steps through editing,
  persistence, reopening, and rendered recipe views.
- Preserve draft data, focus progression, keyboard navigation, and mobile
  editing behavior.

## Decisions

- **In-editor picklist value creation (Equipment, Food Type, Meal Type, Cuisine):**
  - Open menus for `Food Type` (`Picklist`) and `Equipment`, `Meal Type`, and
    `Cuisine` (`MultiPicklist`) expose a trailing labeled `Add {Category}` text
    input and compact `Add` button at the bottom of the dropdown.
  - Nothing is saved while typing; pressing `Escape` or closing the menu discards
    unconfirmed text in the add input without side effects.
  - Confirming via `Enter` in the add input or activating the `Add` button calls
    an owner-derived server action (`createOrGetRecipePicklistValue`)
    that trims outer whitespace, collapses internal whitespace runs (`[[:space:]]+`
    to `' '`), preserves entered casing in `display_value`, and matches existing
    values case-insensitively within the account and category.
  - If a normalized match already exists in that category, it is returned and
    selected in the recipe draft without creating a duplicate or incrementing
    the catalog revision. Otherwise, a new value is appended at the end of
    `sort_order`, `recipe_picklist_revisions` increments, `picklist.added` is
    recorded in `recipe_picklist_history`, and the value is added to the menu
    and selected in the recipe draft (`Food Type` selects the value and closes
    its menu; `MultiPicklist` adds the ID to the selected set and keeps its
    menu open for further toggles).
  - Recipe assignments remain staged in the form draft until explicit `Save
    recipe`. If a picklist add fails, the recipe draft is preserved and an
    accessible status/alert reports the failure without claiming success. If a
    subsequent recipe save fails or is canceled, the recipe draft remains intact
    and any confirmed catalog value stays manageable in Settings.
- **Ingredient row, amount, and amount-type keyboard contract:**
  - Only the explicit `Save recipe` submit button may submit `#recipe-form`;
    pressing `Enter` inside any non-submit editor control never submits the
    enclosing recipe form.
  - `Tab` advances to the next control in the row (and from `Preparation` to
    the next row's `Ingredient` cell). When an ingredient suggestion list or
    measurement picklist (`Ingredient type`, `Volume unit`, `Weight unit`,
    `Informal unit`, `Judgment phrase`) is open, `Tab` accepts the active option
    before advancing focus.
  - `ArrowDown` and `ArrowUp` on a closed ingredient suggestion input or
    measurement picklist pop open the listbox and move the active option down or
    up from the current selection.
  - **First `Enter`** on an open suggestion or measurement picklist selects the
    active option, closes the listbox, and keeps focus on that control.
  - **Second `Enter`** (when the suggestion or measurement picklist is closed,
    or pressing `Enter` in a quantity input (`Volume amount`, `Weight amount`,
    `Count amount`, `Informal amount`) or `Specifics` text input where no
    suggestion listbox is open) normalizes and commits the current field/row and
    starts/focuses the trailing `Add ingredient row` cell on desktop (or submits
    the ingredient row popover on mobile).
  - `Escape` closes an open listbox or cancels the active cell edit / mobile
    popover without submitting.
- **Unordered Markdown lists in instruction steps:**
  - Restore explicit list styling (`list-style-type: disc` for `ul`,
    `list-style-type: decimal` for `ol`, and left padding) for nested lists
    inside `.recipe-instruction-list` in recipe detail, public recipe view, and
    print output (overriding Tailwind Preflight's `list-style: none` reset).
  - Update `parseInstructionMarkdown` so unordered (`-`, `*`, `+` followed by a
    space) and ordered (`1.`, `1)` followed by a space) list lines are parsed as
    `list` blocks whether separated from preceding paragraph/heading lines by a
    blank line (`\n\n`) or a single newline (`\n`).
  - In `InstructionStepsEditor`, when the caret is on a list line (`-`, `*`,
    `+`, or `1.` marker), pressing `Enter` continues the list on a new line
    within the same step (and pressing `Enter` on an empty list marker exits the
    list line); `Shift+Enter` always inserts a newline within the step, and
    `Enter` on a non-list line creates the next instruction step.

## Acceptance

- In recipe edit mode, create and select Equipment, Food Type, Meal Type, and
  Cuisine values without leaving the form; reopen the recipe and verify values
  persist. Existing values remain selectable and duplicates are prevented.
- For ingredient amount and amount-type controls, tests prove Enter does not
  submit the enclosing form. The active suggestion/option is selected first;
  the documented next Enter commits the field. Whole-recipe persistence occurs
  only from explicit Save.
- Unordered lists can be entered, saved, reopened, and rendered with their list
  semantics intact. Ordered lists and ordinary Markdown remain unchanged.
- Failed picklist or recipe saves preserve the draft and report the correct
  failure without claiming success.
- Unit, action/database, editor browser, recipe-save, instruction-rendering,
  keyboard, mobile, and accessibility tests pass.

## Verification

- **Status:** Complete (2026-10-19).
- **Automated coverage:**
  - Unit tests (`tests/unit/instruction-markdown.test.tsx`,
    `tests/unit/recipe-picklists.test.tsx`, and the full 36-file / 320-test
    Vitest suite) verify single-newline and blank-line unordered/ordered list
    parsing, `Enter` list continuation and empty-marker exit, and
    `createOrGetRecipePicklistValue` validation, normalization,
    case-insensitive deduplication, revision-guarded creation, and error
    reporting.
  - Browser & accessibility E2E tests (`tests/e2e/measurements.spec.ts`,
    `tests/e2e/ingredient-rows.spec.ts`, `tests/e2e/recipes.spec.ts`) across
    desktop (`chromium`) and mobile (`Fold 6`) verify inline creation and
    persistence of Food Type, Equipment, Meal Type, and Cuisine values,
    duplicate prevention, `Escape` discard, `ArrowUp`/`ArrowDown`
    open-and-advance, `Tab` active-option acceptance and field progression,
    two-`Enter` selection and row commit without submitting `#recipe-form`,
    unordered list authoring and `list-style-type: disc` rendering, and zero
    axe violations.
  - TypeScript (`tsc --noEmit`), Biome check on all modified files, Markdown
    lint (`scripts/lint-markdown.mjs`, 81 files, 0 errors), `git diff --check`,
    and `npm run build` pass.

## References

- [Ingredient rows](../5-ingredient-rows.md)
- [Measurements](../6-measurements.md)
- [Instructions and mentions](../7-instructions-and-mentions.md)
- [Recipe picklist management](../14b-recipe-picklist-values.md)
- [DLC brainstorm](../../discussion/dlc.md)
