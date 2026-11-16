# Recipe Box Comprehensive Reference: Interaction and Accessibility

[Back to the comprehensive reference index](../comprehensive-reference.md)

> Canonical product requirements: Desktop and mobile ergonomics, accessibility
> standards, accessible controls, ingredient editing, and private-shell
> navigation.

## 13. Interaction, Keyboard-First Design, and Accessibility

### 13.1 Desktop Ergonomics

- **Keyboard Navigation:** Tab and arrow key traversal through the ingredient edit grid.
  - **Shortcut Actions:** Add ingredient rows with Enter in the last column,
    trigger autocomplete with `#`, insert a degree symbol in an instruction
    with `Ctrl+.`, and save with `Ctrl+S` (`Cmd+S` on macOS). Shortcut saves
    stay in the editor; the visible Save button retains its current redirect.
    No save path introduces autosave.
- **No Drag-and-Drop Reliance:** Reordering ingredients and steps uses explicit keyboard-friendly up/down buttons or
  index input fields.

### 13.2 Mobile Kitchen Ergonomics

- Touch targets strictly $\ge 48\times 48\text{ px}$.
- High-contrast text legible under kitchen lighting.
- Ingredient check-off state (temporary strikethrough/checkbox in cooking mode to track what has been added).
- Screen wake lock / cook mode to keep the mobile screen awake while cooking.

### 13.3 Accessibility Standards

- Contrast ratio $\ge 4.5:1$ across all text.
- Focus outlines visible on all interactive components.
- Density auto-fills use a subtle tint and visible calculator icon, plus an
  associated screen-reader status announcing `Derived from density`; tint is
  never the only visible cue.

### 13.4 Accessible controls and ingredient editing

- Prefer native semantic HTML for ordinary page structure, forms, and controls.
- Use React Aria Components when a custom interactive control needs managed
  keyboard and assistive-technology behavior. Keep styling application-owned.
- The ingredient editor is a semantic text-first table. Values become compact
  editors only when activated. A control rail keeps Main checkboxes and 12px
  drag handles outside the data columns; `Ctrl+ArrowUp` and `Ctrl+ArrowDown`
  provide keyboard reordering. The only row action is a compact delete `x` for
  populated rows, revealed on desktop hover or focus and visible on mobile.
- Ingredient and measurement picklists use first Enter to select an active
  option and the next Enter to commit. Tab accepts an active option before
  advancing, and ArrowUp/ArrowDown opens closed picklists and moves the active
  option. Quantity and Specifics inputs commit on Enter when no suggestion is
  open. Enter never submits the recipe form. The visible Save recipe button
  and `Ctrl+S`/`Cmd+S` shortcut are the explicit save actions. See
  [Ingredient editing](02-ingredients-and-presentation.md#43-manual-reordering) for row focus progression and
  mobile behavior.
- Mobile uses a one-column ingredient list and a compact row editor popover.
  Keep the full editor and Submit visible without internal scrolling. The 48px
  Close control shares the Ingredient heading row, dismisses without submitting,
  and returns focus to the row trigger.
- Custom cell editors, suggestions, and popovers require focused keyboard,
  screen-reader, and automated accessibility tests.

### 13.5 Private shell account menu

Keep the private navigation available while the main content scrolls. On
desktop, pin the full-height left sidebar to the viewport and let it scroll
independently if its contents exceed the viewport. Place the utility controls
at the bottom in this order: Trash, Settings, then Account. On mobile, use a
wrapping horizontal navigation row with icon-only links for Library, Find
Recipes, Trash, and Settings; place Settings between Trash and the 48px circular
initials account control. Preserve descriptive accessible names for each icon
link. The Library link stays leaf green; when current, its pale green surface and
stronger circular outline make the state visible without color alone. On
desktop, its current state also uses an underline. `/` remains the sign-in page;
the authenticated `/app` entry opens the Library.

Both account controls open the same menu with the email and Sign out action.

Private-shell destinations use client-side navigation so switching sections
does not reload the document. While route content loads, keep the shell usable
and show a centered, muted `Loading…` status in a busy main landmark. Do not
animate this status for users who request reduced motion.

---
