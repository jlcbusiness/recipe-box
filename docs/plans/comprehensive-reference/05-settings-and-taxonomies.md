# Recipe Box Comprehensive Reference: Settings and Taxonomies

[Back to the comprehensive reference index](../comprehensive-reference.md)

> Canonical product requirements: Picklists, ingredient catalog, tags, trusted
> densities, nutrition equivalents, preferences, Settings tabs, and
> account-menu destinations.

## 8. Settings, Taxonomies, and Picklists

Settings is a wide workspace organized by Preferences and Recipe data tabs for
all signed-in Users, with additional App admin and Updates tabs for Admins.
Each tab contains its implemented domains as full-width, unframed sections; do
not turn Settings into a compact menu or a grid of cards. Do not render empty
placeholder sections, tabs, or links for work that is not implemented.

### 8.1 Centralized Picklist Management

Picklist catalogs are managed in Settings to prevent duplicate, misspelled, or
orphaned options. The open recipe-editor menus for Equipment, Food Type, Meal
Type, and Cuisine have type-to-search suggestions. Focusing search shows the
ordered catalog, and typing filters it case-insensitively by substring. Food
Type remains a single-select editable combobox; the other three remain
multi-select menus with `aria-pressed` toggle buttons.

- Typing is draft-only. Escape or closing the menu discards unconfirmed text.
- A non-empty query that has no normalized exact match offers one explicit Add
  suggestion; typing or leaving unmatched text never creates a value.
- Confirming with Enter or the Add button trims outer whitespace, collapses
  internal whitespace runs to one space, preserves entered casing, and matches
  existing values case-insensitively within the signed-in account and category.
- A matching value is selected without creating a duplicate or changing the
  catalog revision. Otherwise, the server action uses the existing account-scoped
  picklist management function to append the value, increment its revision, and
  record `picklist.added` history.
- The new/reused catalog value is selected in the recipe draft; recipe
  assignments remain staged until the explicit Save recipe action. If adding
  the catalog value fails, the draft remains intact and an accessible error is
  shown. A confirmed catalog value remains manageable in Settings even if the
  recipe is later canceled or fails to save.

The managed catalogs are:

- **Picklists Managed:**
  - Ingredients (canonical ingredient names; each may carry a trusted density, see 8.2)
  - Food Types (single-select)
  - Meal Types (multi-select)
  - Cuisines (multi-select)
  - Equipment (multi-select)
  - Verdicts (single-select)
  - Enthusiasms (single-select)
  - Informal Units (extensible non-standard units; Pinch and Dash are not seeded)
  - Unmeasured Phrases (extensible approved phrases)
  - Tags (general categorization)
- **Picklists Actions:**
  - **Add:** Create new option.
  - **Edit:** Rename an option inline in the ordered list. Enter saves; Escape,
    an outside click, or browser Back cancels.
  - **Delete:** Remove option. If the option is in use, the user must choose a replacement option, which behaves as a
    merge. Optional fields may alternatively be explicitly cleared on affected records. A referenced ingredient requires
    a replacement because a recipe row cannot exist without one; an unused ingredient can be deleted directly.
  - **Merge:** Combine exactly two values in one operation: choose a source and
    counterpart, then explicitly choose which value to keep. Choosing or
    changing the counterpart clears the keep choice, and Merge stays disabled
    until the user makes that choice. Protected values cannot be merged.
- **Ordering:** Recipe picklist values keep a user-defined order used for display and sorting. The ingredient catalog is
  a distinct case: its visible list is always alphabetical, with no manual sort or reorder control.
- **Seeding:** New accounts start with the example values listed in section 2.1 for each picklist, in the order listed.
  Time Type starts with Prep, Mixing, Marinate, Chill, Freeze, Cook, Bake,
  Cooling, and Rest. All values are editable. `Specific occasion` in Verdict
  and Enthusiasm is protected: it can be renamed but not deleted.
  or merged, because it reveals Occasion Details.

#### Ingredient catalog

The Ingredient catalog is a separate Settings section after Recipe picklists.
It is account-scoped and searchable. Typing filters the visible alphabetized
list without clearing the query after an action; a clear button resets it. A
search ending in whitespace matches the complete query as a whole word. The Add
ingredient affordance remains visible while searching, and when a non-empty
query has no match it offers to add that query after removing trailing
whitespace. The labeled Add ingredient field uses a compact icon-only submit
button, without a redundant text button; successful changes show a right-aligned
status message.

Added and renamed ingredient names are trimmed and normalized to title case.
Names are unique per account after trimming and case-folding. Merge chooses a
counterpart and then requires an explicit `Keep as` choice for either value.
Changing the counterpart clears the keep choice, and Merge stays disabled until
the person chooses again. Merge moves recipe rows to the retained canonical
ingredient without combining duplicate rows, changing row IDs, or detaching
measurements, Main flags, specifics, preparation, or instruction mentions.
Deleting a referenced ingredient requires a replacement; an unused ingredient
can be deleted without one.

The `Edit picklists` and `Ingredient catalog` sections are collapsed by default.
Each disclosure has a left-side chevron that points right while closed and down
while open. Underlining applies to the label, not its chevron, and is persistent
on touch devices. The Recipe picklists ordered list supports drag and keyboard
reorder, inline rename, and a trailing category-labeled add input. Ingredient
and tag search fields place the magnifying-glass icon at the trailing edge and
keep the clear `x` outside the field. Their add affordance is italicized
`add {thing}` text: clicking it or pressing Enter creates the unmatched
trimmed search term, while Escape cancels the pending add. Do not show a
separate `+ Add [thing]` action. On mobile, Merge and Delete panes appear above
or below the selected row, whichever has more room, and remain within the
viewport instead of taking over the screen.

#### Tags

Tags have a separate full-width Settings section after Ingredient catalog,
using the same section spacing and rule treatment. Its left-side disclosure
chevron follows the shared right-when-closed/down-when-open convention. The
alphabetical list shows up to eight tags before scrolling. Names are trimmed,
preserve entered casing, and are unique per account after case-folding, with a
160-character maximum. Each tag uses one of 16 fixed, translucent pastel colors
for visual distinction only; tags remain flat and have no hierarchy or manual
ordering. Revision-checked catalog changes have append-only history, including
recoloring.

Add and search use the Ingredient catalog's shared pattern. A no-match search
offers an italicized `add {tag}` action; click or Enter creates the trimmed
query, and Escape cancels it. Keep the clear `x` outside the search field and
the magnifying glass at its trailing edge. Inline rename stays with the list.
Merge and Delete use the established accessible row panes, bounded to the
viewport on mobile. Color editing opens a matching pane with the 16 swatches in
a 4-by-4 grid. Use the Ingredient catalog's spacing treatment between search,
list, and add affordances.

Recipe and publication forms provide a searchable multi-select that reuses a
case-insensitive catalog match or creates the typed tag inline. The compact
italic `add tag` affordance opens an approximately one-inch input that grows
only enough to fit entered text and wraps with the selected chips. Inline
creation updates the catalog immediately and records catalog history; the
selected assignment remains a form draft until the recipe or publication is
saved. Leaving a form after creating a tag can leave an unused catalog entry,
which can be deleted in Settings. Removing a selected chip only changes that
entity's draft assignment.

Settings owns global rename, pairwise merge, delete, and recolor. Recoloring
updates every recipe and publication chip that uses the tag without changing
entity assignment versions. Merge requires a deliberate survivor choice;
deleting a tag in use requires a replacement and performs the same assignment
transfer transactionally. An unused tag can be deleted directly.

Private detail views show selected tags as alphabetized text chips with
translucent pastel fills and borders; text remains readable and color is not
the only cue. Recipe detail keeps its Print/Edit action line immediately after
the tags, with matching vertical spacing, even when the recipe has no assigned
tags. Publication detail omits the tag line when unassigned. Recipe and
publication history snapshots include tag IDs, names, and color keys. Public
recipe payloads do not include tags. Query filtering and cross-record tag
search belong to Slice 17.

### 8.2 Trusted Densities

Located in Settings as a separate, collapsed-by-default **Trusted densities**
section after Ingredients and before Tags, with matching disclosure spacing and no divider:

- Searchable, alphabetized list of canonical ingredients with configured
  densities, with an inline editor and confirmed removal.
- Defines one positive Volume/Weight reference pair per ingredient using the
  standard quantity and unit controls (e.g., `1 cup = 120 g` for all-purpose
  flour; `1 cup = 200 g` for granulated sugar). The displayed density is
  normalized from the reference pair.
- Search can offer the top matching catalog ingredient without a density; the
  add flow can select only existing canonical ingredients and cannot create
  one.
- Configuration changes do not rewrite saved recipe amounts. See the
  [Slice 15 brief](slices/15-trusted-density.md) for the data, concurrency, and
  interaction contract.

### 8.3 Nutrition and Measure Equivalents

Settings' Ingredient catalog offers a compact **Nutrition** action per
canonical ingredient. Its shared Nutrition pane has serving size, Calories,
core label nutrients, and an **Add vitamin/mineral** chooser. Saving updates
the User's ingredient Settings profile; Cancel discards the pane draft;
Clear removes the profile. No external nutrition service is contacted.

A separate **Measure equivalents** action records a User-entered average
Volume and/or Weight for one Count or one selected Things unit of that
ingredient. Its one-unit basis is explicit. Only one Count-or-Things mapping
is allowed per ingredient. Settings shows explanatory copy that nonstandard
amounts are estimates supplied by the User. It does not replace the
volume/weight Trusted Density feature. When trusted density exists, the
explicitly saved equivalent dimension is the source and density derives the
other dimension; a legacy two-dimension equivalent uses Weight as its
compatibility source until edited. Without density, each saved dimension is
explicit. Reader switching is transient and private. Recipe nutrition uses
this same resolution rule, including for public recipe-level results, without
exposing the underlying Settings data.

In the recipe editor, each ingredient's Nutrition action opens the same pane.
The current Settings profile and equivalent are loaded when the editor opens
and populate untouched fields; refresh an open editor after changing Settings
elsewhere. Edits are recipe-only and apply when the recipe is saved. Clearing a
recipe override releases it to the current Settings default. Basis changes mark
affected manual values stale; the Nutrition section explains when stale values
block automatic calculation.
The recipe-level Nutrition pane requires positive Serves and edits per-serving
values. It scales manual edits to full-recipe totals when saved; untouched
fields remain derived.

### 8.4 Personal Preferences

Located in Settings, per account:

- Default ingredient presentation: Standard or Ingredient-First (4.1).
- Default unit system for volume and, separately, for weight: US customary,
  Metric, or Recipe (3.5).
- Ingredient mention style (5.1).
- Mobile hand preference: Left or Right.

Volume, Weight, and View appear as labeled Personal preferences controls without
a Units heading. View selects Standard or Ingredient-first presentation. Volume,
Weight, and View use the shared portal `Picklist`; the private navigation has
no Units shortcut. On mobile, a Hand preference selects Left or Right and
reverses the compact navigation icon order for Right-handed use; it is not
shown on desktop. Find's mobile Search and Query result group uses View, Sort,
direction, Choose columns for Left hand, and mirrors it to Choose columns,
direction, Sort, View at the right for Right hand. Details omits Sort and
direction. Visual and keyboard order agree; text and icons are not flipped.
Desktop and other explorer toolbars are unchanged.
On mobile, keep 16px between preference groups and between the Hand label and
its buttons, matching the spacing between unit rows. Preserve the first
group's existing offset.
Visible preference controls are 36px high; Picklist hit areas
expand to at least 48px on mobile. The controls are keyboard operable, display
save status, and never offer public or cross-account preference changes.

### 8.5 Settings Tabs

The authenticated `/settings` page keeps its existing Preferences and Recipe
data tabs for every signed-in User. The former Account & data tab is removed:
Username and App data are separate authenticated pages linked from the
Account menu, while App admin and Updates are added to Settings only for
Admins.

| Tab                         | Sections                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Preferences**             | Personal preferences; Recipe column order                                                                  |
| **Recipe data**             | Recipe picklists; Ingredient catalog, including nutrition and measure equivalents; Trusted densities; Tags |
| **App admin** (Admins only) | Invitations and account administration                                                                     |
| **Updates** (Admins only)   | The global administrative Updates tracker                                                                  |

Preferences is selected by default. The `tab` query parameter accepts
`preferences`, `recipe-data`, `app-admin`, or `updates`. A valid value selects
the matching tab on direct navigation and reload for an Admin. A non-admin
cannot render either admin tab, even when requesting its query value. Missing
or invalid values select Preferences. Tab changes replace the current URL
entry, preserve other query parameters, and do not add one browser-history
entry per switch.

Tabs use the semantic tablist pattern with one selected tab, roving focus, and
Left/Right, Home, and End keyboard navigation. Activating a tab immediately
shows its panel. Keep all panels mounted so switching tabs preserves local
drafts; hide inactive panels from keyboard navigation and assistive technology.

Preserve Settings' existing tab presentation and responsive no-overflow
behavior. All four labels must fit and remain readable on mobile; do not rely
on the removed two-line Account & data label to size the admin tabs. Keep hit
areas at least 48px high, with visible focus and the existing design tokens.
Use the first section's top border as the single divider below the tabs,
aligned directly with the tab row without an additional row border or
first-section gap. Keep subsequent section dividers and spacing. The change
does not alter section save timing, validation, authorization, queries, or
workflows.

### 8.6 Account menu destinations

The Account menu keeps the signed-in email and Sign out action and provides
**Username** and **App data** links to standalone authenticated pages:

- `/account/username` manages the public attribution name. Keep the existing
  username validation, uniqueness, save status, and publication-attribution
  explanation; the page and field are named Username.
- `/account/app-data` provides the existing Data management workflows:
  account reset, database export, and database import. Preserve export
  reminders, reset reauthentication and recovery, and import/export behavior.

Do not embed these workflows in the Account menu or place them in Settings.
Admins do not receive a separate Administration link in the Account menu;
admin-only tools are the App admin and Updates Settings tabs. Both account
pages retain the existing authenticated-user boundary and private shell.

---
