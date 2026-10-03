# Recipe Box Visual Design Guide

> **Reference Note:** For full interaction details, screen state behaviors,
> and UI specifications, see [plans/comprehensive-reference.md](comprehensive-reference.md),
> specifically:
> - [comprehensive-reference.md § 4 (Ingredient Presentation & Sorting)](comprehensive-reference.md#4-ingredient-presentation-and-sorting)
> - [comprehensive-reference.md § 6 (Publications & Recipe Tin Metaphor)](comprehensive-reference.md#6-publications-magazine-handling-and-the-recipe-tin)
> - [comprehensive-reference.md § 7 (Library Explorer & Query UI)](comprehensive-reference.md#7-queries-search-and-library-explorer)
> - [comprehensive-reference.md § 13 (Interaction, Keyboard-First & Accessibility)](comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility)
> - [comprehensive-reference.md § 2.4 (Recipe Metadata Entry)](comprehensive-reference.md#24-recipe-metadata-entry-presentation)

## Purpose

This document preserves visual and interaction direction and records decisions
as they are validated in delivery slices. Design proceeds with each slice:
define the screen hierarchy and behavior, implement a testable first pass, then
refine it against the running desktop and mobile UI. Create a wireframe or
clickable prototype when the layout is not yet clear; it is not a separate phase
that blocks routine iteration.

Each UI behavior and state must be automatable. Before production UI code is
written, define focused automated tests for its acceptance behavior, including
keyboard and assistive-technology-relevant semantics; screenshots and manual
review support those tests but do not replace them.

## Design Direction

- Take inspiration from Azure DevOps work items: clear hierarchy, compact
  metadata, dense but legible data, powerful list/query views, and strong
  keyboard operation.
- Do not reproduce Azure portal's pane-heavy layout or its visual language.
- Preserve a calm, work-focused interface for repeated recipe entry and lookup.
- Ship a single light theme in the first release; dark theme is deferred.
- Labeled action buttons use two visual sizes: 48px for standalone actions such
  as Save, and 32px for compact actions placed beside text, such as Edit.
  Compact mobile actions retain a 48px hit area without changing their visible
  height. Picklist triggers and icon-only controls have their own sizing rules.
- Give the Recipe Tin its own visual identity: a vintage metal tin box with a
  hinged lid, containing dog-eared 3x5 index cards with handwritten notes.
  Recipes residing in the Recipe Tin render with a textured, ragged/deckled paper
  border background instead of a standard clean rounded card background.
  Ordinary publication and recipe cards remain clean, crisp, and restrained.

## Recipe Metadata Entry (Slice 4)

Recipe forms use content-sized controls and wrapping rows rather than a tiled
grid. Fields should be only as wide as their content requires, with longer
text fields capped to a readable line length. Keep about 4px vertical and 7px
horizontal control padding on desktop; do not add large gaps between compact
time fields.

### Guiding concepts

- **Text-fit, not equal-width:** Single-choice selects fit their longest option.
  Metadata and time controls flow left to right and wrap when the viewport runs
  out of room.
- **A choice is not text selection:** Multi-picklists open a compact dropdown.
  Options are buttons, not checkboxes or selectable text. One menu is open at a
  time; Escape closes it.
- **State is explicit:** Name occupies the first row. State defaults to Want to
  try; its active Enthusiasm, Verdict, Reason, or Occasion Details field shares
  the next row with State, with Serves at the end of that row. The following row
  holds Food Type, Meal Type, and Cuisine. Equipment follows Serves on the
  State row.
- **Time is deliberate:** Component minutes are small, spinner-free numeric
  inputs. Total Time is separate and changes only through the adjacent sigma
  action.

### Picklist behavior

Single-choice Food Type, State, Verdict, and Enthusiasm controls use custom
anchored dropdowns with the same trigger height as multi-picklists. Menus open
below and align to their own trigger on desktop and mobile. Meal Type, Cuisine,
and Equipment use a narrow trigger whose width is reserved for the longest
option including its checkmark, so selecting or clearing an option cannot
resize it. The popup lists options vertically in configured order. A selected
option shows a checkmark and bold leaf-green text on a pale green background;
color is supplementary to the checkmark, never the only selection signal. The
picker does not display native checkboxes or blue text-selection highlighting.
Single- and multi-picklist labels share the same 13px bold typography. Trigger
text stays regular-weight whether selected or not, so neither control type
looks heavier by default.

The visible single-choice prompt for Enthusiasm is “What am I feeling?” while
the field label remains “Enthusiasm.” Verdict order places Specific occasion
immediately before Once-a-year-rich and So-so. Reason is a single-line field.

### Serves and times

Serves is one optional positive integer with no group heading. Equipment follows
it on the State row. Center the numeric text in its field. The Serves input is
36px high on desktop and matches the 48px picklist trigger height on mobile.
Times are grouped under “Times (min)” and wrap naturally.
Each numeric input is sized to five characters or its visible label, whichever
needs more room, with 8px gaps. Total occupies its own final row, with a square
icon-only `Σ` button beside it and an accessible name and tooltip of “Calculate
total time.” On mobile, keep a 48px hit target around the visibly compact 30px
square. Hide numeric spinner controls; values are entered by typing. The
single-line Reason input matches its adjacent picklist height, including on
mobile.

### Recipe list, detail, and headings

On desktop, the recipe list shows Name, Food Type, State, and an Opinion column
for the active Enthusiasm, Verdict, or Reason. On mobile, it shows Name and
Opinion. Recipe detail follows the edit-form order
but uses a distinct view order: State and its active response, Occasion Details
when present, Serves, Total Time, Equipment, Food Type, Meal Type, Cuisine,
remaining times, then Notes. On desktop, Food Type, Meal Type, and Cuisine share
their own full-width row. On mobile, “Edit” uses 18px small caps at the right
edge of the title row; the “Edit” label is the same on desktop and mobile, with
small caps used only on mobile. The inline Edit button is 32px high on desktop
and mobile. On mobile, its hit area is 48px high. Do not repeat Recipe Tin as a page breadcrumb or
attribution when the selected navigation item already names the Recipe Tin.
Recipe-page headings, including detail titles and section headings, use 16pt
(about 21.33px). The desktop Recipe Tin list content is up to about 1172px wide
and the detail metadata area is up to about 1012px wide.

### Account menu

The private-shell account menu uses the same options everywhere. On desktop, show
the account email at the bottom of the left navigation, below its navigation
links (and directly below Settings when that destination is available). On
mobile, show a 48px circular initials button at the right of the navigation.
Both controls open the same account menu with the email and Sign out action.

On mobile, rows wrap without horizontal page overflow. Visible input boxes stay
compact, while labeled rows, picklist triggers, popup options, standalone
actions, and compact inline action hit areas retain touch targets of at least
48px.

## Desktop

Recipe detail has a compact title and metadata area, followed by the
working body: the ingredient list beside the instructions. Related
recipes (Pairs with) and notes sit at the bottom.

The Library supports Windows Explorer-like grid and details views, sorting,
filtering by publication type (All, Books, Magazines, Sites), and an optional
preview pane displaying publication metadata and lookup URLs without listing
all recipes. Recipe and publication lists support dense, scannable rows and
configurable columns.

Desktop workflows are keyboard-first. Entry, autocomplete, focus movement,
editing, and saving must work without drag-and-drop or a mouse. Tab/arrow traversal
moves through the ingredient grid; Enter in the final column creates a new row;
`Ctrl+S` / `Cmd+S` saves.

Every ingredient row has a left-edge drag handle in edit mode for fast manual
reordering. It is a pointer shortcut only: keyboard-accessible Move up / Move
down controls and a non-drag ordering control provide the same capability.

## Mobile

Mobile is not a shrunken desktop view. It prioritizes lookup, cooking,
quantities, scaling, and short-form entry. Recipe reading should lead with the
title, scaling, ingredient list, and steps. Secondary metadata is compact or
progressively disclosed without obscuring cooking content.

Cooking ergonomics:
- Touch targets strictly $\ge 48\times 48\text{ px}$.
- High-contrast text legible under kitchen lighting.
- Ingredient check-off state (interactive temporary strikethrough/checkbox in
  cooking mode to track ingredients added to the pot/pan).
- Screen wake lock / cook mode to keep the display active while cooking.

## Ingredient Presentation

Standard presentation lists each ingredient in the familiar recipe-book reading
order: Amount, Ingredient and Detail, then Preparation. The list sits beside the
instructions.

Ingredient-first presentation ("mine") shows Ingredient, Amount, and Preparation.
Detail is rendered as a distinct subtitle beneath the Ingredient name:

```text
+---------------------------+----------------+---------------+
| Ingredient                | Amount         | Preparation   |
+---------------------------+----------------+---------------+
| flour                     | 1 cup / 120 g  |               |
|   all-purpose             |                |               |
| eggs                      | 2              |               |
|   large                   |                |               |
| onion                     | 1              | diced         |
| coconut milk              | 14 oz          |               |
| salt                      | to taste       |               |
+---------------------------+----------------+---------------+
```

Ingredient-first is the default for mobile, public share, and printed recipes.
The chosen presentation is a reader preference, not recipe data.

Instruction ingredient mentions default to bold dark red so linked ingredients
are easy to scan. User Settings offers a dedicated styling configuration:
- A palette of accessible preset colors (dark red, forest green, navy blue,
  amber/brown, charcoal/default text).
- Independent toggle checkboxes for bold, italic, and underline (any combination).
- Color presets are tested to ensure $\ge 4.5:1$ contrast against the app background.
Public and printed recipes always use the default bold dark-red styling.

## Publication Cover Fallbacks

When a Book has no cover image, show a light-blue book-shaped rectangle with a
dark-blue border and italic title text sized to fit. When a Magazine Issue has
no cover image, show a white magazine-shaped rectangle with a black border and
normal title text sized to fit.

## Accessibility And Interaction

Use semantic controls, visible focus, readable contrast ($\ge 4.5:1$),
keyboard-operable controls, and touch-sized mobile targets. Do not depend only
on color: for example, density-derived values require an accessible text badge
or icon (`Derived from density`) as well as their background tint. Provide clear
empty, loading, error, confirmation, and destructive-action states in every
implemented UI slice.

## Required Future Detail

Before building a UI slice, document the screen's information hierarchy,
responsive behavior, key states, destructive confirmations, component anatomy,
and acceptance screenshots. The current visual foundation is a working
direction, not a locked design system: DM Sans Variable, a light paper surface
with a subtle ruled texture, dark ink, leaf green, tomato red, and muted gold.
Refine typography, color, icon usage, and spacing as screens are designed; do
not treat these initial choices as final tokens.
