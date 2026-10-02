# Recipe Box Visual Design Guide

> **Reference Note:** For full interaction details, screen state behaviors,
> and UI specifications, see [plans/comprehensive-reference.md](comprehensive-reference.md),
> specifically:
> - [comprehensive-reference.md § 4 (Ingredient Presentation & Sorting)](comprehensive-reference.md#4-ingredient-presentation-and-sorting)
> - [comprehensive-reference.md § 6 (Publications & Recipe Tin Metaphor)](comprehensive-reference.md#6-publications-magazine-handling-and-the-recipe-tin)
> - [comprehensive-reference.md § 7 (Library Explorer & Query UI)](comprehensive-reference.md#7-queries-search-and-library-explorer)
> - [comprehensive-reference.md § 13 (Interaction, Keyboard-First & Accessibility)](comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility)

## Purpose

This document preserves the visual and interaction direction. It is not a
finished component specification. Before a UI slice is built, make wireframes
or a clickable prototype for that slice and verify layout, states, content
density, keyboard operation, and mobile behavior.

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
- Give the Recipe Tin its own visual identity: a vintage metal tin box with a
  hinged lid, containing dog-eared 3x5 index cards with handwritten notes.
  Recipes residing in the Recipe Tin render with a textured, ragged/deckled paper
  border background instead of a standard clean rounded card background.
  Ordinary publication and recipe cards remain clean, crisp, and restrained.

## Desktop

Recipe detail has a strong title and compact metadata area, followed by the
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
and acceptance screenshots. Establish typography, color tokens, icon usage, and
spacing only when the first wireframes reveal the needed system.
