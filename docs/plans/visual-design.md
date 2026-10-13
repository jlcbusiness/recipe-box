# Recipe Box Visual Design Guide

## Table of Contents

- [Recipe Box Visual Design Guide](#recipe-box-visual-design-guide)
  - [Table of Contents](#table-of-contents)
  - [Quick Links](#quick-links)
  - [Purpose](#purpose)
  - [Design Philosophy](#design-philosophy)
    - [Product character](#product-character)
    - [Product-wide principles](#product-wide-principles)
    - [Visual language](#visual-language)
    - [Information hierarchy and density](#information-hierarchy-and-density)
    - [Interaction and state](#interaction-and-state)
    - [Responsive anatomy](#responsive-anatomy)
    - [Avoid](#avoid)
    - [When details are unspecified](#when-details-are-unspecified)
    - [Current interaction conventions](#current-interaction-conventions)
  - [Recipe Metadata Entry (Slice 4)](#recipe-metadata-entry-slice-4)
    - [Guiding concepts](#guiding-concepts)
    - [Picklist behavior](#picklist-behavior)
  - [Recipe Relationships and References (Slice 11)](#recipe-relationships-and-references-slice-11)
    - [Serves and times](#serves-and-times)
    - [Recipe list, detail, and headings](#recipe-list-detail-and-headings)
    - [Account menu](#account-menu)
  - [Settings (Slice 14A)](#settings-slice-14a)
    - [Current implementation](#current-implementation)
  - [Settings (Slice 14B)](#settings-slice-14b)
    - [Current implementation](#current-implementation-1)
  - [Settings (Slice 14C)](#settings-slice-14c)
    - [Current implementation](#current-implementation-2)
  - [Settings (Slice 14D)](#settings-slice-14d)
    - [Design contract](#design-contract)
  - [Trusted Density (Slice 15)](#trusted-density-slice-15)
    - [Settings and editor behavior](#settings-and-editor-behavior)
  - [Desktop](#desktop)
    - [Current implementation](#current-implementation-3)
    - [Product direction](#product-direction)
  - [Mobile](#mobile)
    - [Current implementation](#current-implementation-4)
    - [Planned direction](#planned-direction)
  - [Ingredient Presentation](#ingredient-presentation)
    - [Current implementation](#current-implementation-5)
    - [Planned direction](#planned-direction-1)
    - [Trash and baseline print (Slice 8 current implementation)](#trash-and-baseline-print-slice-8-current-implementation)
  - [Publication Editing](#publication-editing)
  - [Publication Cover Fallbacks](#publication-cover-fallbacks)
  - [Find Recipes (Slice 17)](#find-recipes-slice-17)
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
- [Slice 17: Find recipes](slices/17-find-recipes.md) for search and explorer
  behavior.

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

Recipe Box is a private culinary archive for collecting recipes and
publications, preserving where recipes came from, and returning to them in the
kitchen. Its character comes from reliable records, visible relationships, and
thoughtful tools for repeated use. The paper-and-ink surface gives the archive
a quiet identity; it is not a vintage costume, a feed, or a generic dashboard.

The product connects distinct jobs: browse the Library, maintain the Recipe
Tin, read and edit a recipe, manage shared vocabularies, and configure personal
preferences. Keep these jobs recognizable within one visual language. Cooking
informs decisions about readability and touch, but planned cooking features
must not be described as shipped behavior.

### Product-wide principles

- **Lead with the record.** Make the recipe, publication, or collection the
  visual anchor. Keep navigation and routine actions available without letting
  application chrome compete with the content.
- **Keep provenance close.** Place a recipe's publication, citation, or source
  link near its identity. Make the source relationship easy to understand
  without confusing a publication with the recipe itself.
- **Make density legible.** Support quick comparison with compact aligned lists,
  tables, and metadata, but give meaningful values room to read. A grouped
  quantity, a familiar fraction, a unit pair, or a density-derived amount should
  remain understandable at a glance.
- **Show structure when editing; use natural language when reading.** Forms may
  expose measurements, relationships, and provenance as separate controls.
  Recipe reading should turn those records into familiar cooking language, not
  expose the underlying data model.
- **Make state and consequence visible.** Keep draft, saved, derived, overridden,
  selected, primary, and destructive states distinguishable. Do not make a
  visual refinement depend on color alone or imply that an unsaved change has
  already persisted.
- **Keep temporary state temporary.** Keep saved preferences, recipe data, and
  reader-only state distinct. Make persistence scope clear; a temporary
  presentation, sort, or cooking check-off must not silently update the recipe.
- **Keep personal metadata lightweight.** Tags are a flat, reusable descriptive
  layer, not a hierarchy or workflow state. Keep their names and colors
  subordinate to the recipe or publication.
- **Preserve user agency.** Calculations and conversions should be explicit,
  understandable, and correctable. Never silently replace a saved measurement
  or hide whether a value was derived or entered by the person.
- **Treat device capabilities as enhancements.** An unavailable or denied
  optional API should not block the core task. Report the actual capability
  state and keep the primary interaction usable.
- **Prefer continuity with purpose.** Reuse spacing, typography, action
  placement, and control behavior across related tasks. Give imagery or a
  distinct treatment a role only when it helps identify content or complete an
  action.

### Visual language

- Use the light paper surface, subtle green ruling, and dark readable ink as a
  restrained foundation. Let typography, alignment, and whitespace organize
  the page; use color to reinforce meaning, not to build the hierarchy alone.
- Use the established palette by semantic role: leaf for constructive or source
  context, tomato for destructive or warning states, navy for structural
  emphasis, and gold for visible keyboard focus. Balance accents with neutrals
  and borders. Tag colors may distinguish names, but must not imply taxonomy or
  importance.
- Use DM Sans Variable for interface copy and controls. A restrained Georgia
  serif may distinguish page titles or a compact editorial value such as a
  density expression; keep serif styling out of dense controls. Reserve small
  caps for short labels.
- Favor crisp geometry and restrained borders. Use shadows only when an overlay
  needs separation. The ruled-paper texture is a quiet surface detail, not an
  excuse for gradients, glass effects, ornamental shapes, or nested cards.
- Treat recipe photos and publication covers as informative content. Show the
  actual image when it helps identify the record, preserve its useful content,
  and keep edit affordances visually distinct from the image itself.

### Information hierarchy and density

- Let recipe and publication names lead. Align state, opinion, source, and other
  secondary facts so people can scan and compare without losing context.
- Fit controls and columns to their content, then let related fields wrap.
  Give long names and URLs room to work; do not stretch short values into empty
  space or force unrelated controls into equal-width tiles.
- Use semantic tables or lists for repeated records. Keep ordinary page
  sections unframed; reserve cards for discrete objects whose boundary helps,
  such as publication covers in a grid.
- Format numbers for quick reading without obscuring their meaning. Use
  familiar fraction and range notation, group large values, and keep units
  attached to their quantities. Give derived values enough room to remain
  readable beside their state cue.
- In reading mode, translate stored structure into familiar recipe language
  (`1 1/2 cups flour`, `120 g flour`, `2 bunches cilantro`, `salt to taste`).
  Editing may reveal labels and relationships; reading should stay focused on
  the recipe.

### Interaction and state

- Put routine actions near the object they affect and keep related management
  actions together. Do not make essential actions hover-only; provide a clear
  pointer, keyboard, and touch path.
- Keep inline add affordances quiet until activated, then fit them to their
  content. Keep contextual actions with wrapping content when that improves
  association, without compromising alignment or touch targets.
- Keep ordinary controls predictable. Use visible field labels, explicit text
  for consequential save and delete actions, and icons only when their meaning
  is familiar. Icon controls need accessible names and visible focus; add a
  tooltip when pointer users need clarification.
- Distinguish canceling from deleting and staged changes from immediate ones.
  Make confirmation, progress, success, and recoverable errors clear. Preserve a
  draft when a person needs to correct a failed save.
- Make menus and popovers anchored, viewport-bounded, dismissible, and
  keyboard-operable. Show focus and selection through more than color, and
  restore focus sensibly when an overlay closes.
- Treat focus order, screen-reader status, contrast, reduced motion, and touch
  targets as part of the interaction itself, not as a finishing pass.

### Responsive anatomy

- Desktop supports sustained organization and comparison. Keep primary
  navigation available and use aligned, data-dense layouts where they improve
  scanning and editing.
- Mobile is a distinct use context, not a shrunken desktop. Keep navigation
  compact, recompose editing into focused interactions, and keep dialogs and
  popovers within the viewport while preserving the task's order and meaning.
- Keep visible controls compact where information density matters, while
  preserving generous hit areas for touch actions. At every size, prevent
  page-level horizontal scrolling, overlap, and layout shifts.
- Design kitchen-facing work for interruption, glare, and one-handed use as
  those features ship. Do not present planned cooking behavior as current.

### Avoid

- Marketing-page composition, feature narration, or decorative imagery in
  working views.
- Faux-vintage kitchen props, generic dashboard grids, ornamental gradients,
  glass effects, bokeh, and floating decorative shapes.
- Dense field walls, repeated cards around ordinary content, oversized gutters,
  arbitrary equal-width controls, or text that repeats what the interface
  already communicates.
- Cropping meaningful recipe imagery merely to fill a slot, or using color as
  the only signal for selection, derivation, warning, or importance.
- Hover-only actions, unlabeled controls, tiny touch targets, and motion that
  distracts from reading or changes layout unexpectedly.

### When details are unspecified

Choose the smallest clear pattern that supports the task and fits established
product behavior. Check it with realistic content on desktop and mobile. A
refinement succeeds only when it preserves information hierarchy, data meaning,
keyboard and pointer operation, touch use, and assistive-technology behavior.

### Current interaction conventions

- Use a familiar icon for a compact routine action only when its meaning is
  clear. Give it an accessible name, visible focus, and a tooltip when useful.
  Use visible text for consequential submission and deletion.
- In a list, a compact `x` may remove an item from that list, but never deletes
  the whole record. On a pane, `x` closes or cancels; it does not mean delete.
- Keep form labels visible. Opening Trash and deleting a record are distinct
  actions and must not share an ambiguous trash icon.
- Custom picklists use compact triggers and anchored listboxes. Keep the active
  keyboard option visible, bound the popup to the viewport, and show selection
  without relying on color alone.
- Treat popovers and menus as parts of the workflow, not floating decoration:
  give them a clear anchor, controlled height, explicit dismissal, visible
  focus, and no page-level horizontal overflow.
- Keep reading mode calmer than editing mode. Editing may show labels, field
  structure, and pickers; reading should reduce those mechanics to concise,
  natural language.

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
Times are grouped under “Times (min)” and wrap naturally. Each numeric input is
sized to five characters or its visible label, whichever needs more room, with
8px gaps. Total occupies its own final row, with a square icon-only `Σ` button
beside it and an accessible name and tooltip of “Calculate total time.” On
mobile, keep a 48px hit target around the visibly compact 30px square, aligned
with the Total Time input and without extra visible horizontal spacing beyond
the neighboring field gap. Serves and time values use comma grouping for
thousands; time inputs accept valid grouped integers and normalize their display
on blur. Hide numeric spinner controls; values are entered by typing. The
single-line Reason input remains 36px high, matching adjacent recipe fields.

### Recipe list, detail, and headings

On desktop, the recipe list shows Name, Food Type, State, and an Opinion column
for the active Enthusiasm, Verdict, or Reason. On mobile, it shows Name and
Opinion. Recipe detail follows the edit-form order but uses a distinct view
order: State and its active response, Occasion Details when present, Serves,
Total Time, Equipment, Food Type, Meal Type, Cuisine, remaining times, then
Notes. On desktop, Food Type, Meal Type, and Cuisine share their own full-width
row. Private recipe detail places alphabetized tag chips and compact Print/Edit
actions in one wrapping tag line beneath the heading. Print and Edit follow the
chips with compact spacing rather than being pushed to the far edge; retain this
action line when the recipe has no tags. Give the line vertical margins
matching the action spacing. Both controls expose descriptive accessible names
and tooltips. Their visible buttons are 36px square; on mobile, their hit areas
expand to 48px without changing their visible size. Do not repeat Recipe Tin as
a page breadcrumb or attribution when the selected navigation item already
names the Recipe Tin.
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

## Settings (Slice 14D)

### Design contract

Tags use a separate full-width, unframed Settings section after Ingredient
catalog. It is collapsed by default, uses the same left-side disclosure chevron
as Ingredient catalog and Recipe picklists, and lists trimmed, case-preserving
names alphabetically. The list shows up to eight tags before scrolling. Reuse the
Ingredient catalog's search, add, and spacing treatment: place the search icon
at the field's trailing edge and keep its clear `x` outside the field. When a
search has no match, offer an italicized `add {tag}` action that creates the
trimmed query by click or Enter; Escape cancels that pending add. Do not add a
separate `+ Add tag` action. Inline rename sits with the list. Merge and Delete
use the established accessible row panes; color editing uses the same pane
pattern with a 4-by-4 grid of 16 translucent pastel swatches. Recoloring in
Settings updates the tag everywhere. There is no manual ordering or hierarchy.

Recipe and publication create/edit forms expose a labeled searchable
multi-select. Suggestions rank prefix matches before substring matches, with
case-insensitive alphabetical order within each group. The compact italic
`add tag` affordance opens an approximately one-inch input; it grows only enough
to fit entered text and wraps on the same line as selected chips. A typed name
can be created or reused inline. Selected chips include a local remove control;
removing one edits only the entity draft. A newly created catalog tag is saved
immediately, while its assignment is committed with the entity's explicit
Save. Private detail views place alphabetized chips beneath the entity heading,
using translucent pastel fills and borders with readable text. Chips are text,
not links. Publication detail omits its tag line when no tags are assigned;
recipe detail retains its tag/action line for Print/Edit controls after the chips.
Public recipe views continue to omit tags. On mobile, the Settings palette
stays within its content width and remains operable without horizontal overflow.

## Trusted Density (Slice 15)

### Settings and editor behavior

Trusted density is a separate full-width Settings disclosure after Tags,
collapsed by default. Configured densities appear in a searchable, alphabetized
table with understated alternating rows and a scroll limit of about eight
entries. Each row shows the canonical ingredient and a serif equivalency such as
`1 cup / 242 g - 1.023 g/mL`. Clicking the ingredient opens its Volume and Weight
controls inline; the normalized density preview updates as either amount or
unit changes.

Search filters configured rows and offers `Add density for [ingredient]` for
the top matching catalog ingredient that does not yet have a density. The italic
`Add density` action below the table opens an inline ingredient search limited
to the existing catalog. Enter advances from Volume amount to Weight amount and
saves from the final amount; Tab keeps its normal focus order, Escape cancels,
and clicking away saves a valid draft. Removal remains a separate confirmed
action. Density changes do not rewrite saved recipe amounts.

In the recipe editor, a valid amount for a canonical ingredient can derive its
missing Volume or Weight counterpart. The derived amount keeps the selected
target unit and exact numeric value for save, even when its visible formatted
quantity is rounded. Its amount field receives a restrained leaf tint and a
compact calculator icon; an associated screen-reader status announces `Derived
from density`. Editing the counterpart makes it manual; clearing it and leaving
the field derives it again. Source amount and unit changes update only a
session-derived counterpart, invalid sources clear only that derived value, and
ingredient changes replace an old derived value using the newly selected
ingredient's density. Saving persists ordinary measurements; reopening treats
them as manual values.

Desktop retains the aligned one-line Volume/Weight controls. Derived amount
inputs grow with their content, including ten-digit values, while staying within
the amount group and clear of the unit picker. Mobile density rows stack the
ingredient and equation; inline amount/unit groups reflow without page-level
horizontal overflow. The mobile recipe row popover uses the same derivation
behavior and accessible status.

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

Recipe detail places the ingredient list beside instructions, with related
recipes (Pairs with) and notes below. The Library uses List and Grid views with
a compact Type picklist, a direct icon View toggle, a Sort by menu, and a
separate Sort direction button. The View icon represents the current mode and
its accessible name identifies the destination mode. The Type button stays
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

Cooking mode is implemented; see [Ingredient Presentation](#ingredient-presentation)
for its current behavior. Future kitchen-facing features should prioritize
interruption tolerance, legibility, and one-handed operation.

## Ingredient Presentation

### Current implementation

Recipe detail offers Standard and Ingredient-first presentations. Standard
keeps ingredient rows in saved order and renders Amount, lowercase Specifics
and ingredient name, then Preparation. Both presentations keep Ingredients
beside Instructions on desktop; mobile keeps the sections in a vertical flow. The desktop reader
initializes from the saved account default, while mobile starts
Ingredient-first. A reader's explicit change is transient. Ingredient-first
uses a semantic table with Ingredient, Volume, Weight, and Preparation
columns. Count, informal, and unmeasured values span the Volume and Weight
columns; Volume and Weight remain separate when present. Specifics display
indented and fully lowercase beneath the ingredient name. Cells are
left-aligned with no more than 3mm between columns on desktop and 1mm on
mobile. Mobile headers shorten to Vol, Wt, and Prep.

Compact Presentation, Sort, Scale, and device wake-lock icon buttons match the
Add reference and Add pairing controls: 36px high, with their existing widths
retained. The toolbar shares the first heading line with Ingredients and orders
the controls as sort direction, Sort, Presentation, Scale, and Screen Lock. The
lowercase, normal-size italic summary sits below the heading with its vertical
spacing below the subtitle, and reflects the current presentation and sort,
for example `first, alphabetical`. When the screen wake lock is active, the
summary adds `screen lock on`. Wake-lock failure and release warnings appear in
a popup anchored to the Screen Lock control, without adding a line to the page.
Each click cycles to the next presentation or
sort mode and updates the icon; accessible names and tooltips announce the
current and next modes. The ascending/descending button has a reserved slot to
the left of Sort. Sort cycles through instruction mention,
alphabetically, by size, and entered order. Alphabetical and size comparisons
support ascending and descending direction; sorting never changes saved
ingredient positions. By Size uses a number-sign icon, keeps measurement
groups in their defined order, and uses Volume when a row has both Volume and
Weight.

Cook mode is an icon-only switch with a device-and-lock glyph, temporary
ingredient check-off, and a screen wake-lock request when supported. Check-off
remains available if the request is unavailable or rejected; the polite status
reports the actual wake-lock state and its warning can be dismissed. In
Ingredient-first, active cook mode adds an unlabeled checkbox column before the
Ingredient column. Exiting mode or changing recipes clears check-off, and
system-released locks can be reacquired when the document becomes visible.

Unit can display volume, weight, or both with ` / ` separating the dimensions.
Things pluralize from their maximum range value; `cup` becomes `cups` above one
while abbreviated fixed units remain unchanged. US customary quantities use
familiar fractions when close to halves, thirds, quarters, or eighths; metric
quantities never use fractions and display at most two decimal places. Scaling
controls retain the active scale and unit choices for print. Serves stays in
recipe metadata and updates only after scale submission. The Scale icon is in
the Ingredients toolbar and opens a compact pane with Scale, To, Reset when the
value differs from its base, a filled Submit button, and a top-right close
control. The integer field is centered and has no spinner arrows. Escape or
close cancels unsubmitted changes; Scale uses the standard anchored picklist
keyboard behavior. Reset restores base servings and account-default units by
clearing all transient ingredient overrides. Volume and weight units stay
inline in natural recipe prose and open their own anchored picklist. Unit
tokens underline on hover on desktop and remain underlined on mobile. Print
follows the active presentation and hides reader controls and check-off state.
The saved presentation is an account preference, not recipe data.
Ingredient-first remains the required default for public share in Slice 20.

### Planned direction

Instruction ingredient mentions default to bold dark red so linked ingredients
are easy to scan. User Settings offers a dedicated styling configuration:

- A palette of accessible preset colors (dark red, forest green, navy blue,
  amber/brown, charcoal/default text).
- Independent toggle checkboxes for bold, italic, and underline (any combination).
- Color presets are tested to ensure $\ge 4.5:1$ contrast against the app background.

Public and printed recipes will use the default bold dark-red styling.

### Trash and baseline print (Slice 8 current implementation)

- Recipe detail places Print and Edit immediately after the tags, not beside
  the title or pushed to the far edge. The action-bearing line remains when no
  tags are assigned;
  both controls retain 48px mobile hit areas around their 36px visible buttons.
  In edit mode, a standard 48px icon-only `x` with a 24px icon in the header
  returns to view. Delete remains a separate text action below it and is not
  placed beside the detail actions or on recipe-list rows.
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

Recipe detail presents the first (default) photo centered before recipe content,
preserving its aspect ratio and capped at 1.5 inches high; additional photos
appear as square thumbnails. In edit mode, the action beside the recipe name
shows the primary photo contained in a compact thumbnail with a corner pencil,
or a camera icon when no photo exists, and opens photo management. The pane has a
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

## Find Recipes (Slice 17)

### Current implementation

The global recipe search and publication-scoped recipe results share the same
List and Grid presentation. The publication List retains its seven fields;
global recipe search uses its selected recipe columns. On desktop, headers are
16px, sentence case, left-aligned, and aligned with their values. The header
has no zebra fill. Publication data rows alternate a subtle leaf tint against
the neutral table surface, starting with a tinted first recipe row; the fill
spans the full row. Recipe links stay regular weight and underline on desktop
hover or keyboard focus. On mobile, the table header is hidden, the recipe
name occupies its own first line, and the remaining labeled fields wrap
without horizontal page scrolling.

Grid uses 234px-high desktop cards and content-sized mobile cards. Alternate
desktop and mobile card surfaces between a subtle leaf tint and white, with a
shared restrained shadow. Show the actual default recipe photo without
cropping it; keep its 144px image area transparent and the recipe title visible
directly below. In publication Grid, state and total time share one compact
metadata row so the image, title, and metadata each retain their own layout
space. Preserve the same result data between List and Grid. On desktop, card
titles underline on hover or keyboard focus.

## Accessibility And Interaction

Use semantic controls, visible focus, readable contrast ($\ge 4.5:1$),
keyboard-operable controls, and touch-sized mobile targets. Do not depend only
on color: density-derived values use a tinted amount field and visible
calculator icon, with an associated screen-reader status that announces
`Derived from density`. Provide clear empty, loading, error, confirmation, and
destructive-action states in every implemented UI slice.

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
