# DLC 26: Recipe-editor save shortcut

## Outcome

People can deliberately save a recipe from its editor with `Ctrl+S` or, on
macOS, `Cmd+S`, without leaving the editor. The shortcut uses the existing save
flow and does not introduce autosave.

## References

- [DLC roadmap](README.md), Phase 5
- [Comprehensive reference](../../comprehensive-reference.md), §§ 4.3 and 13
- [Visual design guide](../../visual-design.md), recipe-editor keyboard behavior
- [Design philosophy](../../design-philosophy.md)
- [Decision log](../../decision-log.md)
- [DLC 00: Recipe-editor entry and picklist behavior](dlc-00-recipe-editor-entry-and-picklist-behavior.md)
- [Deferred work](../../discussion/later.md), recipe-editor save shortcut
- [Recipe form](../../../../src/app/recipes/recipe-form.tsx)
- [Recipe save action](../../../../src/app/recipes/actions.ts)

## Scope and behavior

- Support both new-recipe and existing-recipe editor forms. The shortcut is
  active only while a recipe form is in use, including when a text field or
  instruction editor has focus; it is not a global shortcut.
- `Ctrl+S` and `Cmd+S` invoke the same validation, serialization, server-side
  authorization, version checks, and error handling as the explicit Save flow.
  Prevent the browser's native Save behavior.
- A successful shortcut save stays in the editor. For an existing recipe, it
  remains on that recipe's edit route and refreshes the version used by the next
  save. For a new recipe, it opens the created recipe's edit route so later
  saves update that recipe rather than creating another.
- Provide visible, screen-reader-announced confirmation for a successful
  shortcut save. Validation, upload, and concurrency failures retain the draft,
  stay in the editor, and use the existing error presentation.
- The visible Save button keeps its current behavior and destination; the
  shortcut is the only save path that stays in the editor.
- Preserve existing Enter, picklist, and editor interactions. Do not add
  autosave, alter public recipe viewing, or change the data model or database.

## Create-form continuation

After the first successful shortcut save, the form moves from the new-recipe
route to that recipe's edit route, remaining in the editor. This gives
subsequent shortcut saves a stable recipe ID and version while avoiding
duplicate recipe creation.

## Acceptance criteria

1. Pressing `Ctrl+S` in an existing recipe form saves once, stays on the edit
   route, and announces success. A second shortcut save updates the same recipe
   with its refreshed version.
2. Pressing `Ctrl+S` in a new recipe form creates the recipe and opens its edit
   route. A later shortcut save updates that same recipe.
3. `Cmd+S` invokes the same behavior on macOS; neither shortcut opens the
   browser's Save flow or submits more than once.
4. The visible Save button still saves and follows its current redirect for
   both create and edit forms.
5. Validation, upload, and stale-version errors do not claim success or leave
   the editor; the current draft and accessible error feedback remain available.
6. Enter continues to follow the current editor and picklist behavior and does
   not submit the form.
7. Automated coverage exercises create and edit flows, repeat saves, both
   keyboard modifiers, error handling, and the unchanged Save-button behavior.

## Implementation boundary

Reuse the existing recipe save action and its authorization, history, and
optimistic-concurrency protections. No database migration or permission change
is expected. Update the comprehensive reference and visual design guide to
match verified implementation behavior.
