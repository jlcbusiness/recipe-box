# Recipe Box Comprehensive Reference Guide

## Purpose

This document is the definitive master reference for the Recipe Box application, capturing every concept, requirement,
UI behavior, field specification, visual metaphor, and decision established across the planning discussions and
subsequent implementation refinements.

It serves as the exhaustive encyclopedia for implementation slices, slice briefs, and technical specifications. Where
high-level documents (`first-draft-spec.md`, `data-model.md`,
`design-philosophy.md`, `visual-design.md`, `delivery-roadmap.md`) provide
concise rules, this document provides the complete context, background rationale,
and granular specifications.

**This is the master document.** The other planning documents summarize it and must defer to it. If they disagree, this
document wins and the other document is corrected. Read `first-draft-spec.md` first for orientation, then open only the
sections of this reference that the current work needs.

---

## Table of Contents

1. [Product Vision and Paradigm](#1-product-vision-and-paradigm)
2. [Recipe Card and Metadata](#2-recipe-card-and-metadata)
3. [Ingredient Rows, Measurements, and Density](#3-ingredient-rows-measurements-and-density)
4. [Ingredient Presentation and Sorting](#4-ingredient-presentation-and-sorting)
5. [Instructions, Autocomplete, and Recipe Linking](#5-instructions-autocomplete-and-recipe-linking)
6. [Publications, Magazine Handling, and The Recipe Tin](#6-publications-magazine-handling-and-the-recipe-tin)
7. [Queries, Search, and Library Explorer](#7-queries-search-and-library-explorer)
8. [Settings, Taxonomies, and Picklists](#8-settings-taxonomies-and-picklists)
9. [Sharing, Privacy, URLs, and Image Delivery](#9-sharing-privacy-urls-and-image-delivery)
10. [Authentication and Account Setup](#10-authentication-and-account-setup)
11. [Import, Export, and Backup Bundles](#11-import-export-and-backup-bundles)
12. [Change History and Forensic Audit](#12-change-history-and-forensic-audit)
13. [Interaction, Keyboard-First Design, and Accessibility](#13-interaction-keyboard-first-design-and-accessibility)
14. [Technology Stack and Hosting Architecture](#14-technology-stack-and-hosting-architecture)
15. [Deferred Features Catalog](#15-deferred-features-catalog)
16. [Testability and test-first delivery](#16-testability-and-test-first-delivery)

---

## 1. Product Vision and Paradigm

### 1.1 The Problem Being Solved

- **Azure DevOps Work Items Appeal:** Clean information density, relational
  records, and useful multi-field filtering.
- **Azure DevOps Dealbreaker:** Inability to have multi-value picklists (enums/tags) on work items, plus an awkward
  domain mismatch for cooking data.
- **Fibery Experience:** Loved the relational database backing, bi-directional linking, and cross-linking between books
  and recipes. Strongly disliked the user experience ("all panes, like Azure Portal instead of Azure DevOps").
- **Generic Tools Failure:** Notion feels sluggish and unstructured; Jira is rigid and pane-heavy; consumer recipe apps
  (Paprika, AnyList) lack deep relational modeling, domain-aware search, and customizable taxonomies.

### 1.2 Core Architectural Philosophy

- **Dual-Platform Intentionality:** Desktop and mobile are treated as distinct interaction paradigms sharing a common
  data model and business logic, not a desktop site compressed into mobile viewports.
  - **Desktop:** Keyboard-first, dense detail layout, multi-column editing,
    quick recipe filters, and a compact source Library.
  - **Mobile:** Touch-first, quick capture/editing, fast search, kitchen-friendly cooking layout (large checkboxes, bold
    quantities, prominent scaling).
- **Relational Integrity:** Strong foreign keys and database constraints rather than loose no-code schemas.
- **Progressive Web App (PWA):** Installable, globally accessible via Vercel hosting, using Supabase for authentication,
  Postgres storage, and private media buckets. Native mobile apps (React Native / Expo) are deferred until native-only
  capabilities (offline camera scanner, local push notifications) are needed.

---

## 2. Recipe Card and Metadata

### 2.1 Metadata Fields Breakdown

The top portion of the desktop recipe card contains compact, dense metadata inspired by Azure DevOps work items:

| Field Name | Type | Options / Formats | Behavior & Visibility |
| ---------- | ---- | ----------------- | --------------------- |
| **Name** | Text | Free text | Primary recipe title. |
| **Primary Publication** | Single-select picker | Searchable list of all user publications, including the reserved Recipe Tin collection, + "Add new publication" button | Clickable in view mode; navigates directly to the publication page. Every recipe belongs to a publication; Recipe Tin is the default collection and has no location fields. |
| **Location** | Text / URL | Book page or range; free-text Magazine citation; website recipe URL | A Magazine citation is free text because citation styles vary. Its optional online recipe URL is a separate field and may coexist with the citation. |
| **Food Type** | Single-select picklist | Casserole, roast, pie, galette, pasta, soup, sauce, cake, cocktail, bread, stew, salad, etc. | "What kind of dish is this?" Settings-managed picklist; use a compact custom dropdown aligned with the other picklist triggers. |
| **Meal Type** | Multi-select picklist | Breakfast, lunch, dinner, appetizer, side dish, snack, dessert, drink, booze, sauce, etc. | "When or how do I serve this?" Settings-managed multi-select dropdown. Multiple values are toggled with buttons; selected values show a checkmark, leaf-green text, and a pale green background. |
| **Cuisine** | Multi-select picklist | American, Italian, Chinese, Mexican, French, Thai, Indian, Fusion, etc. | Settings-managed multi-select dropdown to cleanly support fusion cooking. |
| **Main Ingredients** | Derived index | Derived from ingredient rows | Not an independent metadata input. Automatically compiled from ingredient rows marked with the `Main` checkbox. |
| **State** | Single-select enum | `Want to try`, `Tried`, `Will not try` | New recipes default to `Want to try`. Place State immediately after Name; its active Enthusiasm, Verdict, or Reason, Serves, and Equipment share its row. Food Type, Meal Type, and Cuisine follow on the next wrapping row. Changing State clears stale conditional values. |
| **Verdict** | Single-select picklist | Favorite, delicious, staple, practice, try again, occasionally, specific occasion, once-a-year-rich, so-so, no, hell no, MISTAKE | Visible **only** when `State == Tried`. Combines emotional verdict, culinary opinion, and repeat cadence ("Law of Undulation"). User-customizable in settings. |
| **Enthusiasm** | Single-select picklist | Absolutely, sounds good!, try, specific occasion, maybe, eh | Visible **only** when `State == Want to try`. The empty prompt reads “What am I feeling?” User-customizable in settings. |
| **Occasion Details** | Free text | Text string describing the occasion | Visible **only** when either Verdict or Enthusiasm has `Specific occasion` selected. |
| **Reason** | Single-line text | Text string explaining rejection | Visible **only** when `State == Will not try`. |
| **Equipment** | Multi-select picklist | Small pan, medium skillet, 12-inch cast iron, stand mixer, baking sheet, chef knife, spatula, whisk, peeler, blender, etc. | Settings-managed multi-select dropdown; follows Serves on the State row. |
| **Serves** | Optional positive integer | Number of people served (e.g., `4`) | Appears at the end of the State row, immediately before Equipment. It is the base serving count for recipe scaling; discrete-item Yield is not captured in this field. |
| **Tags** | Multi-select account-owned tags | Flat freeform tags can be created or reused inline; Settings manages their shared pastel color and catalog lifecycle | Translucent color distinguishes tags visually. Private detail chips preserve their text and are searchable across both entity types in Slice 17. |
| **Notes** | Markdown text | Multi-line text | Captured gotchas, recipe tweaks, variations, and improvement observations. |

### 2.2 Time Tracking and Overlapping Times

Recipes often stealth-ambush cooks with hidden refrigeration, marinading, or resting steps. To ensure clear visibility,
time is broken down into specific categories:

- **Specific Time Dimensions:**
  - Prep time
  - Mixing time
  - Marinate time
  - Chill time (refrigeration)
  - Freeze time
  - Cook time (stovetop / sauté / boil)
  - Bake time (oven)
  - Cooling time
  - Rest time (meat resting, dough proofing)
  - Total time
- **Card Display Rule:** Only non-zero/applicable times are displayed on the recipe card.
- **Integer Formatting:** Serves and duration values display with comma grouping for thousands. Time fields accept valid
  comma-grouped integers and normalize their display on blur; total-time calculation also accepts grouped values.
- **Total Time Calculation Behavior:**
  - Total time is stored as a distinct manual field. It is **never** auto-updated silently in the background, because
    steps often overlap (e.g., chopping ingredients while an oven preheats, or dough rising while sauce simmers).
  - Component times use compact, spinner-free numeric inputs sized to five-character values or their visible labels,
    whichever needs more room, with 8 px gaps. Total Time appears on its own final row.
  - A compact square **Auto-calculate** control showing only the `Σ` icon sits beside Total Time. It has the accessible
    name and tooltip `Calculate total time` . When clicked, it sums all entered component durations and visibly replaces
    Total Time, leaving the user in control.

### 2.3 Recipe Photos

- A recipe may have up to 12 ordered photos in addition to publication covers
  (6.1). The first photo is primary. Recipe photos are decorative: store no
  descriptions or captions and render them with empty alternative text.
- Accept still JPEG, PNG, WebP, and HEIC/HEIF images up to 20 MiB. Normalize
  orientation, strip source metadata, and store full and thumbnail WebP
  derivatives no larger than 2048 px and 480 px, respectively.
- Each account has a 1 GiB quota measured against stored derivatives. A
  publication has at most one cover; replacing it queues the previous objects
  for deletion.
- Originals upload directly to a one-use signed path in the private
  `recipe-media` bucket. The server validates and processes them before
  recording metadata. Signed read URLs are owner-authorized and expire after
  15 minutes.
- Recipe photos use the platform's ordinary image picker, allowing supported
  devices to offer camera capture and photo-library selection. They can be
  reordered with pointer or keyboard controls, promoted to primary, and removed
  immediately. Publication cover management has an explicit camera action on
  mobile.
- In recipe edit mode, the photo action beside Name shows the primary photo in a
  compact, contained thumbnail with a corner pencil. When no photo exists, it
  shows a camera icon. In recipe detail, center the primary photo, preserve its
  aspect ratio, and cap its height at 280px on desktop, 240px on tablet, and
  144px on narrow mobile. Show every photo, including the featured photo, as a
  square thumbnail button. Selecting one temporarily changes the featured
  photo without changing primary status or stored order. The buttons have
  accessible names, selected state, and native keyboard activation; the images
  remain decorative with empty alternative text.
- Trashed parents hide but retain their photos for restoration. Permanent purge
  queues all object paths for deletion; failed Storage deletions remain queued
  for retry. Public recipe photos are signed only after the public-link,
  privacy, and active-lifecycle checks. Publication covers remain owner-only.
  Image export is delivered in Slice 20; image import is delivered in Slice 21.

### 2.4 Recipe Metadata Entry Presentation

- The metadata form uses wrapping flex rows, not a CSS grid. Name occupies row
  one; State, its active response, and Serves occupy row two; Food Type, Meal
  Type, and Cuisine occupy the following row, with Equipment after Serves.
  Controls use content-sized widths; longer text fields have a readable maximum
  width.
- On desktop edit, the Recipe Name input has a 3-inch minimum and grows with
  the entered text like the Book Page(s) field, capped by the available
  viewport and form width. Mobile keeps the existing full-row Name field.
- Food Type, State, Verdict, and Enthusiasm use custom anchored single-choice
  dropdowns with the same trigger height as multi-picklists. Menus align to their
  trigger on both desktop and mobile.
- Single-choice fields use the shared portal `Picklist`; Meal Type, Cuisine, and
  Equipment use the recipe-specific `MultiPicklist`. `RecipeForm` coordinates
  their open state, and selected multi-values serialize as repeated hidden
  `*_ids` inputs. Shared picklist portals target the nearest dialog or `main`
  landmark, falling back to `body` only when neither exists, so open options
  remain within the active page's landmark structure.
- While a shared single-choice picklist is open, printable non-space characters
  build a case-insensitive prefix query for 700ms. The active option moves to
  the next matching label and wraps; repeating the same character cycles
  options with that initial. A no-match key leaves the active option unchanged.
  Type-ahead changes active focus, not selection. Enter, Space, click, and Tab
  retain their existing selection behavior; Escape closes the menu and returns
  focus to its trigger. The active option remains exposed through
  `aria-activedescendant`.
- Single- and multi-picklist labels use the same 13px bold typography. All
  trigger text is regular weight by default, regardless of selection.
- Meal Type, Cuisine, and Equipment use narrow dropdown triggers sized once to
  the longest option plus its checkmark. Selecting options never resizes the
  trigger. Each popup option is a button with `aria-pressed`; one popup is open
  at a time and Escape closes it.
- Selected multi-picklist options show a checkmark, bold leaf-green text, and a
  pale green background. The checkmark remains the selection cue when color is
  unavailable or indistinguishable.
- Recipe metadata inputs, single- and multi-picklist triggers, Serves, Reason,
  and Occasion Details are 36px high on desktop and mobile, matching Name and
  Publication. Multi-picklist options have a 30px minimum height on desktop and
  36px on mobile. Component-time inputs remain compact; distinct icon actions
  retain their separately specified hit areas.
- The mobile `Σ` control keeps a 48px hit target around a visibly compact 30px
  square and aligns with the Total Time input without adding visible horizontal
  spacing beyond the neighboring field gap.
- Center the Serves number within its 36px input on desktop and mobile.
- On desktop, the recipe list shows Name, Food Type, State, and Opinion, which
  shows the active Enthusiasm, Verdict, or Reason. On mobile, the list shows
  Name and Opinion. Detail view uses content-sized wrapping metadata in this
  order: State/response, Occasion
  Details when present, Serves, Total Time, Equipment, Food Type, Meal Type,
  Cuisine, remaining times, then Notes. On desktop, Food Type, Meal Type, and
  Cuisine occupy a dedicated full-width row. On mobile, component times appear
  in a separate subsection with a divider and small-caps “Times” title; Total
  Time remains in the main metadata. Recipe Tin does not appear as a
  duplicate breadcrumb or attribution when it is already selected in navigation.
  Recipe-page headings are about 16pt (about 21.33px). A recipe assigned to a
  publication presents its origin as a compact subtitle directly beneath the
  recipe title. The linked publication title is italicized as a citation; the
  “From” label, issue, page, and URL remain upright. This attribution is absent
  for Recipe Tin recipes.
- Standalone text actions are 48px high. Compact icon-only actions beside the
  detail tag line, including Print and Edit, are 36px square with descriptive
  accessible names and tooltips. They follow the chips with compact spacing,
  and the action line remains when no tags are assigned. On mobile, their hit
  areas expand to 48px without changing their visible size. Picklist triggers have
  separate sizing rules. In edit mode, a standard 48px icon-only `x` with a
  24px icon in the header returns to view; Delete remains a distinct text action
  below it.
- The desktop Recipe Tin list is up to 1172px wide and its detail metadata
  section is up to 1012px wide.

---

## 3. Ingredient Rows, Measurements, and Density

### 3.1 Ingredient Row Structure

An ingredient and its quantities are permanently tied together in a single
relational row. The desktop edit table displays Ingredient, Specifics, Amount,
and Preparation values in that order; the Main checkbox and 12px drag handle
sit in a narrow control rail outside the table. The table always has one
trailing empty row.

1. **Main (Checkbox):** Checked if this ingredient defines the essence of the dish (e.g., chicken in chicken soup, lemon
   in lemon bars). Populates the recipe's `Main Ingredients` query index. The checkbox sits outside the table in the row
   control rail and is edit-only.
2. **Ingredient (Picker):** Desktop cell suggestions show above and align to the left edge of the active cell. The user
   can select an account-owned canonical ingredient or type a new name. Mobile uses the same addable suggestions inside
   its row editor pane; menus remain within the viewport and use the available space above or below the field.
3. **Quantity (Numeric/Range/Fraction):** Accepts positive decimals, fraction text (`1/2`, `1 1/4`),
   and optionally equivalent Unicode fraction glyphs (`½`, `1 ¼`),
   ranges (`2-3`), and
   comma-grouped whole-number parts (for example, `1,000` , `1,000 1/2` , or `1,000-2,000` ). Blank for Feel phrases.
   Editor values retain fraction-text formatting. Recipe reading groups thousands and displays supported US customary
   fractions as Unicode glyphs, while preserving range and unit-system formatting.
4. **Measurement Category (fixed selector and fields):**
   - **Unit:** The default category. Shows separate Volume amount/unit and Weight amount/unit fields. Either or both
     dimensions may be entered; a slash separates them visually and in recipe display.
   - **Volume Picker:** Predefined, immutable convertible units: teaspoon (tsp), tablespoon (TBSP), fluid ounce (fl oz),
     cup, pint (pt), quart (qt), gallon (gal), milliliter (ml), liter (L).
   - **Weight Picker:** Predefined, immutable convertible units: gram (g), kilogram (kg), ounce (oz), pound (lb).
   - **Count:** A count has no unit. The quantity is simply how many of the ingredient (`2` eggs, `1` cucumber).
     Packaging and portion words such as can or bag are not units: a 14 oz can is entered as 14 oz under Units.
   - **Things Picker:** Settings-managed extensible picklist of non-standard units: bunch, sprig, clove, head, stalk,
     sheet, stick, slice, pinch, dash, handful. Amounts in this category scale but never convert and never take part in
     density; display pluralizes the unit when the amount (or range maximum) exceeds one. Packaging words (can, bag,
     package) are not seeded.
   - **Feel Picker:** Approved culinary phrases: `to taste` , `as needed` , `for garnish` , `to serve` , `divided` .
     Feel is stored using the existing Unmeasured measurement type and phrase list.
   - On desktop, the edit column order is Ingredient, Specifics, Amount, Preparation. Type has its own cell and all
     quantity/unit controls share one Amount cell. Unit displays volume and weight amount/unit pairs separated by a
     slash; Count, Things, and Feel display only their relevant controls. Keep controls on one line and constrain the
     table to available width, switching to the mobile row list at narrow widths. One left-aligned Amount header spans
     Type and the Amount cell without subheaders. Quantity inputs start at two characters wide, grow with their
     contents, and center their text; Things and Feel picklists use short `Unit` and `Phrase` prompts. The weight-unit
     picker uses compact horizontal padding. On mobile, the editor field order is Ingredient, Specifics, Amount,
     Preparation; Type, quantity, and unit controls share a compact wrapping line, and paired Unit dimensions may wrap
     as needed without page-level horizontal scrolling.
5. **Specifics (Text):** Qualitative specification or size qualification. Displayed in lowercase after the amount in
   recipe view. Examples: `all-purpose` (for flour), `large` (for eggs), `full-fat` (for coconut milk), `unsalted` (for
   butter), `Brummel & Brown` (for margarine).
6. **Preparation (Addable single-value suggestions):** Processing instructions performed on the ingredient before or
   during cooking. Examples: `diced` , `minced` , `cubed` , `melted` , `room-temperature` , `crushed` , `sliced` ,
   `divided` . Users can add a preparation while editing; saved values appear in future suggestions.

### 3.2 Dual Measurement (Volume + Weight)

- In edit mode, each row selects one fixed category. Selecting Units immediately exposes optional volume and weight
  fields side-by-side; there is no add-measurement action.
- In view mode:
  - If only volume or weight is present: displays single value (e.g., `1 cup flour` or `250 g flour`).
  - If both are present: displays both separated by a slash (e.g., `1 cup / 120 g all-purpose flour`).
  - Pluralize `cup` as `cups` when the amount or range maximum is greater than one; keep unit abbreviations unchanged.

### 3.3 Trusted Ingredient Density

- **Settings-Only Configuration:** Density is defined formally in Settings per canonical ingredient, never on an ad-hoc
  recipe card.
- **Format:** Reuses the volume/weight input controls (e.g., `1 cup = 120 g` for all-purpose flour; `1 TBSP = 14 g` for butter).
- **Auto-Fill Behavior in Recipe Editor:**
  - If an ingredient with a trusted density is selected, entering a volume automatically computes and fills the weight
    (or vice versa).
  - **Indicator and accessibility:** The auto-filled amount receives a subtle
    tint and a compact calculator icon. The decorative icon is hidden from
    assistive technology; an associated status announces `Derived from density`
    to screen readers.
  - **Manual Override:** The user can edit the auto-filled value. Doing so removes the background tint and marks the
    field as manual.
  - **Re-triggering:** If a manual override is cleared, leaving the field empty causes it to re-fill automatically from
    the trusted density on blur.
  - **Responsive amount field:** Derived values grow to fit their formatted
    quantity, including ten-digit values, while remaining within the amount
    group and clear of the target-unit picker.

### 3.4 Scaling Math and Rounding Rules

- **Base Batch:** Every recipe is entered with baseline multiplier $1.0$.
- **Scaling Modes:**
  - **Servings:** Enter desired servings $S_{target}$. The app computes multiplier $M = S_{target} / S_{base}$.
  - **Multiply:** Enter integer or decimal $j$. Multiplier $M = j$ (displays as $jx$).
  - **Divide:** Enter integer $j$. Multiplier $M = 1/j$ (displays as $1/j$).
- **Quantities Scaled:**
  - All numeric Volume, Weight, Count, and Things quantities multiply by $M$.
  - Ranges scale both boundaries (e.g., `2-3` eggs at $2x$ becomes `4-6` eggs).
  - Feel items (`to taste`, `as needed`) are not scaled.
- **Rounding and Fractions:**
  - Internally, values are preserved as high-precision floating numbers.
  - US customary measurements display common cooking fractions with denominators 2, 3, 4, and 8 as Unicode glyphs when
    within $0.03$ of the fraction (e.g., $0.25 \rightarrow ¼$ , $0.333 \rightarrow ⅓$ , $1.625 \rightarrow 1\ ⅝$ ).
    Glyphs are slightly larger and vertically centered with surrounding digits, with optical corrections where font
    metrics require them. Otherwise, quantities display as decimals
    rounded to two places (e.g., $1.17$ cups). Quantity inputs display conventional
    fraction text (e.g., `1/2`, `1 1/2`) and also accept fraction glyphs as an optional input convenience, preserving
    the same numeric values when edited and saved.
  - Metric measurements always display as decimals rounded to at most two decimal places (e.g., $1.5$ L, $0.33$ g,
    $1.625$ g displayed as $1.63$ g); never display metric quantities as fractions.

### 3.5 Unit Display Preferences

- **Default unit systems:** The account stores independent US customary or metric defaults for volume and weight.
  Signed-in users change these values in Settings' Personal preferences section using the shared portal `Picklist` ; the
  shared navigation has no Units shortcut.
- **Preference writes:** A narrow authenticated database function derives the account from `auth.uid()` , validates the
  requested systems, and updates only the preference fields. Direct authenticated account updates remain restricted;
  admin and sign-in-method fields are not writable through this function.
- **Best-fit conversion:** Preserve a stored unit when it matches the selected system. Otherwise, choose the largest
  target-system unit whose converted lower amount is at least one; if none qualifies, use the target system's smallest
  unit. Both endpoints of a range use the same unit.
- **Recipe-level override (view time):** While viewing a recipe, the user can switch an individual ingredient to a
  specific unit within its dimension (e.g., teaspoons instead of tablespoons, or ounces instead of grams). These
  overrides and scale values are transient reader state, never saved to the recipe or account.
- **Reset:** Reset restores the recipe's saved base servings and resolves units from the account defaults again by
  clearing all transient volume and weight overrides.
- **Dimensions:** Conversion stays within volume or within weight. Volume-to-weight conversion needs a trusted density (3.3).
- **Printing:** The printed recipe reflects the active scale, account defaults, and per-ingredient overrides while
  omitting the interactive controls.
- **Public pages:** Guests have no saved unit preferences. Public recipe pages
  use US customary units and keep scaling and unit overrides transient.
- **System naming:** The app uses "US customary", not "imperial", because UK imperial pints and gallons differ.

---

## 4. Ingredient Presentation and Sorting

### 4.1 The Two Presentation Modes

The recipe card supports two distinct view presentations. This is a reader/device preference, not stored recipe data:

#### A. Standard View (Amount-First)

Inspired by work items and classical cookbooks:

- **Ingredient-row reading order:** Amount, Ingredient (and Specifics), then
  Preparation, following conventional recipe-book notation such as
  `1 cup all-purpose flour, sifted`.
- **Desktop layout:** The structured ingredient area sits alongside the
  instruction column. Size the Ingredients column to its widest row, capped at
  half the available reader width, and let Instructions use the remaining
  space. This preserves the amount-first reading order without wasting a full
  equal-width track on a compact ingredient list.

#### B. Ingredient-First View ("Mine")

Organized by how a cook actually operates in the kitchen ("get the item, check the amount, prep it"):

- **Column 1: Ingredient** (with Specifics rendered as a distinct subtitle beneath the name).
- **Column 2: Amount** (quantity and unit, formatted as volume / weight if dual).
- **Column 3: Preparation** (diced, melted, minced, etc.).

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

- **Defaults:**
  - Authenticated desktop view: User-configurable default in settings (defaults to Standard).
  - Authenticated mobile view: Defaults to Ingredient-First.
  - Print view: Follows the active ingredient presentation. Until Slice 16
    introduces alternate reader views, print uses Standard presentation while
    retaining Slice 13's active scale and unit choices.
  - Public share view: Defaults to Ingredient-First.

### 4.2 Ingredient Sorting Options

The user can re-sort ingredients dynamically in view mode. The canonical underlying order entered in edit mode is always
preserved.

1. **Appears in Instructions (Default):** Ingredients are ordered by their first structured appearance (`#`) in the
   instruction steps. Unmentioned ingredients appear at the bottom in their entered order.
2. **Alphabetical:** A-Z or Z-A by ingredient name.
3. **By Size (Ascending / Descending):**
   - Strictly partitioned into four sequential, independent groups:
     1. Volume items (normalized to milliliters/cups for relative comparison).
     2. Weight items (normalized to grams for relative comparison).
     3. Count and Things items (e.g., `2` eggs, `1 bunch` cilantro).
     4. Feel items (e.g., `salt to taste`).
   - Ascending or descending sorts *within* each group. Volume and weight are never mixed into an arbitrary single scale.
   - A row that has both a volume and a weight measurement sorts by its volume measurement.
4. **Order Entered:** The exact sequential order established when editing the recipe.

### 4.3 Manual Reordering

- Every ingredient row has a 12px drag handle at its left edge, outside the
  table, beside its Main checkbox. Dragging updates the persistent manual order
  used by **Order Entered**.
- Mobile uses a pale 24px grip. Handles accept pointer dragging onto either
  another row's cells or its control rail.
- Keyboard users focus a row and press `Ctrl+ArrowUp` or `Ctrl+ArrowDown` to
  move it. No generic row actions are shown; a compact delete `x` is available
  for populated rows on hover or keyboard focus, and remains visible on mobile.
- In Ingredient and Preparation picklists, Enter selects the active option and
  a second Enter commits the field. Tab accepts a typed or keyboard-selected
  suggestion and commits it. Ingredient Tab advances to same-row Specifics;
  Preparation Tab advances to the next row's Ingredient. Enter commits a
  Specifics edit directly; clearing Ingredient and leaving the field removes the
  nameless row.
- Ingredient amount and amount-type controls follow the same two-Enter
  contract: the first Enter selects the active option in an open suggestion or
  measurement listbox, and the next Enter commits the field/row. Enter in a
  quantity or Specifics input commits the row when no suggestion list is open.
  Tab accepts an active suggestion or measurement option before advancing;
  ArrowUp and ArrowDown open a closed listbox and move its active option.
  Non-submit Enter never submits the recipe form. On desktop, committing a row
  focuses the trailing Add ingredient row cell; on mobile, it submits the
  ingredient-details popover. Escape closes a listbox or cancels the active
  edit/popover. Only the explicit Save recipe action saves the recipe.
- Reordering changes only the canonical entered order. Temporary view sorts do
  not rewrite it.

---

## 5. Instructions, Autocomplete, and Recipe Linking

### 5.1 Instructions Editor and `#` Mentions

- Instructions are stored as ordered step blocks written in Markdown. Confirmed
  ingredient mentions serialize as
  `[[ingredient:<stable-id>|<slug>]]` and render in the editor as `#<slug>`.
  Literal unconfirmed `#` text remains plain text and is not indexed as a
  structured mention. The editor's plain-text projection uses the readable
  `#<slug>` form and omits the stored marker.
- Instruction steps support unordered (`-`, `*`, `+`) and ordered (`1.`, `1)`)
  Markdown list markers, whether the list starts after a blank line or a single
  newline. Enter continues a list within the current step; Enter on an empty
  list marker exits the list line. Shift+Enter inserts a newline within the
  current step, while Enter on a non-list line creates the next step. Rendered
  unordered and ordered lists retain visible bullets/numbers and indentation in
  private, public, and print views.
- **`#` Autocomplete Behavior:**
  - Typing `#` triggers an inline autocomplete menu. A bare `#` shows existing
    ingredients on the current recipe.
  - Once a query is typed, suggestions search the account-wide ingredient
    catalog in real time. This includes typing `#` directly before an existing
    word. Multi-word ingredients use hyphens in the token (e.g.,
    `#all-purpose-flour`).
  - Selecting a catalog ingredient adds it to the current recipe if needed,
    then creates a structured mention to that recipe's ingredient row.
  - **Menu Options:**
    1. Select an existing ingredient row.
    2. Select **Create new ingredient** (adds row to ingredients table and links it).
    3. Press `Escape` to cancel autocomplete and leave `#` as plain text.
  - **Rendered Output:** Renders cleanly as normal readable text (e.g., "Add the all-purpose flour and mix"). In recipe
    detail, each structured mention is a focusable inline button. Hover or keyboard focus reveals its current scaled and
    converted amount in one compact popup above the mention; click or tap pins/toggles the popup. Escape, an outside
    pointer action, or loss of hover/focus when unpinned dismisses it. Escape returns focus to the mention. The
    viewport-bounded square bubble has a strong background and a small pointer tail, contains no nested tooltip, and
    shows an unmeasured phrase or `No amount listed` when there is no numeric amount. The trigger retains sentence-aware
    readable text. Popups and their controls are not printed; the readable mention and active amount in the ingredient
    list remain printable.
  - **Trigger Symbol:** `#` on every platform. Phone keyboards have no convenient non-alphanumeric key, and `#` is a
    familiar mention convention.
  - **Degree Symbol Shortcut:** `Ctrl+.` inserts `°` at the caret and replaces any selected text.
  - **Ingredient Mention Style:** In-app instruction mentions default to bold
    dark red to make referenced ingredients easy to scan. User Settings offers
    a dedicated styling control:
    - **Color palette:** A curated set of accessible preset colors (dark red,
      forest green, navy blue, amber/brown, charcoal/default body).
    - **Font decoration toggles:** Independent checkboxes to add **bold**,
      **italic**, and/or **underline**.
    - All combinations must maintain $\ge 4.5:1$ contrast against the app background.
    - Public and printed recipes use the default bold dark-red treatment.
  - **Structured Tracking:** Only confirmed selections create a structured foreign-key link to the ingredient row. Plain
    text does not trigger instruction-appearance sorting.

### 5.2 Recipe-to-Recipe Links ("Pairs With")

- Bottom row of the recipe card features a **Pairs With** section.
- It accepts ordinary text entries (for example, `Duck Sauce`) and optional
  recipe links. Text becomes a link only when the user selects an existing
  recipe through `#` autocomplete.
- A tooltip in edit mode explains that typing `#` searches existing recipes and
  creates a card link.
- Supports directional recipe links (e.g., linking a chimichurri sauce to a
  flank steak) while displaying both outgoing and incoming links.
- The card displays both:
  - Outgoing links: Recipes explicitly linked from this card.
  - Incoming links: Other recipes that have linked to this card.
- In edit mode, typing `#` in the Pairs With field triggers an autocomplete search across all existing recipes in the
  user's library.
- After selecting a recipe, edit mode displays its normalized token, such as
  `#roast-chicken`. The saved pairing keeps the readable recipe name and linked
  recipe ID; detail mode renders that name as the link text. Editing the token
  clears the link until another recipe is selected.
- On desktop, the Pairs With input is at least 3 inches wide and its right edge
  aligns with the Rest time input. Its available width is recalculated when
  layout dimensions change.
- Autocomplete returns only active recipes owned by the signed-in account. A
  trashed target remains as display text without a link; restoring it makes the
  link active again. Purging a target detaches the link but preserves its last
  display text. Purging the source recipe removes its own pairings.

### 5.3 References Section

In recipe detail and edit, References follows Notes, which follows Pairs With. The editor uses one shared **Type** and
**Reference** header and offers three reference types:

1. **Recipe:** Clickable link to another active recipe in the same account.
2. **External URL:** Clickable link pointing to a website or blog not formally imported into the library.
3. **Print:** Non-clickable bibliographic reference (e.g., *The Joy of Cooking, 75th Anniv. Ed., p. 412*).

- **Rule on Origins:** A recipe adapted from multiple disparate sources is considered an original recipe and belongs in
  the **Recipe Tin** with these references cited in References.
- In-app recipe references are owner-scoped. A trashed target is displayed
  as text without a link; restoring it makes the link active again. Purging a
  target clears the recipe association but preserves its resolved display
  text. Purging the recipe that owns a reference removes that reference.
- Existing Publication references remain as static legacy text. They cannot
  be created or selected in the current editor.
- External URL values accept a host without a scheme, such as `google.com`,
  and normalize it to HTTPS. Only HTTP and HTTPS URLs are accepted.
- Detail mode renders Pairs With and References as unordered lists. The
  Magazine recipe URL is labeled `Url`; on mobile edit it appears below the
  free-text Citation field.
- On desktop, the Reference text field is at least 3 inches wide and no wider
  than half its row; the Type column fits its control. On mobile, the Type
  column also fits its control, leaving only the intended column gap before the
  Reference field.

---

## 6. Publications, Magazine Handling, and The Recipe Tin

### 6.1 Publication Types and Attributes

A Publication is any formal collection or entity that contains recipes.

All publication types can carry account-owned tags selected during creation or
editing. The form can create or reuse a tag inline; selected assignments are
saved with the publication. Publication detail shows assigned tags as text
chips with the tag's shared translucent pastel color; an empty assignment is
omitted.

| Publication Type | Specific Attributes | Recipe Location Field | Visual Treatment |
| ---------------- | ------------------- | --------------------- | ---------------- |
| **Book** | Name, Author, Edition (optional), ISBN (optional), Retailer Lookup URL (Amazon, B&N, AbeBooks, etc. - optional), Cover image | Page number or page range | Postage-stamp cover thumbnail. Without an image, show a light-blue book-shaped rectangle with a dark-blue border and italic title text sized to fit. ISBN-10 and ISBN-13 accept pasted separators and format with registered ISBN range hyphens while preserving validation. |
| **Magazine** | Magazine title and optional cover image | Per-recipe issue, volume, edition/date, and optional page citation | Postage-stamp cover thumbnail. Without an image, show a white magazine-shaped rectangle with a black border and normal title text sized to fit. |
| **Website** | Site Display Name, Site Root URL, Site Logo/Favicon (optional) | Full recipe URL | Minimalist site icon / badge. |
| **Collection** | Reserved Recipe Tin, one per account | None | Mirrored transparent tin image; cannot be created, edited, or deleted by the account owner. |

### 6.2 Magazine Titles, Recipe Locations, and Online URLs

- A Magazine publication represents the enduring magazine title, not an individual issue. Each recipe stores its issue
  citation as free text because magazines vary their conventions, for example `Vol. 18, no. 2, p. 41` or
  `Holiday issue, page 41` .
- Book Page(s) and Magazine Citation inputs grow with their entered text while
  remaining within the available Publication row.
- A Magazine recipe may have an optional online recipe URL stored on that recipe. It does not require a second Site
  publication or a cross-publication relationship.
- The recipe editor keeps its Magazine location and optional online URL together in a compact row directly below
  Publication. The URL field is present even when empty; it is a single-line field whose long value stays within the
  available width on mobile.
- Recipe detail presents the Magazine citation and online link on separate lines on mobile. Desktop displays the actual
  URL as clickable link text; mobile uses the compact text `View online` . It is a direct link to that recipe, not a
  supplemental Reference.
- Magazine identity and issue location remain separate: recipes from different issues share the Magazine publication
  while retaining their own issue and page details.

### 6.3 Creation and Editing Workflows

Publications can be created from three locations:

1. **The Library:** An `Add publication` action.
2. **Recipe Edit Mode:** The Publication field is a searchable single-select combobox with an inline `Add "{name}"`
   command after typing, which opens a compact creation dialog.
3. **Import:** Automatic creation or matching during ZIP bundle imports.

Publication creation follows the same content-sized form logic as recipe
metadata: Name and URL fields take a full row; Author, Edition, ISBN, and
Magazine title fields have widths appropriate to their expected content and wrap as a
group when space is limited. Type choices use a labeled segmented control with
an accessible native-radio affordance rather than visible radio dots.

Existing Books, Magazine titles, and Sites can be edited in place from their
detail page. The detail page shows a static cover and places Edit at the left
of the action row, opposite the compact Add Recipe link. The edit pane places
the cover image and its pencil control beside a standard labeled Name field;
the spacing preserves a consistent gap beyond the pencil overhang. Publication
type remains fixed, and the editor shows only the fields for that type. Book
Author, Edition, ISBN, and Retailer URL are optional; a non-empty ISBN must be
valid and is stored without separators. Magazine names are unique within an
account after trimming and case-folding, while recipe issue and page citations
remain on their recipes. Site URL is required. URL fields accept HTTP(S) and
normalize a scheme-less host to HTTPS. Empty optional values are stored as null.
The 48px Edit action uses the page-paper background and the same leaf-green
border as Add Recipe.

Saving is explicit. Each successful save increments the publication version and
appends one `publication.updated` before/after history event, including when the
submitted values are unchanged. The save checks ownership, active status, and
the version loaded by the editor. Validation, duplicate-title, and stale-version
errors leave the dialog open with its draft intact; the top-right close control
and Escape discard the draft. Delete is available in the edit pane and opens
the existing publication deletion confirmation. Delete stays left-aligned and
Save stays right-aligned at equal widths on desktop and mobile. Updating
metadata preserves the publication ID, its recipe links and locations, and its
cover association. Cover management remains a separate interaction in the edit
pane. The authenticated client has no direct table-update grant; edits go
through the owner-scoped update function.

### 6.4 The Recipe Tin Collection

- **Concept and Identity:** The Recipe Tin is a permanent, system-managed
  collection publication reserved for recipes without an external publication
  source (family recipes, original experiments, clippings, recipes adapted from
  multiple sources). Each account has exactly one Tin, displayed before other
  matching Library entries regardless of sort direction.
- **Library Behavior:** Normal search and filters apply. A type or field filter
  can exclude the Tin; selecting Collection shows it. Its static cover uses
  the mirrored transparent `public/images/recipe-tin.webp` asset. The former
  `/recipes` destination redirects to the Tin's Library detail page.
- **Physical Metaphor:** A vintage metal tin box with a hinged lid, containing dog-eared 3x5 index cards and handwritten
  scraps of paper.
- **Visual Design:**
  - Recipe detail attribution says `In the Recipe Tin`; the Tin is a container,
    not a recipe source.
  - Recipes belonging to the Recipe Tin are rendered with a subtle, textured **ragged/deckled paper border background**
    instead of standard clean rounded cards.
  - Normal publication cards remain crisp, clean, and restrained.
- **Mobility:** Tin recipes can later be assigned to another publication, and
  publication recipes can be moved into the Tin. Tin recipes cannot have a
  page or recipe URL location.

### 6.5 Deletion Rules for Publications

Deleting a publication always requires confirmation. When it has active recipes,
the dialog requires one of three dispositions:

1. **Delete all recipes inside:** moves active recipes to Trash with the
  publication.
2. **Move recipes to the Recipe Tin:** assigns the account's permanent Tin
  publication and clears publication location fields.
3. **Move recipes to another publication:** prompts for a destination.

When a publication has no active recipes, the confirmation remains but the
disposition choices are omitted.

The deletion and recipe disposition are one atomic, version-checked operation.
Moving recipes to another publication requires a different active publication
owned by the same account. Location fields that do not apply to the destination
type are cleared. The Delete choice retains each recipe's publication
assignment and location while it is in Trash.

### 6.6 Trash, Restore, and Purge

- Deleting a recipe or publication moves it to the trash. "Archive" is not a separate state.
- A trashed item is purged permanently if it is not restored within 30 days of its deletion. A scheduled job performs
  the purge.
- Restoring a publication restores only that publication; it does not reverse
  the recipe disposition chosen during deletion. Recipes moved to the Recipe
  Tin or another publication stay there. Recipes moved to Trash remain there
  and can be restored separately; their retained publication assignment and
  location return with the recipe.
- Purging a trashed publication also purges its retained trashed recipes and
  their history. Purging an item removes its private history snapshots as well.
- A trashed recipe's public URL behaves like a private recipe (404). A purged recipe's URL returns 410, which requires
  keeping a record of purged public IDs.

---

## 7. Queries, Search, and Library Explorer

### 7.1 Recipe and Publication Search and Filters

Recipe and publication discovery is optimized for quick, occasional lookup:

- **Full-text search and straightforward filters:** Search the indexed text
  described in § 7.2 and narrow results with field-appropriate filters. Text,
  multi-select, number/time/date, and enum fields expose only their applicable
  operators, including blank checks where supported. Multiple filters combine
  with `AND`; nested `AND`/`OR` query groups and named-query lifecycle are
  deferred.
- **Last-used explorer state:** Each explorer restores its owner's last-used
  filters, sort key, sort direction, and List/Grid choice. A valid shareable
  URL takes precedence over remembered search state. Publication recipe scope
  remains fixed by its route.
- **List display preferences:** Each account can choose visible List columns
  and resize desktop column widths independently in Find, Library, and each
  publication recipe explorer. A small settings icon opens the column chooser.
  These preferences belong to the exact explorer context, not a saved view or
  search URL. Column visibility applies immediately; widths are adjusted by
  pointer or touch dragging. Resizing has no keyboard equivalent by explicit
  product choice; all other explorer controls remain keyboard-operable.

### 7.2 Full-Text Search

Fast, indexed text search across:

- Recipe titles
- Recipe notes
- Ingredients and details
- Instructions text
- Publication name, and author

### 7.3 Source Library Explorer

The Library provides a compact publication explorer with a desktop list/grid
and a single-line mobile list:

- **View Modes:**
  - **List:** Desktop uses a semantic table with Name, Type, Author,
    Issue/Edition, and Recipes. The Recipes filter header and counts are
    centered. Desktop rows alternate a subtle leaf tint against white to aid
    scanning. On mobile, each row shows only the
    type-specific icon and a single-line publication title; long titles are
    truncated without wrapping or horizontal scrolling.
  - **Grid:** Shows the existing cover, publication name, author when present,
    and active recipe count. Authors appear on separate lines on desktop, with
    no publication-type prefix. Uploaded covers preserve the complete image
    and its aspect ratio inside the cover frame; do not crop to fill. Desktop
    covers are 72px wide; mobile cards use 48px covers and truncate long titles
    and authors to one line.
- **Compact Controls:** Type, View, Sort by, and Sort direction use separate
  icon buttons. The Type button keeps a stable width sized for the Magazines
  label and uses the active filter's icon. View toggles directly between List
  and Grid and shows the current view's icon; its accessible name identifies
  the destination view. Sort by opens an anchored option group; the direction
  button toggles ascending/descending. Buttons have accessible names; menus
  support keyboard focus, Escape, and outside-pointer dismissal.
- **Metadata Tooltip:** The desktop publication title exposes a tooltip with
  one line per metadata field, including Date Added and Date Changed. There is
  no preview pane, and mobile has no metadata tooltip.
- **Sorting:** Both views sort by Name, Type, Author, Issue/Edition, active
  Recipe count, Date Added, or Date Changed, in ascending or descending order.
  Date Added and Date Changed are sort choices, not visible columns. Default to
  List sorted by Name ascending; use Name ascending as a deterministic
  tie-breaker. Null text values sort after populated values.
- **Restored State:** Each account's last-used Library view, filter, and sort
  are restored independently of recipe explorers. A blank search query
  prevents an old free-text query from making the collection appear incomplete.
- **Publication Recipe Explorer:** Publication detail uses the shared recipe
  explorer controls and List/Grid views scoped to that publication. Grid shows
  the default recipe photo when available without cropping it. Filter and sort
  fields follow the recipe field catalog; Slice 18 restores its last-used
  state without losing the publication scope. On mobile, Sort, direction, and
  View form a connected 40px group. List columns is a separate outlined 40px
  button matching Edit's leaf border and paper background. Disconnected
  controls have equal 8px gaps above 340px, reducing uniformly to 4px at 340px
  and below without horizontal overflow.

---

## 8. Settings, Taxonomies, and Picklists

Settings is a section-based workspace, not a compact menu or a grid of cards.
Show implemented management domains as full-width, unframed sections. Personal
preferences, configurable picklists, ingredient catalog, tags, trusted density,
and later data tools can grow into distinct sections as their slices ship. Do
not render empty placeholder sections or links for work that is not yet
implemented.

### 8.1 Centralized Picklist Management

Picklist catalogs are managed in Settings to prevent duplicate, misspelled, or
orphaned options. Equipment, Food Type, Meal Type, and Cuisine also support
confirmed inline value creation from their open recipe-editor menus:

- Typing is draft-only. Escape or closing the menu discards unconfirmed text.
- Confirming with Enter or the Add button trims outer whitespace, collapses
  internal whitespace runs to one space, preserves entered casing, and matches
  existing values case-insensitively within the signed-in account and category.
- A matching value is selected without creating a duplicate or changing the
  catalog revision. Otherwise, the server action uses the existing owner-scoped
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
  - Informal Units (extensible non-standard units)
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
  All values are editable. `Specific occasion` in Verdict and Enthusiasm is protected: it can be renamed but not deleted
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
section after Tags, with matching disclosure spacing and no divider:

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

### 8.3 Personal Preferences

Located in Settings, per account:

- Default ingredient presentation: Standard or Ingredient-First (4.1).
- Default unit system for volume and, separately, for weight (3.5).
- Ingredient mention style (5.1).
- Mobile hand preference: Left or Right.

Volume, Weight, and View appear as labeled Personal preferences controls without
a Units heading. View selects Standard or Ingredient-first presentation. Volume,
Weight, and View use the shared portal `Picklist`; the private navigation has
no Units shortcut. On mobile, a Hand preference selects Left or Right and
reverses the compact navigation icon order for Right-handed use; it is not
shown on desktop. Visible preference controls are 36px high; Picklist hit areas
expand to at least 48px on mobile. The controls are keyboard operable, display
save status, and never offer public or cross-account preference changes.

---

## 9. Sharing, Privacy, URLs, and Image Delivery

### 9.1 URL Structure and Hash IDs

- Every recipe has a stable URL incorporating a long random hash ID (e.g., `/r/e7f8a9b2c3d4e5f6`).
- The URL remains identical whether the recipe is public or private.

### 9.2 Privacy Toggle and HTTP Status Behavior

- **Default State:** Recipes are linkable by default.
- **Private Toggle:** Marking a recipe private restricts access to the logged-in owner account.
- **HTTP Response Rules for Unauthenticated / Non-Owner Requests:**
  - **Private Recipe:** Returns **HTTP 404 Not Found** with a generic, calm page ("This recipe is currently
    unavailable") and `Cache-Control: no-store` . Does not reveal that the recipe exists, nor its title, owner, or
    publication. (Avoids misusing HTTP 503).
  - **Trashed Recipe:** Treated like a private recipe (404) until restored or purged.
  - **Permanently Purged Recipe:** Returns **HTTP 410 Gone**. This requires keeping a record of the purged public ID.

### 9.3 Public Recipe Experience

When an unauthenticated guest accesses a valid public recipe link:

- **Allowed Actions:**
  - View full recipe card in Ingredient-First view.
  - Scale servings ($jx$, $1/j$, or custom servings).
  - Switch measurement display units. The page opens in the recipe's stored units because a guest has no unit preferences.
  - Print recipe.
- **Restricted / Hidden Elements:**
  - No application navigation, sidebar, or account links.
  - No edit, delete, or clone buttons.
  - Publication name is displayed as static text attribution, not a clickable link.
  - Safe external HTTP(S) references are clickable; in-app recipe references
    remain static text.
  - In-app pairs-with links are displayed as static text.

The public title and Print action share a row. When a base serving count exists,
show `- serves n` inline after the title, separated by a space, in regular 16px
text; do not repeat Serves in the summary. Use 24px horizontal page gutters. Cap public
photos at 420px wide and `min(280px, 60vh)` high. Above 760px, show the photo
gallery beside the Times and Equipment summary; at narrower widths, stack the
summary below the photos.

### 9.4 Secure Image Delivery

- All covers and recipe images are stored in **private Supabase Storage buckets**.
- The public bucket setting is disabled.
- Original uploads use a one-use signed path so image bytes never pass through
  a Server Action or function request body. The authenticated server validates
  the staged object and writes metadata-free WebP full and thumbnail
  derivatives.
- Image assets are served through 15-minute signed URLs generated on the
  server after validating owner access. Public recipe photos are signed only
  after the public ID, privacy flag, and active lifecycle are verified.
  Publication covers are never public.
- Deletion queues every private object path. A Vercel daily cron invokes the
  protected cleanup endpoint; Storage failures remain queued and are retried.

### 9.5 Abuse Protection

- The application does not implement public-route rate limiting. Configure a
  Vercel Firewall rule for `/r/*` if deployment-level rate limiting is required.
- Authentication endpoints keep Supabase's default rate limits.
- Authentication emails (recovery, verification) require a custom SMTP provider; Supabase's built-in email sender is
  limited to 2 emails per hour.

---

## 10. Authentication and Account Setup

### 10.1 Email and Password Authentication

- Email + password login with standard "Forgot Password" reset link flow.
- **Email Verification:** Verification is the invite. The app emails the invite link to the address the admin enters,
  and accepting it proves the person controls that mailbox, so there is no separate verification step and no skip
  option. Open development sign-up has no verification.

### 10.2 Social Authentication

- Google OAuth is an alternative to email/password, not an addition. Each account uses exactly one sign-in method,
  chosen when the invite is accepted. Methods are never combined or linked on one account.

### 10.3 Invite-Only Sign-Up

- In production, sign-up is invite-only. The admin generates account-creation links for specific people.
- In development, sign-up is open. A per-environment switch controls this; development runs locally and production is
  set up last (14).
- **Admin:** Admin is an account flag that existing admins can grant. Production starts with a pre-created admin invite
  to the owner's email address, supplied through configuration and not committed to the repository. This prevents a
  stranger from claiming the first account. Admins send all later invites.
- Invites are sent by email, not copied by hand.
- An invite is bound to the email address the admin enters. Slice 2 supports
  email/password accounts and stores the chosen method immutably. Before Google
  sign-in is enabled in Slice 25, tests must prove that Supabase's same-email
  identity linking cannot combine providers on one account.

### 10.4 Slice 1 account boundary and deterministic auth testing

- Slice 1 establishes the account-owned data boundary with a minimal Account
  record linked to the authenticated user's identity. It is the first concrete
  owner-scoped resource and proves the row-level security pattern before any
  recipe, publication, picklist, or other product schema exists.
- Tests create their local Auth users directly through a test-only local setup
  path. They do not exercise or depend on invitations, admin provisioning,
  production sign-up restrictions, or external email delivery to arrange their
  fixtures.
- The slice must prove that an authenticated account can access only its own
  Account record and private storage path; another authenticated account and an
  anonymous request cannot read or modify them. The storage bucket remains
  private.
- Next.js sessions use Supabase's SSR cookie client. The Next.js proxy refreshes
  and verifies session claims; protected server-rendered routes verify the
  current Auth user before rendering private content.
- This test-fixture convenience does not define the product sign-up policy.
  Slice 2 owns invitations, admin behavior, production invite-only enforcement,
  and the one-sign-in-method rule. Recipe and other domain tables remain
  deferred to their owning slices, beginning with Slice 4.

### 10.5 Slice 2 sign-up and invitation boundary

- The application uses an environment-controlled sign-up mode. Local development
  is open and does not require email verification. Invite-only mode hides
  self-registration and rejects sign-up actions; production also disables
  Supabase Auth sign-up directly when production is configured in Slice 25.
- Supabase Auth is the source of truth for invitation creation, email binding,
  single use, and expiry. An existing admin sends an invite from the trusted
  server, Supabase sends the email, and the invitee confirms it before choosing
  a password. Local invitation links use the configured email OTP expiry of
  3,600 seconds (one hour).
- `accounts.is_admin` defaults to false. Account owners cannot modify
  `is_admin` or `sign_in_method` through PostgREST. Authenticated update
  privileges are column-scoped; administrative changes use a server-only
  Supabase secret key only after the request's Auth user and admin flag are
  verified.
- Slice 2 accepts email/password accounts only and records the method as
  `email_password`. Google sign-in and the same-email identity-linking conflict
  are verified before Google is enabled in Slice 25; accounts must not combine
  providers.

---

## 11. Import, Export, and Backup Bundles

### 11.1 ZIP Bundle Formats

Export is built for disaster recovery and migration. The app's ZIP export is the
user-facing backup mechanism; Supabase backups are not used. Version 1 archives
contain:

- `manifest.json`: Format and schema versions, UTC creation time, scope, app
  version, and each payload file's uncompressed byte count and SHA-256 digest.
- `data.json`: Normalized relational JSON using fixed record-table and
  per-table field allow-lists. Owner account IDs, Auth user IDs, admin and
  sign-in-method fields, signed URLs, private Storage paths, and export
  timestamps are omitted. Product preferences and recipe privacy are retained.
- `images/<asset-id>/full.webp` and `images/<asset-id>/thumbnail.webp`: Both
  ready WebP variants for every included media asset, addressed by stable asset
  UUID. Pending uploads and history are excluded.

The manifest lists every payload file except itself. Archive paths are limited
to `data.json` and UUID-scoped full or thumbnail WebP paths. The portable
contract and compatibility rules are defined in
[import-export-format.md](import-export-format.md).

### 11.2 Export Scopes

1. **Database Export:** Accessible in Settings. Includes all owned records,
  including trashed-but-restorable rows, product preferences, and ready images.
2. **Publication Export:** Accessible from publication detail, to the left of
  Edit on desktop. Library cards do not expose publication export actions.
  Includes the selected active publication, its recipes and dependent
  relational rows, and their ready images. On mobile, a 40px transfer-menu
  button offers `Export publication` and `Import recipe`; Edit and Add Recipe
  remain separate icon actions in the compact toolbar.
3. **Recipe Export:** Accessible beside Print and Edit on recipe detail.
  The icon action is 36px square to match Print and Edit. It includes the
  selected active recipe graph and ready images, plus basic metadata for its
  primary publication. Cross-scope recipe links retain their source IDs and
  display text.

### 11.3 Import Conflict Resolution

Imports accept supported v1 bundles only after validating archive integrity,
scope, and required graph data. They are source-independent: the authenticated
destination account determines ownership, and the import does not require the
source account or source Auth identity to exist locally.

Publication roots match by normalized publication type and name. Database and
publication imports match recipe roots by normalized name within the resolved
publication. Recipe-scoped imports match by normalized name across all active
destination publications, regardless of the source publication. Source IDs and
content hashes do not establish identity. Publication conflicts offer
**Keep Existing**, **Create Duplicate**, or **Replace**. Recipe conflicts in
database and publication imports offer **Replace**, **Duplicate**, or
**Ignore**; recipe-scoped conflicts offer **Replace** or **Duplicate** only.
Replace retains the destination root ID and the matched recipe's current
destination publication. Recipes included in a publication bundle remain
independently resolved roots.

A recipe bundle's publication metadata is a dependency, not a second
replaceable root. A unique active normalized type/name match is reused; if no
match exists, the publication is created automatically. Recipe Tin maps to the
destination owner's existing collection and is never imported as a
publication record. New and duplicate recipes default to the source publication
and can be assigned to another active destination publication.

Import database remains in Settings. Selecting a ZIP starts upload and
comparison automatically; the compact file row shows the filename and
record/media counts together without private/public recipe counts or an
`Import preview` heading. Import publication is available in the Library, and
Import recipe is a separate publication-detail action on desktop and an item in
the shared Export publication/Import recipe transfer menu on mobile. Scoped
imports preserve recipe privacy, remap imported IDs, and resolve relationships
using the bundle and destination data: an out-of-scope recipe link reconnects
only to one unique active destination match, otherwise its display text remains
without a link. Out-of-scope publication references retain their text without
a foreign ID.

### 11.4 Backup Reminder

Because export is the only backup, Settings shows the date of the last full-database export and a gentle reminder when
it is more than 30 days old.

### 11.5 Export Delivery and Limits

The normalized `data.json` is limited to 64 MiB and aggregate uncompressed
images to 1 GiB. Exports exceeding either limit fail without advancing the
full-database export date. Missing or unreadable ready images also fail rather
than producing a partial archive.

The server builds the ZIP as a Node.js stream and uploads it to a random
owner-prefixed path in the private `recipe-exports` Storage bucket. The API
returns a 15-minute signed URL instead of ZIP bytes, avoiding the Vercel
Function 4.5 MiB response-body limit. A successful export is queued for deletion
at least 24 hours later. The full-database timestamp advances only after the
archive is finalized, uploaded, queued for cleanup, and its signed URL is
created; scoped exports do not change it. Failed operations clean up partial
objects and leave the timestamp unchanged. Navigating away aborts an in-flight
export request, and the server removes or queues any partial archive for cleanup.

Export feedback is displayed below its action without changing the action row
or the position of following page content. Settings retains a 48px mobile
action target; compact publication and recipe actions use their dimensions
above.

### 11.6 Recovery and reset boundaries

A full database ZIP is an account-data backup, not a backup of the Supabase
project. It restores account-owned records, preferences, and ready image
variants. It does not include Auth users or credentials, or change history.
Keep a completed full export outside Supabase Storage before any authorized
local reset.

To recover app data after a local reset, reapply the project's migrations and
seed script, create a fresh local Auth account, and import the full database
ZIP from Settings. Import is owner-derived, so it does not require the original
Auth user ID. The local project configuration remains separate from the ZIP;
this workflow restores account data, not Auth identities or history.

---

## 12. Change History and Forensic Audit

### 12.1 Purpose and Constraints

- Change history exists purely for forensic auditing (e.g., checking "what was the baking time before I changed it?",
  "when did I add cardamom?").
- **No Version Restore:** To keep the schema and UI clean, full version restoration is explicitly excluded from the v1 scope.
- **Export Exclusion:** History logs are excluded from ZIP backup bundles to keep backups clean and portable.

### 12.2 Captured Audit Events

History events are recorded on save (never on individual keystrokes):

- Recipe / Publication creation
- Metadata edits (field-level before/after diffs)
- Tag assignment changes, including tag IDs, names, and color keys in
  before/after recipe and publication snapshots
- Tag catalog creation, rename, merge, deletion, and recoloring, including
  affected recipe/publication IDs, actor, and before/after catalog snapshots
- Tag recoloring, including affected recipe/publication IDs and before/after
  catalog snapshots with color keys
- Ingredient additions, removals, and quantity modifications
- Step reordering and edits
- Publication assignment and unparenting
- Trashed / restored states
- Account ID and ISO timestamp

---

## 13. Interaction, Keyboard-First Design, and Accessibility

### 13.1 Desktop Ergonomics

- **Keyboard Navigation:** Tab and arrow key traversal through the ingredient edit grid.
  - **Shortcut Actions:** Add ingredient rows with Enter in the last column,
    trigger autocomplete with `#`, and insert a degree symbol in an instruction
    with `Ctrl+.`. Only the explicit Save recipe action submits the recipe form.
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
  open. Enter never submits the recipe form; only Save recipe does. See
  [Ingredient editing](#43-manual-reordering) for row focus progression and
  mobile behavior.
- Mobile uses a one-column ingredient list and a compact row editor popover.
  Keep its controls compact and accessible.
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

---

## 14. Technology Stack and Hosting Architecture

- **Frontend / Fullstack:** Next.js (App Router), React, TypeScript, Tailwind CSS.
- **Instruction editor:** Tiptap 3.31.4 with its Markdown extension and custom
  ingredient-mention node/tokenizer. The Markdown extension is early release;
  parser/serializer compatibility remains covered by automated tests in the
  instruction-editor implementation slice.
- **Hosting:** Vercel (Production and Preview deployments).
- **Database:** Supabase Postgres.
- **Auth:** Supabase Auth (Email/Password + Google OAuth).
- **Storage:** Supabase Storage (Private media buckets with signed URLs).
- **Client Architecture:** Progressive Web App (PWA) with a manifest and root
  service worker. The worker keeps at most 10 recently viewed active recipe
  detail snapshots in browser-local Cache Storage for read-only offline access;
  snapshots omit remote media and server-dependent controls. Public pages and
  API responses are excluded, and sign-out clears every private offline cache
  before the server session ends. Browser installation is native; physical
  device checks are deferred to Slice 25.
- **Concurrent Edits:** Each recipe carries a version number. A save based on a stale version is rejected, and the user
  chooses between reloading the current version and keeping their edits.
- **Environments:** Development runs entirely locally: a local Supabase stack, a local email catcher, open sign-up, and
  no email verification. Production setup (Supabase, Vercel, Google, email delivery) comes last. Schema changes ship as
  versioned migrations. Unit, end-to-end, and accessibility checks run locally with one command.

---

## 15. Deferred Features Catalog

The following features were discussed and intentionally set aside for post-v1 releases:

- OCR and camera capture for paper cookbook recipes
- Automated web recipe URL scrapers
- Ingredient alias mapping (e.g., `bell pepper` $\leftrightarrow$ `capsicum`)
- Formal allergen and dietary restriction tags/warnings
- Simple star ratings, a separate favorites/bookmark list, cooking attempt logs,
  star ratings over time, and cook history
- Multi-user household collaboration and role permissions
- Native mobile applications (Expo / React Native)
- Historical version rollback/restoration engine
- Dark theme (v1 ships a single light theme)
- UK imperial units (v1 volume units are US customary and metric)

---

## 16. Testability and test-first delivery

Testability is a non-negotiable product and architecture constraint. Every
requirement, state, rule, permission boundary, and user-visible workflow must
have deterministic automated acceptance coverage; a manual demonstration
supplements that coverage but never replaces it.

- Write the focused automated tests before production code for each behavior.
  Start with a failing test that expresses the slice's acceptance criterion,
  implement only enough to make it pass, then refactor with the tests green.
- Design APIs, database boundaries, time-dependent behavior, external services,
  browser capabilities, and UI state so tests can control inputs and observe
  outputs without relying on hidden state, live hosted services, or manual
  inspection.
- Cover the appropriate layers: unit tests for deterministic logic, integration
  tests for database, authentication, storage, and API boundaries, end-to-end
  tests for user workflows, and automated accessibility checks for every screen.
- Add regression coverage before correcting a defect. When a requirement cannot
  be tested automatically, treat that as a design issue to resolve in the slice
  brief before implementation rather than an exception to the rule.

Slice briefs define the specific test cases, fixtures, and local test commands
before implementation begins. A slice is not complete until its automated tests
pass locally alongside its demonstrable acceptance workflow.
