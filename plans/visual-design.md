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

This guide records both implemented UI and future product direction. Sections
marked **Current implementation** describe behavior present in the app; sections
marked **Planned direction** are aspirational and are not claims about shipped
screens. Treat a slice as current after implementation and validation.

## Design Philosophy

Recipe Box is a **working recipe library**, not a marketing surface, a
skeuomorphic kitchen, or a generic productivity dashboard. Its visual language
starts with the useful parts of dense work-item software—stable hierarchy,
scan-friendly data, direct editing, and strong keyboard support—then replaces
its cold, portal-like visual complexity with a quiet paper-and-ink workspace.
The app should make a frequently edited recipe feel trustworthy and easy to
read, not theatrical. It should feel like a well-kept personal reference: the
recipe is primary, its source is legible but secondary, and editing mechanics
appear only when they help someone capture or correct information.

### Principles

- **Dense, but never cramped.** Information density is valuable when it makes
  recipe entry and scanning faster. Give each field only the width it needs,
  align related values, and remove unused columns or controls. Do not fill
  space just because a table or pane has it.
- **Reading hierarchy before decoration.** A recipe title leads its page. Its
  source belongs immediately beneath it as a compact attribution, like a
  byline or citation, not as an isolated content block. Italicize the source
  title alone; issue, page, and URL are factual details and remain upright.
- **Geometry follows information shape.** Fields are not equal-width tiles.
  A recipe or publication name and a URL can justify a full row; author,
  edition, ISBN, quantity, and page number should occupy only useful space and
  wrap with their peers. Stable field sizes improve scanning and prevent a
  sparse form from reading like a dashboard.
- **Recipe language over database language.** A saved ingredient should read
  like a recipe: `1 1/2 cups flour`, `120 g flour`, `2 bunches cilantro`, or
  `salt to taste`. Labels and controls may expose structure in edit mode, but
  view mode should turn that structure into familiar cooking prose.
- **Direct manipulation before chrome.** Make a cell editable in place, expose
  a trailing blank ingredient row rather than an Add button. Keep routine
  actions close to the item they affect; avoid extra toolbars, cards, and
  explanatory copy when direct interaction is clear.
- **Destructive actions require separation.** Keep Delete away from routine
  navigation, editing, printing, and selection controls. Do not put it on
  recipe-list rows, where selecting a recipe could trigger it accidentally.
  Give it a deliberate place in an editing context; a confirmation dialog is
  an additional safeguard, not a substitute for spatial separation. Slice 8
  illustrates the rule: Delete sits at the upper-right of the edit header,
  apart from Return to View. It does not belong beside the detail title,
  where the title and routine actions already occupy the available sides, or
  at the bottom of the screen, where it would be inconvenient and unexpected.
- **State change must read at a glance.** Quiet default controls preserve the
  paper-and-ink rhythm. A destructive text action may be outlined while idle,
  but hover and focus must become unmistakable tomato red with white text.
  Color reinforces a visible label and never provides the only signal.
- **Structure is responsive, not merely smaller.** Desktop optimizes for
  keyboard-efficient, aligned row entry. Mobile keeps the same data model but
  edits one ingredient in a focused pane with touch-safe controls and
  viewport-contained menus. It is a different interaction anatomy, not a
  compressed table.
- **A little warmth, no nostalgia costume.** The paper surface, faint ruled
  texture, restrained rounded corners, and DM Sans typography give the
  application a domestic editorial character. They must never compromise
  legibility, scanability, or form behavior. The planned Recipe Tin motif is
  reserved for a later, bounded treatment; the current product is deliberately
  crisp and functional.
- **Polish serves operation.** Center short quantities, use quiet borders and
  regular-weight control text, preserve consistent field heights, and use color
  as reinforcement rather than instruction. A visual refinement is successful
  only if it also preserves keyboard, pointer, touch, and assistive-technology
  operation.

### Current visual foundation

- A single light theme uses a pale paper surface with a subtle green ruled
  texture; dark ink, muted gray-green, navy, leaf green, tomato red, and muted
  gold provide the limited accent palette.
- DM Sans Variable carries application text. Major headings are direct and
  modest rather than display-like; small caps distinguish compact labels and
  selected mobile actions.
- White editable surfaces, 1px quiet borders, and 3px corners distinguish
  controls without turning each field into a card. Empty editable cells use a
  faint paper tint rather than a separate empty-state panel.
- The layout relies on a wide, restrained content column, wrapping form rows,
  compact tables, and modest separators. It avoids nested cards, oversized
  gutters, persistent side panes, and decorative shadows.
- Recipe details use a title stack: the recipe name, then a compact green
  publication attribution when a source exists, then the detail content. The
  linked publication title is italicized as bibliographic context; its issue,
  page, and URL are not.
- Publication forms use unequal, content-informed fields. Name and URLs occupy
  a full row; Author, Edition, ISBN, and Magazine Issue remain compact and wrap
  as a group. ISBN formatting appears as direct input assistance, including
  after paste, not as a separate cleanup step.
- Default add actions are quiet text commands. Their green filled hover/focus
  state confirms an available constructive action without making the resting
  interface button-heavy.
- Standalone text actions such as Save are 48px high. Compact icon actions
  placed beside a title, such as Print and Edit, are 36px square. On mobile they
  keep a 48px hit area without changing their visible size. Picklist triggers
  and other icon-only controls have their own sizing rules.

### Planned Recipe Tin identity

The Recipe Tin may later gain a carefully bounded vintage metal-tin and index
card treatment. It must remain distinct from the everyday editor: ordinary
publication and recipe screens stay clean, crisp, and restrained, and any
textured or deckled treatment must preserve accessibility, printing, and
scannability.

### When details are unspecified

Treat Recipe Box as a calm working tool for people who repeatedly collect,
organize, and cook from recipes. New UI should feel deliberate, compact, and
familiar rather than promotional, decorative, or app-like for its own sake.
Prefer a clear information hierarchy, natural recipe language, and direct
manipulation of the thing being edited over explanatory copy or a separate
control surface.

- **Favor the smallest useful control:** Use compact fields, ordinary
  checkboxes, small drag grips, and modest inline actions. Do not add a button,
  card, toolbar, or visible instruction when direct interaction with the item
  already expresses the action.
- **Reveal complexity in context:** Show the full established choice set when a
  picker is activated. Filter or offer creation only after the person starts
  typing. Use a compact pane or popover when a narrow screen cannot sustain the
  desktop editing anatomy.
- **Use space to clarify, not decorate:** Keep dense edit workflows compact,
  but give reading-mode content enough consistent separation to scan. Preserve
  stable dimensions and avoid oversized fields, excessive gaps, nested cards,
  ornamental panels, or empty visual weight.
- **Respect the recipe mental model:** Display ingredients and other recipe
  content in natural, readable order and phrasing. Prefer conventions people
  already know from a recipe card or recipe site over database-shaped labels or
  concatenated values.
- **Adapt the workflow, not just the scale:** Desktop can expose structured,
  keyboard-efficient data entry. Mobile should retain the same capability with
  a simpler one-column or focused-pane interaction, touch-safe targets, no
  horizontal overflow, and viewport-aware overlays.
- **Make visual polish support operation:** Center compact numeric labels and
  values for scanning, keep text legible and controls visually quiet, and use
  color as reinforcement rather than the only signal. Keyboard, pointer, and
  touch paths must be equally complete.

### Current implementation conventions

- Icons and text labels follow these rules. Where two rules seem to conflict,
  the more specific rule (Rule 3, 4, or 8) wins.
  1. **Prefer icons for routine actions**, on desktop and mobile alike, so the
     two layouts stay consistent and mobile stays compact. Examples: Print,
     Edit, Calculate total time.
  2. **Every icon needs both a tooltip and a screen-reader name.** Set `title`
     for sighted pointer and keyboard users, set an accessible name (usually
     `aria-label`) for screen readers, and mark the icon itself `aria-hidden`.
     An icon is never the only explanation of its action.
  3. **Submission and deletion buttons always have visible text.** Save, Delete,
     and Move to Trash are deliberate confirmations, so a person must read what
     they are committing to. This applies to a single data pane, such as a
     recipe's edit screen or a dialog.
  4. **In a list, use a compact `x` to mean "remove this item".** Lists must
     express information in a clear, compressed format, so a list row, such as
     an ingredient row or instruction step, uses `x` instead of a text button.
     It still needs a tooltip and a screen-reader name that names the item.
  5. **On a pane, `x` means "close" or "cancel", never "delete".** Do not use
     `x` for deleting a whole record from a single data pane; Rule 3 applies.
  6. **Add a button only where an action merits one.** Fewer buttons is better.
     Prefer direct manipulation of the item, and do not add a button for
     something a person can already do in place.
  7. **Form fields keep visible labels**, never placeholder-only labels.
  8. **An icon must communicate its action clearly.** If no familiar icon
     unambiguously describes the action, use text instead, as brief as possible
     while still clear. For example, a trash can means "move this to Trash", so
     it cannot mean "open the Trash"; use the text "View Trash" for that. Rule 8
     overrides Rule 1.
- Custom picklists use an ordinary compact trigger and a portal-rendered
  listbox. The listbox is anchored near its trigger, remains inside the
  viewport, shows the active keyboard option, and keeps selection visible
  without relying only on color.
- Popovers and menus are part of the workflow, not floating decoration: they
  have a clear anchor, controlled maximum height, explicit dismissal, visible
  focus, and no page-level horizontal overflow.
- Static reading mode is calmer than editing mode. Editing may show labels,
  field structure, rails, and pickers; reading mode reduces those mechanics to
  concise natural language.

## Recipe Metadata Entry (Slice 4)

Recipe forms use content-sized controls and wrapping rows rather than a tiled
grid. Fields should be only as wide as their content requires, with longer
text fields capped to a readable line length. Keep about 4px vertical and 7px
horizontal control padding on desktop; do not add large gaps between compact
time fields.

Edit-form metadata and time controls keep compact row spacing as they wrap.
View-mode metadata uses consistent 11px vertical spacing between wrapped rows
and full-width metadata groups.

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
- **Group mobile view times:** Keep Total Time in the main recipe metadata. Show
  component times in a separate subsection with a divider and small-caps
  “Times” title on mobile. The current title is 18px navy small caps; component
  labels remain muted.

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
it on the State row. Center the numeric text and label text for Serves and time
fields. The Serves input is
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
their own full-width row. The title row uses compact icon-only Print and Edit
actions, with Edit at the trailing edge. Both controls expose descriptive
accessible names and tooltips. Their visible buttons are 36px square; on mobile,
their hit areas expand to 48px without changing their visible size. Do not repeat
Recipe Tin as a page breadcrumb or attribution when the selected navigation item
already names the Recipe Tin.
Recipe titles and major detail section headings use 16pt (about 21.33px). The
mobile Times subsection title is 18px navy small caps. The desktop Recipe Tin
list content is up to about 1172px wide and the detail metadata area is up to
about 1012px wide.

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

### Current implementation

The Recipe Tin list is a compact table with Name, Food Type, State, and Opinion
columns; mobile hides Food Type and State. Recipe details show metadata, the
ordered ingredient list, and notes. The desktop ingredient editor uses a
keyboard-operable table with a trailing blank row, compact cell editors, and a
separate control rail. Its visible order is Ingredient, Specifics, Amount, and
Preparation. The Amount heading spans a compact Type control and its matching
amount controls; it does not introduce database-shaped subheaders.

Ingredient rows open compact cell editors. Ingredient and Preparation open
their full picklists on activation; typing filters options and offers an
add-new suggestion when there is no exact match. The Main checkbox and 12px
drag handle sit outside the table. Dragging reorders rows; keyboard users press
`Ctrl+ArrowUp` or `Ctrl+ArrowDown`. A compact delete `x` appears on populated
rows when hovered or keyboard-focused; on mobile it remains visible with a
48px hit area.
For Ingredient and Preparation picklists, Enter selects the active option and a
second Enter commits; Tab accepts and commits the active suggestion, moving
from Ingredient to same-row Specifics and from Preparation to the next row's
Ingredient. Enter commits Specifics text directly.
`Ctrl+S` / `Cmd+S` saves the recipe.

The desktop Amount interaction has one fixed category picker—**Unit**, **Count**,
**Things**, or **Feel**—and a single adjacent Amount area. The picker is only
as wide as its longest visible label plus a small breathing margin; its column
does not expand to consume the table. Unit keeps optional volume and weight
amount/unit pairs on one line with a slash between them. Count shows a single
quantity, Things places a quantity beside its account-managed unit, and Feel
shows its phrase picker. Quantity fields begin at two characters, grow only for
entered content, and center their text. Units and category values use compact
custom listboxes; US and Metric groups are visibly underlined in unit menus.

### Product direction

Recipe detail will place the ingredient list beside instructions, with related
recipes (Pairs with) and notes at the bottom. The Library uses List and Grid
views with a compact Type picklist, a direct icon View toggle, a Sort by menu,
and a separate Sort direction button. The View icon represents the current mode
and its accessible name identifies the destination mode. The Type button stays
wide enough for “Magazines” and reflects its active filter with an icon; icon
buttons have accessible names.
Desktop List uses scan-friendly metadata columns with centered recipe counts and
publication-title tooltips that put each field on its own line. Mobile List
shows only a type icon and one truncated title per row. Grid cards show author
names without a type prefix; desktop puts each author on its own line, while
mobile truncates titles and authors on one line. Grid covers are 72px wide on
desktop and 48px wide on mobile. Date Added and Date Changed remain sort
choices, not visible List columns. Configurable columns remain future work.

## Mobile

### Current implementation

The mobile Recipe Tin list shows Name and Opinion. Recipe details show the
recipe title, metadata, component times in their own subsection, ingredients,
and notes. Ingredient editing uses a one-column list with the Main checkbox and
a pale 24px drag grip in a slim rail. Tapping a row opens a compact popover for
Ingredient, Specifics, Amount, and Preparation in that order. The Amount
section keeps its category, quantity, and unit controls in a compact wrapping
line; paired Unit dimensions remain together when space permits. Its pane is
wide enough for fractional paired values at the supported mobile width, with
short quantity padding and deliberate amount-to-unit spacing. Picklists,
overlay placement, and the 48px Submit hit area adapt to the viewport; the page
does not scroll horizontally.

### Planned direction

Mobile is not a shrunken desktop view. It should prioritize lookup, cooking,
quantities, scaling, and short-form entry. Recipe reading should lead with the
title, scaling, ingredient list, and steps; secondary metadata should stay
compact or be progressively disclosed.

Cooking mode should provide touch targets of at least 48px, high-contrast text
for kitchen lighting, temporary ingredient check-off, and a screen wake lock.

## Ingredient Presentation

### Current implementation

Recipe detail currently uses Standard presentation: ingredient rows stay in
their saved order and render as amount, lowercase Specifics and ingredient name,
then Preparation. The detail page stacks ingredients and instructions
vertically. Unit can display volume, weight, or both with ` / ` separating the
dimensions. Things pluralize from their maximum range value; `cup` becomes
`cups` above one while abbreviated fixed units remain unchanged. US customary
quantities use familiar fractions when close to halves, thirds, quarters, or
eighths; metric quantities never use fractions and display at most two decimal
places.

### Planned direction

Slice 16 adds reader controls and Ingredient-first presentation. The intended
Standard reading layout places ingredients beside instructions; the current
detail page remains vertically stacked.

Ingredient-first presentation ("mine") shows Ingredient, Amount, and Preparation.
Specifics is rendered as a distinct subtitle beneath the Ingredient name:

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

Ingredient-first is the default for mobile and public share. Print follows the
active recipe presentation; until Slice 16 introduces reader view controls,
print uses the Standard presentation. The chosen presentation is a reader
preference, not recipe data.

Instruction ingredient mentions default to bold dark red so linked ingredients
are easy to scan. User Settings offers a dedicated styling configuration:
- A palette of accessible preset colors (dark red, forest green, navy blue,
  amber/brown, charcoal/default text).
- Independent toggle checkboxes for bold, italic, and underline (any combination).
- Color presets are tested to ensure $\ge 4.5:1$ contrast against the app background.
Public and printed recipes always use the default bold dark-red styling.

### Trash and baseline print (Slice 8 current implementation)

- Recipe detail keeps the routine Edit and Print actions beside the title. On
  mobile, Edit remains at the title row's right edge while Print precedes it;
  both retain touch-safe hit areas. Delete is available in edit mode at the
  upper-right of the edit header, apart from Return to View. It is not placed
  beside the detail actions or on recipe-list rows.
- Delete opens a native confirmation dialog that names the recipe and explains
  the 30-day restore window. Cancel and Escape leave the recipe unchanged.
- Trash is a dense responsive working list with deleted and purge dates and an
  explicit Restore action. Its empty state links back to the active Recipe Tin.
- Print uses the active detail content and a light paper layout. Ingredients
  use the same Standard-view formatter and ordering as recipe detail; app chrome
  and editing controls are omitted. Amounts remain unscaled and unconverted.

## Planned Publication Cover Fallbacks

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
with a subtle ruled texture, dark ink, navy, leaf green, tomato red, and muted
gold.
Refine typography, color, icon usage, and spacing as screens are designed; do
not treat these initial choices as final tokens.
