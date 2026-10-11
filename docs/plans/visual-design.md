# Recipe Box Visual Design Guide

## Table of Contents

- [Purpose](#purpose)
- [Design Philosophy](#design-philosophy)
- [Recipe Metadata Entry (Slice 4)](#recipe-metadata-entry-slice-4)
- [Recipe Relationships and References (Slice 11)](#recipe-relationships-and-references-slice-11)
- [Settings (Slice 14A)](#settings-slice-14a)
- [Settings (Slice 14B)](#settings-slice-14b)
- [Settings (Slice 14C)](#settings-slice-14c)
- [Desktop](#desktop)
- [Mobile](#mobile)
- [Ingredient Presentation](#ingredient-presentation)
- [Publication Editing](#publication-editing)
- [Planned Publication Cover Fallbacks](#planned-publication-cover-fallbacks)
- [Accessibility And Interaction](#accessibility-and-interaction)
- [Required Future Detail](#required-future-detail)

## Quick Links

- [First-draft specification](first-draft-spec.md) for product scope and behavior.
- [Data model](data-model.md) for entities and relationships.
- [Decision log](decision-log.md) for accepted choices and rationale.
- [Delivery roadmap](delivery-roadmap.md) for slice order and progress.
- [Comprehensive reference](comprehensive-reference.md) for full requirements;
  relevant sections: [metadata](comprehensive-reference.md#24-recipe-metadata-entry-presentation),
  [ingredient presentation](comprehensive-reference.md#4-ingredient-presentation-and-sorting),
  [recipe relationships](comprehensive-reference.md#52-recipe-to-recipe-links-pairs-with),
  [references](comprehensive-reference.md#53-references-section),
  [publications](comprehensive-reference.md#6-publications-magazine-handling-and-the-recipe-tin),
  [queries](comprehensive-reference.md#7-queries-search-and-library-explorer), and
  [accessibility](comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility).

## Purpose

This document preserves visual and interaction direction and records decisions
as they are validated in delivery slices. Design proceeds with each slice:
define the screen hierarchy and behavior, implement a testable first pass, then
refine it against the running desktop and mobile UI. Create a wireframe or
clickable prototype when the layout is not yet clear; it is not a separate phase
that blocks routine iteration.

When a requested interaction is unfamiliar or its expected behavior is
underspecified, investigate established patterns in comparable products before
choosing an interaction. Summarize relevant conventions and trade-offs briefly,
then follow this guide and the user's explicit direction; precedent informs a
design but does not override either.

Each UI behavior and state must be automatable. Before production UI code is
written, define focused automated tests for its acceptance behavior, including
keyboard and assistive-technology-relevant semantics; screenshots and manual
review support those tests but do not replace them.

This guide records both implemented UI and future product direction. Sections
marked **Current implementation** describe behavior present in the app; sections
marked **Planned direction** are aspirational and are not claims about shipped
screens. Treat a slice as current after implementation and validation.

## Design Philosophy

### Product character

Recipe Box is a private culinary archive: a place to collect and organize
publications and recipes, understand where a recipe came from, and return to it
when cooking. Its identity comes from trustworthy records, clear relationships,
and calm repeated-use workflows. The paper-and-ink treatment is a quiet surface
language, not a literal vintage theme or a substitute for useful structure.
Avoid both a faux kitchen aesthetic and a generic SaaS dashboard.

The main experience spans distinct but connected tasks: browsing the Library,
keeping unparented recipes in the Recipe Tin, reading a recipe, editing its
details, and maintaining account preferences. Make each task recognizable
without making every screen feel like a different product. Cooking is a core
use context; distinguish planned cooking features from behavior that has
actually shipped.

### Product-wide principles

- **Content leads.** Give the recipe, publication, or collection a clear page
  anchor. Keep navigation and actions available, but visually subordinate to
  the content being read or changed.
- **Keep provenance legible.** Show a recipe's publication, citation, or source
  link close to the recipe identity. Preserve the distinction between a source
  publication and the recipe itself; attribution supports the content rather
  than competing with it.
- **Optimize for scanning and return visits.** Use compact lists and tables for
  comparison, meaningful ordering, and stable visual alignment. Use a grid when
  covers or other object imagery help identify a publication, not as a default
  container for every section.
- **Make state and consequence clear.** Selection, saving, failure, deletion,
  and confirmation must have visible, accessible signals. A person should be
  able to tell what changed, what is still a draft, and what cannot be undone.
- **Favor continuity over novelty.** Reuse type, spacing, action placement, and
  control behavior across related screens. Introduce a distinct treatment only
  when the object or task has a meaningfully different role.

### Visual language

- Keep the light paper surface, subtle green ruling, and dark readable ink as a
  restrained foundation. Let content, typography, alignment, and whitespace do
  most of the organizing; color is a supporting cue, not the primary structure.
- Use the established palette by semantic role: leaf for constructive/source
  context, tomato for destructive or warning states, navy for selected
  structural emphasis, and gold for visible keyboard focus. Use neutrals and
  borders to balance these accents. Never make color the only indicator of
  meaning or state.
- Use DM Sans Variable for interface copy and controls. A restrained Georgia
  serif may anchor page titles; keep it out of dense data and form controls.
  Small caps are for short labels, not long passages.
- Use crisp, mostly square geometry with restrained borders. Reserve shadows
  for overlays that need separation. Avoid decorative gradients, glass effects,
  floating shapes, oversized rounded cards, and nested card layouts. The subtle
  ruled-paper texture is the exception to the otherwise flat surface treatment.
- Treat recipe photos and publication covers as useful content and identity,
  not as generic decoration. Do not add imagery that obscures the object a
  person needs to identify or inspect.

### Information hierarchy and density

- Size information to its role. Recipe and publication names lead; state,
  opinion, source, and other metadata are secondary and aligned for quick
  comparison. Keep bibliographic details factual and compact.
- Fit controls and columns to their content, then let related fields wrap. Give
  long names and URLs room to remain usable; do not stretch short values into
  empty space or force unrelated fields into equal-width tiles.
- Use semantic tables or lists when people compare repeated records. Keep page
  sections unframed. Use cards only for discrete objects whose boundaries add
  meaning, such as publication covers in a grid.
- Reading mode should translate stored structure into familiar recipe language
  (`1 1/2 cups flour`, `120 g flour`, `2 bunches cilantro`, `salt to taste`).
  Editing may expose fields and relationships; reading should not expose
  database-shaped mechanics without a user need.

### Interaction and state

- Put an object's routine actions near that object and keep related management
  actions together. Prefer direct, contextual interaction over duplicate
  toolbars or explanatory copy, but do not hide essential actions behind hover
  alone; touch and keyboard users need an equivalent path.
- Keep ordinary controls quiet and predictable. Use visible labels for fields,
  explicit text for consequential submission and deletion, and familiar icons
  only when their meaning is unambiguous. Every icon control needs an accessible
  name, visible focus, and a tooltip where pointer discovery requires one.
- Distinguish closing or canceling from deleting. Stage consequential changes
  when people need review; apply reversible collection edits immediately when
  the result and saving state remain clear. Keep failures recoverable and retain
  drafts when correction is expected.
- Make picklists, menus, and popovers anchored to their trigger, bounded by the
  viewport, dismissible, and operable by keyboard. Show active and selected
  states with more than color alone.
- Treat focus order, screen-reader naming, contrast, reduced-motion needs, and
  touch target size as part of the interaction itself, not as a finishing pass.

### Responsive anatomy

- Desktop supports sustained organization and comparison: keep primary
  navigation available, allow the navigation rail to scroll independently, and
  use aligned data-dense layouts where they improve scanning.
- Mobile is a distinct use context, not a narrower desktop. Keep navigation
  compact, recompose editing into focused single-column interactions, and keep
  overlays and dialogs inside the viewport. Preserve task order and meaning
  while changing layout.
- At every size, prevent page-level horizontal scrolling and layout shifts.
  Simplify secondary information before shrinking text or controls; give touch
  actions suitable hit areas without making dense data controls oversized.
- Design cooking interactions for interruption, glare, and one-handed use as
  those features ship. Do not present planned cooking behavior as current.

### Avoid

- Marketing-page composition, decorative imagery, or product feature narration
  in working views.
- Faux-vintage kitchen props, nostalgia costumes, generic dashboard grids,
  decorative gradients, glass effects, bokeh, and floating ornamental shapes.
- Dense field walls, repeated cards around ordinary content, oversized gutters,
  arbitrary equal-width controls, or text that repeats what the interface
  already communicates.
- A color-only hierarchy, hover-only actions, unlabeled fields, and motion that
  distracts from reading or changes layout unexpectedly.

### When details are unspecified

When details are unspecified, choose the smallest clear pattern that supports
the person's task and fits an established app convention. Check the result in
context with real content at desktop and mobile sizes. A visual refinement is
successful only when it preserves the product's information hierarchy,
keyboard and pointer operation, touch use, and assistive-technology behavior.

### Current interaction conventions

- Prefer a familiar icon for compact routine actions only when its meaning is
  clear. Give icon controls a screen-reader name, visible focus, and a tooltip
  when needed for pointer discovery. Use visible text for submission and
  deletion actions.
- In lists, a compact `x` may remove an item from that list; it never deletes a
  whole record. On a pane, `x` closes or cancels and does not mean delete.
- Keep form labels visible. Use an explicit, distinct action to open Trash; do
  not use a trash icon to mean both opening Trash and deleting an item.
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
- **A choice is not text selection:** Recipe multi-picklists use the dedicated
  `MultiPicklist` module and open a compact dropdown. Options are toggle buttons,
  not checkboxes or selectable text. One single- or multi-picklist menu is open
  at a time; Escape closes it and returns focus to the trigger.
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
and Equipment use the recipe-specific `MultiPicklist` module and a narrow
trigger whose width is reserved for the longest option including its checkmark,
so selecting or clearing an option cannot resize it. Standard triggers and
menus fit the longest entry plus 1mm, then add only required indicator and
border/padding space. The popup lists options vertically in configured order.
A selected option shows a checkmark and bold leaf-green text on a pale green
background; color is supplementary to the checkmark, never the only selection
signal. The picker does not display native checkboxes or blue text-selection
highlighting. Multi-select groups use fieldset/legend semantics and options
expose their pressed state.
Single- and multi-picklist labels share the same 13px bold typography. Trigger
text stays regular-weight whether selected or not, so neither control type
looks heavier by default.

Recipe metadata inputs, single- and multi-picklist triggers, Serves, Reason,
and Occasion Details remain 36px high on desktop and mobile, matching Name and
Publication. Multi-picklist options have a 30px minimum on desktop and 36px on
mobile. Keep component-time inputs compact; larger hit areas belong to distinct
actions, not these recipe-entry controls.

The visible single-choice prompt for Enthusiasm is “What am I feeling?” while
the field label remains “Enthusiasm.” Verdict order places Specific occasion
immediately before Once-a-year-rich and So-so. Reason is a single-line field.

## Recipe Relationships and References (Slice 11)

- On desktop edit, the Recipe Name field is at least 3 inches wide and grows
  with its text, like the Book Page(s) field. Cap it to the available form and
  viewport width; retain the full-row Name field on mobile.
- A selected Pairs With recipe appears in edit mode as a normalized `#slug`
  token, such as `#roast-chicken`. The saved display text and view-mode link
  label remain the readable recipe name.
- The desktop Pairs With input has a 3-inch minimum and ends at the right edge
  of the Rest time input. The desktop Reference field has a 3-inch minimum and
  a 50% row maximum; its Type column fits the picker.
- On mobile, the Reference Type column fits the picker instead of reserving a
  wider empty track. The field begins after the normal grid gap.

### Serves and times

Serves is one optional positive integer with no group heading. Equipment follows
it on the State row. Center the numeric text and label text for Serves and time
fields. The Serves input is 36px high on desktop and mobile, matching the
recipe picklist triggers.
Times are grouped under “Times (min)” and wrap naturally.
Each numeric input is sized to five characters or its visible label, whichever
needs more room, with 8px gaps. Total occupies its own final row, with a square
icon-only `Σ` button beside it and an accessible name and tooltip of “Calculate
total time.” On mobile, keep a 48px hit target around the visibly compact 30px
square. Hide numeric spinner controls; values are entered by typing. The
single-line Reason input remains 36px high, matching adjacent recipe fields.

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

Unit preferences are managed from Settings, not from a persistent navigation
shortcut. Settings uses a wide, unframed section layout rather than a compact
menu panel or card. The Personal preferences section contains labeled Volume
and Weight controls using the shared portal `Picklist`, with stable,
content-sized triggers and the existing save action and status. Do not add a
second preference form. Future settings domains become sections as their
features are implemented; do not display empty placeholder sections or links.
The private navigation keeps Settings, Trash, and Account. On desktop, place
Settings after Trash and before Account in the pinned sidebar. On mobile, show
icon-only links for Recipe Tin, Library, Trash, and Settings, with Settings
after Trash and before the Account control. Give each icon link a descriptive
accessible name and tooltip.

The account menu uses the same options everywhere. On desktop, show the account
email at the bottom of the pinned left navigation, after the Trash and Settings
utility links. On mobile, show a 48px circular initials button at the right of
the navigation. Both controls open the same account menu with the email and
Sign out action.

On mobile, rows wrap without horizontal page overflow. Visible input boxes stay
compact, while labeled rows, picklist triggers, popup options, standalone
actions, and compact inline action hit areas retain touch targets of at least
48px.

## Settings (Slice 14A)

### Current implementation

Settings appears in the private navigation on Recipe Tin, Library, and
Administration routes. The page uses a wide, unframed Personal preferences
section with a Units subsection containing labeled Volume and Weight controls
from the shared portal `Picklist`. The controls remain content-sized and 36px
high; their mobile tap areas expand to 48px without changing their visible
height. No compact panel, duplicate preference form, or Units shortcut appears
in the private navigation. Add later Settings domains as working sections when
their slices ship, not as empty placeholders.

Changing a Picklist saves that account preference immediately and announces the
save status. A failed save restores the last saved value. Picklist, ingredient,
catalog, tag, density, and data-management features are separate Settings
domains delivered by their later slices.

## Settings (Slice 14B)

### Current implementation

Recipe picklist management is collapsed by default behind an `Edit picklists`
toggle. Expanding it reveals a category selector, A-Z sort action, ordered
value list, and trailing category-labeled add input. Drag and keyboard reorder
preserve explicit ordering. Activating a value name edits it inline; Enter
saves, while Escape, outside click, or browser Back cancels. Merge and Delete
actions appear on row hover or focus and remain available on touch devices.

Merge combines one source with one selected counterpart. `Keep as` offers the
two values as exclusive choices; selecting or changing the counterpart clears
the keep choice, so Merge requires a deliberate selection. Delete reports
affected references and shows replacement or clearing controls when applicable.
On mobile, Merge and Delete panes are positioned above or below their row,
whichever has more room, and remain within the viewport. Merge uses a warm
autumn-orange accent for its controls.

## Settings (Slice 14C)

### Current implementation

The Ingredient catalog is a separate full-width, unframed section after Recipe
picklists. Both sections are collapsed by default. Their chevrons point right
when closed and down when expanded; only the label is underlined, with a
persistent underline on touch devices.

The catalog uses a left-aligned live search and an adjacent clear control. Its
names are normalized to title case and always shown alphabetically; there is no
manual sort or reorder action. The trailing Add ingredient affordance remains
available while filtering. With matching rows or no search, a labeled Add
ingredient field uses a compact icon-only submit button, not a duplicate text
button. When a search has no match, it offers to add the searched text with
trailing whitespace removed. Successful changes show a right-aligned status.

Ingredient names support inline rename and compact Merge and Delete actions.
The Merge pane follows the recipe picklist pane's warm autumn-orange design.
It requires a counterpart and an explicit `Keep as` choice for either
ingredient; changing the counterpart clears that choice. Before a counterpart
is selected, the second keep button reads `ingredient`. Mobile panes remain
viewport-bounded and appear above or below their affected row, whichever has
more room.

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
places. Slice 13 adds compact serving, multiply, and divide controls, account
unit defaults, and transient per-ingredient unit overrides. Print retains the
active scale and units while hiding the controls. Serves remains in recipe
metadata and updates only after scale submission. A field-height Scale icon
beside it opens a compact pane with Scale, To, Reset, Submit, and a top-right
close control. Escape or close cancels unsubmitted changes. Scale uses the
standard anchored picklist keyboard behavior. Reset restores base servings and
account-default units by clearing all transient ingredient overrides. Volume
and weight units stay
inline in natural recipe prose and open their own anchored picklist. Unit tokens
underline on hover on desktop and remain underlined on mobile.

### Planned direction

Slice 16 adds Ingredient-first presentation, ingredient sorting, and cooking
mode. The intended Standard reading layout places ingredients beside
instructions; the current detail page remains vertically stacked.

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
active recipe presentation; until Slice 16 introduces alternate reader views,
print uses the Standard presentation and retains Slice 13's active scale and
unit choices. The chosen presentation is a reader preference, not recipe data.

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

## Publication Editing

Publication detail shows the cover without an edit trigger. Its action row
places the square `Edit publication` pencil at the left and the compact Add
Recipe link at the right. The pencil has a 48px hit area, page-paper background,
leaf-green border matching Add Recipe, and visible focus. It
opens a native modal dialog, focuses the Name field, displays the fixed
publication type, and shows only the fields for that type. The edit pane places
the interactive cover image and its pencil beside Name. Name keeps the same
visible label and bordered input treatment as the other fields; allow 17px
between the cover button and field so the pencil's 5px overhang leaves 12px of
visible space. Other fields retain the established content-sized form layout.

Save and Delete remain visible text actions. Delete opens the publication
deletion confirmation; it replaces Cancel in the edit pane. Delete is
left-aligned and Save is right-aligned, with equal rendered widths on desktop
and mobile. At mobile widths both buttons retain 48px height and use 10px of
padding on every side. The top-right close control and Escape discard the draft
and return focus to the edit action; invalid data and version conflicts keep
the dialog open with an announced error and the draft preserved. The form
scrolls within the viewport without horizontal page overflow. Cover management
remains a separate interaction in the edit pane, bound to the same publication.

## Publication Cover Fallbacks

When a Book has no cover image, show a light-blue book-shaped rectangle with a
dark-blue border and italic title text sized to fit. When a Magazine has no
cover image, show a white magazine-shaped rectangle with a black border and
normal title text sized to fit. A saved cover replaces the fallback in the
publication detail and Explorer.

Publication covers are managed from the cover itself: in edit mode, the image
is a quiet clickable target with a lower-right pencil affordance and a
desktop-only hover border. Its management pane stages selection or removal
until the person submits; Cancel discards those pending changes. Device image
selection is available on desktop and mobile, while a separate camera action
is shown on mobile. The image, camera, and remove icons share a toolbar row
with Cancel and Submit right-aligned. Canceling the system picker leaves the
management pane open.

Recipe detail presents the first (default) photo before recipe content and
additional photos as a responsive thumbnail gallery. Edit mode opens photo
management from a camera action beside the recipe name. The pane has a
three-column mobile grid, immediate remove and reorder behavior, a
rounded muted-orange default outline and attached `Default` tab, two-dimensional
dragging, and Ctrl+Arrow keyboard reordering. Images are decorative and have
empty alternative text; do not add descriptions or captions. A dashed Add photo
tile shares the image-slot dimensions. At a 352px viewport, the management pane
is 328px wide. Each image slot is about 84px; the 19px column and 21px row gaps
make room for the overlaid 21px remove controls without horizontal or vertical
scrolling. The sizing is `(328 - 2 × 12 - 2 - 11 - 2 × 19) ÷ 3 ≈ 84px`,
accounting for the pane border, padding, and remove-control overhang.

On desktop, the pane heading and action status share a row, with status
right-aligned. Below, paste guidance sits left and the photo count right. On
mobile, action status is right-aligned opposite the left-aligned photo count.
Paste guidance is non-interactive text on desktop; on mobile it is a touchable
paste target explaining tap-and-hold. It is excluded from Tab navigation but
remains touch-focusable. The camera action shares the Name row and aligns right
on desktop; on mobile, it matches the Name field's height. The Add photo tile
and overlaid remove controls are the photo-management actions; there are no
extra per-image action buttons. On mobile, Add photo and Done share the bottom
row, with Add photo left and Done right.

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
acceptance screenshots, the object's action entry point, whether changes are
staged or immediate, keyboard and touch paths, system-picker cancellation,
and mobile geometry including overlaid controls. The current visual foundation
is a working direction, not a locked design system: DM Sans Variable, a light
paper surface with a subtle ruled texture, dark ink, navy, leaf green, tomato
red, and muted gold.
Refine typography, color, icon usage, and spacing as screens are designed; do
not treat these initial choices as final tokens.
