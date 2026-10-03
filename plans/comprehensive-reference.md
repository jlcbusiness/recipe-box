# Recipe Box Comprehensive Reference Guide

## Purpose

This document is the definitive master reference for the Recipe Box application, capturing every concept, requirement, UI behavior, field specification, visual metaphor, and decision established across the planning discussions (`plans/discussion/0.napkin.md` through `7a.response.md`).

It serves as the exhaustive encyclopedia for implementation slices, slice briefs, and technical specifications. Where high-level documents (`first-draft-spec.md`, `data-model.md`, `visual-design.md`, `delivery-roadmap.md`) provide concise rules, this document provides the complete context, background rationale, and granular specifications.

**This is the master document.** The other planning documents summarize it and must defer to it. If they disagree, this document wins and the other document is corrected. Read `first-draft-spec.md` first for orientation, then open only the sections of this reference that the current work needs.

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
- **Azure DevOps Work Items Appeal:** Clean information density, powerful multi-field queries, saved views, and markdown/wiki integration.
- **Azure DevOps Dealbreaker:** Inability to have multi-value picklists (enums/tags) on work items, plus an awkward domain mismatch for cooking data.
- **Fibery Experience:** Loved the relational database backing, bi-directional linking, and cross-linking between books and recipes. Strongly disliked the user experience ("all panes, like Azure Portal instead of Azure DevOps").
- **Generic Tools Failure:** Notion feels sluggish and unstructured; Jira is rigid and pane-heavy; consumer recipe apps (Paprika, AnyList) lack deep relational modeling, advanced query capabilities, and customizable taxonomies.

### 1.2 Core Architectural Philosophy
- **Dual-Platform Intentionality:** Desktop and mobile are treated as distinct interaction paradigms sharing a common data model and business logic, not a desktop site compressed into mobile viewports.
  - **Desktop:** Keyboard-first, dense work-item detail layout, multi-column editing, advanced query builder, split-pane source library.
  - **Mobile:** Touch-first, quick capture/editing, fast search, kitchen-friendly cooking layout (large checkboxes, bold quantities, prominent scaling).
- **Relational Integrity:** Strong foreign keys and database constraints rather than loose no-code schemas.
- **Progressive Web App (PWA):** Installable, globally accessible via Vercel hosting, using Supabase for authentication, Postgres storage, and private media buckets. Native mobile apps (React Native / Expo) are deferred until native-only capabilities (offline camera scanner, local push notifications) are needed.

---

## 2. Recipe Card and Metadata

### 2.1 Metadata Fields Breakdown
The top portion of the desktop recipe card contains compact, dense metadata inspired by Azure DevOps work items:

| Field Name | Type | Options / Formats | Behavior & Visibility |
| ---------- | ---- | ----------------- | --------------------- |
| **Name** | Text | Free text | Primary recipe title. |
| **Primary Publication** | Single-select picker | Searchable list of all user publications + "Add new publication" button | Clickable in view mode; navigates directly to the publication page. Unparented recipes display as belonging to the "Recipe Tin". |
| **Location** | Text / URL | Page number (integer/text) OR URL (clickable link) | Mutually exclusive display based on publication type: Books show page number; Sites show recipe URL; Magazines show no page number, and the recipe's online URL is entered through the `+ Site` secondary listing (see 6.2). |
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
| **Tags** | Multi-select text tags | Freeform user tags | Color-neutral tags searchable across all recipes and publications. |
| **Notes** | Markdown text | Multi-line text | Captured gotchas, recipe tweaks, variations, and improvement observations. |

### 2.2 Time Tracking and Overlapping Times
Recipes often stealth-ambush cooks with hidden refrigeration, marinading, or resting steps. To ensure clear visibility, time is broken down into specific categories:

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
- **Total Time Calculation Behavior:**
  - Total time is stored as a distinct manual field. It is **never** auto-updated silently in the background, because steps often overlap (e.g., chopping ingredients while an oven preheats, or dough rising while sauce simmers).
  - Component times use compact, spinner-free numeric inputs sized to five-character values or their visible labels, whichever needs more room, with 8 px gaps. Total Time appears on its own final row.
  - A compact square **Auto-calculate** control showing only the `Σ` icon sits beside Total Time. It has the accessible name and tooltip `Calculate total time`. When clicked, it sums all entered component durations and visibly replaces Total Time, leaving the user in control.

### 2.3 Recipe Photos

- A recipe may have photos in addition to publication covers (6.1). Photos use the same private media pipeline (9.4) and are included in exports.
- The add-photo mechanism is specified in the Images slice brief. It must settle at least: capture from device camera or library, accepted formats (including iPhone HEIC), size limits and resizing, removal of EXIF and location metadata, photo order and primary photo, thumbnails, and whether public pages show photos.

### 2.4 Recipe Metadata Entry Presentation

- The metadata form uses wrapping flex rows, not a CSS grid. Name occupies row
  one; State, its active response, and Serves occupy row two; Food Type, Meal
  Type, and Cuisine occupy the following row, with Equipment after Serves.
  Controls use content-sized widths; longer text fields have a readable maximum
  width.
- Food Type, State, Verdict, and Enthusiasm use custom anchored single-choice
  dropdowns with the same trigger height as multi-picklists. Menus align to their
  trigger on both desktop and mobile.
- Single- and multi-picklist labels use the same 13px bold typography. All
  trigger text is regular weight by default, regardless of selection.
- Meal Type, Cuisine, and Equipment use narrow dropdown triggers sized once to
  the longest option plus its checkmark. Selecting options never resizes the
  trigger. Each popup option is a button with `aria-pressed`; one popup is open
  at a time and Escape closes it.
- Selected multi-picklist options show a checkmark, bold leaf-green text, and a
  pale green background. The checkmark remains the selection cue when color is
  unavailable or indistinguishable.
- Desktop controls are approximately 30–36 px tall with 4 px vertical and 7 px
  horizontal padding. Mobile inputs remain visually compact inside labeled
  touch rows of at least 48 px; menu options and triggers are at least 48 px.
- The single-line Reason input matches its adjacent picklist height, including
  on mobile. The mobile `Σ` control keeps a 48px hit target around a visibly
  compact 30px square.
- The mobile Serves input matches the 48px height of adjacent picklist triggers.
- Center the Serves number within its input. Its desktop field height is 36px;
  mobile height is 48px to match picklist triggers.
- On desktop, the recipe list shows Name, Food Type, State, and Opinion, which
  shows the active Enthusiasm, Verdict, or Reason. On mobile, the list shows
  Name and Opinion. Detail view uses content-sized wrapping metadata in this
  order: State/response, Occasion
  Details when present, Serves, Total Time, Equipment, Food Type, Meal Type,
  Cuisine, remaining times, then Notes. On desktop, Food Type, Meal Type, and
  Cuisine occupy a dedicated full-width row. Recipe Tin does not appear as a
  duplicate breadcrumb or attribution when it is already selected in navigation.
  Recipe-page headings are about 16pt (about 21.33px).
- Labeled action buttons use two visual sizes: 48px for standalone actions and
  32px for compact actions beside text. The detail Edit action is 32px tall on
  desktop and mobile and is labeled “Edit” in both. Mobile uses 18px small-caps
  text and a 48px hit area at the right edge of the title row. Picklist triggers
  and icon-only controls have separate sizing rules.
- The desktop Recipe Tin list is up to 1172px wide and its detail metadata
  section is up to 1012px wide.

---

## 3. Ingredient Rows, Measurements, and Density

### 3.1 Ingredient Row Structure
An ingredient and its quantities are permanently tied together in a single relational row. The desktop edit grid consists of six columns:

```
+------+------------+----------+------+--------+-------------+
| Main | Ingredient | Quantity | Unit | Detail | Preparation |
+------+------------+----------+------+--------+-------------+
```

1. **Main (Checkbox):** Checked if this ingredient defines the essence of the dish (e.g., chicken in chicken soup, lemon in lemon bars). Populates the recipe's `Main Ingredients` query index.
2. **Ingredient (Picker):** Combobox connected to the user's canonical ingredients. Allows searching existing ingredients or adding a new ingredient on the fly.
3. **Quantity (Numeric/Range/Fraction):** Accepts positive decimals, fractions (`1/2`, `1 1/4`), ranges (`2-3`), or integers. Blank for unmeasured ingredients.
4. **Unit (Type Selector + Picklist):**
   - **Segmented Type Selector:** `Volume`, `Weight`, `Count`, `Informal`, `Unmeasured`.
   - **Volume Picker:** Predefined, immutable convertible units: teaspoon (tsp), tablespoon (TBSP), fluid ounce (fl oz), cup, pint (pt), quart (qt), gallon (gal), milliliter (ml), liter (L).
   - **Weight Picker:** Predefined, immutable convertible units: gram (g), kilogram (kg), ounce (oz), pound (lb).
   - **Count:** A count has no unit. The quantity is simply how many of the ingredient (`2` eggs, `1` cucumber). Packaging and portion words such as can or bag are not units: a 14 oz can is entered as 14 oz Weight.
   - **Informal Picker:** Settings-managed extensible picklist of non-standard units: bunch, sprig, clove, head, stalk, sheet, stick, slice, pinch, dash, handful. Informal amounts scale but never convert and never take part in density. Packaging words (can, bag, package) are not seeded.
   - **Unmeasured Picker:** Approved culinary phrases: `to taste`, `as needed`, `for garnish`, `to serve`, `divided`.
5. **Detail (Text):** Qualitative specification or size qualification. Subtitled under the ingredient name in Ingredient-First view. Examples: `all-purpose` (for flour), `large` (for eggs), `full-fat` (for coconut milk), `unsalted` (for butter), `Brummel & Brown` (for margarine).
6. **Preparation (Text):** Processing instructions performed on the ingredient before or during cooking. Examples: `diced`, `minced`, `cubed`, `melted`, `room-temperature`, `crushed`, `sliced`, `divided`.

### 3.2 Dual Measurement (Volume + Weight)
- In edit mode, each row allows entering both volume and weight side-by-side (via an `+ Add measurement` button).
- In view mode:
  - If only volume or weight is present: displays single value (e.g., `1 cup flour` or `250 g flour`).
  - If both are present: displays both separated by a slash (e.g., `1 cup / 120 g all-purpose flour`).

### 3.3 Trusted Ingredient Density
- **Settings-Only Configuration:** Density is defined formally in Settings per canonical ingredient, never on an ad-hoc recipe card.
- **Format:** Reuses the volume/weight input controls (e.g., `1 cup = 120 g` for all-purpose flour; `1 TBSP = 14 g` for butter).
- **Auto-Fill Behavior in Recipe Editor:**
  - If an ingredient with a trusted density is selected, entering a volume automatically computes and fills the weight (or vice versa).
  - **Visual Indicator:** The auto-filled cell receives a distinctive background tint **and** an accessible badge/icon (`Derived from density`).
  - **Manual Override:** The user can edit the auto-filled value. Doing so removes the background tint and marks the field as manual.
  - **Re-triggering:** If a manual override is cleared, leaving the field empty causes it to re-fill automatically from the trusted density on blur.

### 3.4 Scaling Math and Rounding Rules
- **Base Batch:** Every recipe is entered with baseline multiplier $1.0$.
- **Scaling Modes:**
  - **Servings:** Enter desired servings $S_{target}$. The app computes multiplier $M = S_{target} / S_{base}$.
  - **Multiply:** Enter integer or decimal $j$. Multiplier $M = j$ (displays as $jx$).
  - **Divide:** Enter integer $j$. Multiplier $M = 1/j$ (displays as $1/j$).
- **Quantities Scaled:**
  - All numeric Volume, Weight, Count, and Informal quantities multiply by $M$.
  - Ranges scale both boundaries (e.g., `2-3` eggs at $2x$ becomes `4-6` eggs).
  - Unmeasured items (`to taste`, `as needed`) are not scaled.
- **Rounding and Fractions:**
  - Internally, values are preserved as high-precision floating numbers.
  - Display uses common cooking fractions with denominators 2, 3, 4, and 8 when within $0.03$ of the fraction (e.g., $0.25 \rightarrow 1/4$, $0.333 \rightarrow 1/3$, $1.625 \rightarrow 1\ 5/8$).
  - When outside common fractions, display falls back to a clean decimal rounded to two decimal places (e.g., $1.17$ cups).

### 3.5 Unit Display Preferences
- **Default unit systems (Settings):** The user chooses US customary or metric for volume and, separately, for weight.
- **Recipe-level override (view time):** While viewing a recipe, the user can switch an individual ingredient to a specific unit within its dimension (e.g., teaspoons instead of tablespoons, or ounces instead of grams). These overrides are not saved to the recipe.
- **Dimensions:** Conversion stays within volume or within weight. Volume-to-weight conversion needs a trusted density (3.3).
- **Public pages:** Guests have no preferences, so public pages open in the recipe's stored units and offer the same override controls.
- **System naming:** The app uses "US customary", not "imperial", because UK imperial pints and gallons differ.

---

## 4. Ingredient Presentation and Sorting

### 4.1 The Two Presentation Modes
The recipe card supports two distinct view presentations. This is a reader/device preference, not stored recipe data:

#### A. Standard View (Amount-First)
Inspired by work items and classical cookbooks:
- **Ingredient-row reading order:** Amount, Ingredient (and Detail), then
  Preparation, following conventional recipe-book notation such as
  `1 cup all-purpose flour, sifted`.
- **Desktop layout:** The structured ingredient area sits alongside the
  instruction column. It preserves the amount-first reading order without
  breaking the work-item-style recipe layout.

#### B. Ingredient-First View ("Mine")
Organized by how a cook actually operates in the kitchen ("get the item, check the amount, prep it"):
- **Column 1: Ingredient** (with Detail rendered as a distinct subtitle beneath the name).
- **Column 2: Amount** (quantity and unit, formatted as volume / weight if dual).
- **Column 3: Preparation** (diced, melted, minced, etc.).

```
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
  - Print view: Defaults to Ingredient-First for compact paper layout.
  - Public share view: Defaults to Ingredient-First.

### 4.2 Ingredient Sorting Options
The user can re-sort ingredients dynamically in view mode. The canonical underlying order entered in edit mode is always preserved.

1. **Appears in Instructions (Default):** Ingredients are ordered by their first structured appearance (`#`) in the instruction steps. Unmentioned ingredients appear at the bottom in their entered order.
2. **Alphabetical:** A-Z or Z-A by ingredient name.
3. **By Size (Ascending / Descending):**
   - Strictly partitioned into four sequential, independent groups:
     1. Volume items (normalized to milliliters/cups for relative comparison).
     2. Weight items (normalized to grams for relative comparison).
     3. Count and Informal items (e.g., `2` eggs, `1 bunch` cilantro).
     4. Unmeasured items (e.g., `salt to taste`).
   - Ascending or descending sorts *within* each group. Volume and weight are never mixed into an arbitrary single scale.
   - A row that has both a volume and a weight measurement sorts by its volume measurement.
4. **Order Entered:** The exact sequential order established when editing the recipe.

### 4.3 Manual Reordering
- Every ingredient row has a visible drag handle at its left edge in edit mode.
  Dragging updates the persistent manual order used by **Order Entered**.
- Dragging is a convenience, not a required interaction. Keyboard users can
  focus a row and use explicit Move up / Move down commands; an accessible
  order input or menu provides an equivalent non-drag path.
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
- **`#` Autocomplete Behavior:**
  - Typing `#` triggers an inline autocomplete menu.
  - Autocomplete shows existing ingredients on the current recipe.
  - Typing filters the list in real time. Multi-word ingredients are typed with hyphens in the token (e.g., `#all-purpose-flour`).
  - **Menu Options:**
    1. Select an existing ingredient row.
    2. Select **Create new ingredient** (adds row to ingredients table and links it).
    3. Press `Escape` to cancel autocomplete and leave `#` as plain text.
  - **Rendered Output:** Renders cleanly as normal readable text (e.g., "Add the all-purpose flour and mix").
  - **Trigger Symbol:** `#` on every platform. Phone keyboards have no convenient non-alphanumeric key, and `#` is a familiar mention convention.
  - **Ingredient Mention Style:** In-app instruction mentions default to bold
    dark red to make referenced ingredients easy to scan. User Settings offers
    a dedicated styling control:
    - **Color palette:** A curated set of accessible preset colors (dark red,
      forest green, navy blue, amber/brown, charcoal/default body).
    - **Font decoration toggles:** Independent checkboxes to add **bold**,
      **italic**, and/or **underline**.
    - All combinations must maintain $\ge 4.5:1$ contrast against the app background.
    - Public and printed recipes use the default bold dark-red treatment.
  - **Structured Tracking:** Only confirmed selections create a structured foreign-key link to the ingredient row. Plain text does not trigger instruction-appearance sorting.

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
- In edit mode, typing `#` in the Pairs With field triggers an autocomplete search across all existing recipes in the user's library.

### 5.3 References Section
At the bottom of the card, a Wikipedia-style **References / See More** section supports three distinct reference types:
1. **In-App Publication:** Clickable link to another publication record stored in Recipe Box.
2. **External URL:** Clickable link pointing to a website or blog not formally imported into the library.
3. **Printed Citation:** Non-clickable bibliographic reference (e.g., *The Joy of Cooking, 75th Anniv. Ed., p. 412*) for physical materials not entered as publications.
- **Rule on Origins:** A recipe adapted from multiple disparate sources is considered an original recipe and belongs in the **Recipe Tin** with these references cited at the bottom.

---

## 6. Publications, Magazine Handling, and The Recipe Tin

### 6.1 Publication Types and Attributes
A Publication is any formal collection or entity that contains recipes.

| Publication Type | Specific Attributes | Recipe Location Field | Visual Treatment |
| ---------------- | ------------------- | --------------------- | ---------------- |
| **Book** | Name, Author, Edition (optional), ISBN (optional), Retailer Lookup URL (Amazon, B&N, AbeBooks, etc. - optional), Cover image | Page number or page range | Postage-stamp cover thumbnail. Without an image, show a light-blue book-shaped rectangle with a dark-blue border and italic title text sized to fit. |
| **Magazine Issue** | Magazine Name, Issue / Edition / Date (Required free text e.g., "Oct 2024", "Holiday Issue 2023"), Cover image | None. Magazine recipes have no page number because thin magazines are easier to search by title. The recipe's online URL is recorded through the `+ Site` secondary listing (6.2). | Postage-stamp cover thumbnail. Without an image, show a white magazine-shaped rectangle with a black border and normal title text sized to fit. |
| **Website** | Site Display Name, Site Root URL, Site Logo/Favicon (optional) | Full recipe URL | Minimalist site icon / badge. |

### 6.2 Dual Listing for Magazine Recipes
- Magazines frequently post their recipes online. When a recipe's primary publication is a Magazine Issue, the recipe form shows a `+ Site` button. It selects a Site publication as a secondary source and records the recipe's URL on that site. The recipe then lives in **both** publications (e.g., *Bon Appétit Oct 2024* issue and *bonappetit.com*).
- A recipe has at most one secondary Site listing, and only Magazine-primary recipes offer `+ Site`.
- Deleting a Site publication removes the secondary listings that point to it. It does not move or delete the recipes.
- **Primary Origin Rule:** The magazine issue remains the primary originating publication. The site publication provides a secondary filtered view.

### 6.3 Creation Workflows
Publications can be created from three locations:
1. **The Library:** A prominent `+ New Publication` button.
2. **Recipe Edit Mode:** The Publication field is a searchable single-select combobox with an inline `+ Add new publication` button that opens a compact creation drawer/modal.
3. **Import:** Automatic creation or matching during ZIP bundle imports.

### 6.4 The Recipe Tin (Unparented Recipes)
- **Concept and Identity:** The Recipe Tin is the permanent, unparented container for recipes with no originating publication (family recipes, original experiments, clippings, recipes adapted from multiple sources).
- **Physical Metaphor:** A vintage metal tin box with a hinged lid, containing dog-eared 3x5 index cards and handwritten scraps of paper.
- **Visual Design:**
  - The Recipe Tin container displays a distinctive vintage tin graphic.
  - Recipes belonging to the Recipe Tin are rendered with a subtle, textured **ragged/deckled paper border background** instead of standard clean rounded cards.
  - Normal publication cards remain crisp, clean, and restrained.
- **Mobility:** Any recipe in the Recipe Tin can later be assigned to a publication, and any publication recipe can be unparented into the Recipe Tin.

### 6.5 Deletion Rules for Publications
When a user deletes a publication, the app presents a mandatory dialog with three choices:
1. **Delete all recipes inside** (moves recipes to trash alongside the publication).
2. **Move recipes to the Recipe Tin** (strips publication assignment and gives them the Recipe Tin paper styling).
3. **Move recipes to another publication** (prompts user to pick the destination publication).

### 6.6 Trash, Restore, and Purge
- Deleting a recipe or publication moves it to the trash. "Archive" is not a separate state.
- A trashed item is purged permanently if it is not restored within 30 days of its deletion. A scheduled job performs the purge.
- Restoring an item returns its own references and relationship links.
- A trashed recipe's public URL behaves like a private recipe (404). A purged recipe's URL returns 410, which requires keeping a record of purged public IDs.
---

## 7. Queries, Search, and Library Explorer

### 7.1 Azure DevOps-Style Query Engine
The query engine provides high-density, flexible querying across recipes and publications:
- **Field Selectors:** Query by any metadata field, tag, ingredient, equipment, time, verdict, enthusiasm, publication, or date. Tags are first-class searchable and filterable fields for both recipes and publications.
- **Typed Operators:**
  - Text: `Contains`, `Does Not Contain`, `Equals`, `Starts With`, `Is Empty`, `Is Not Empty`.
  - Multi-select picklists: `Contains Any`, `Contains All`, `Does Not Contain`.
  - Numbers / Times / Dates: `=`, `!=`, `>`, `<`, `>=`, `<=`, `Between`.
  - State / Enums: `In`, `Not In`.
- **Clause Grouping:** Compound boolean logic with `AND` / `OR` operators and bracketed sub-clauses.
- **Saved Queries / Views:** Users can name, save, and pin queries to the navigation bar. Saved queries remember column visibility, column width, and sort order.

### 7.2 Full-Text Search
Fast, indexed text search across:
- Recipe title and aliases
- Notes and gotchas
- Ingredients and details
- Instructions text
- Publication name, author, and notes

### 7.3 Source Library Explorer
The Library screen offers a Windows Explorer-like file browsing experience:
- **View Modes:**
  - **Grid View:** Cover thumbnails with publication name, type, and recipe count.
  - **Details View:** Tabular view with columns for Name, Type, Author, Issue/Edition, Total Recipes, and Date Added.
- **Preview Pane:** Optional side/bottom drawer showing publication metadata, cover image, and external lookup links without listing all recipes.
- **Filter Bar:** Instant toggle buttons to filter by `All`, `Books`, `Magazines`, or `Sites`.

---

## 8. Settings, Taxonomies, and Picklists

### 8.1 Centralized Picklist Management
All picklists are managed in the Settings area to prevent duplicate, misspelled, or orphaned options:
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
  - **Edit:** Rename option (cascades across all recipes).
  - **Delete:** Remove option. If the option is in use, the user must choose a replacement option, which behaves as a merge. Optional fields may alternatively be explicitly cleared on affected records. Ingredients always require a replacement because a recipe row cannot exist without one.
  - **Merge:** Select two or more options to combine into one, automatically reassigning all affected recipes and publications.
- **Ordering:** Each picklist keeps a user-defined order used for display and sorting.
- **Seeding:** New accounts start with the example values listed in section 2.1 for each picklist, in the order listed. All values are editable. `Specific occasion` in Verdict and Enthusiasm is protected: it can be renamed but not deleted or merged, because it reveals Occasion Details.

### 8.2 Trusted Density Registry
Located in Settings:
- Searchable list of canonical ingredients with configured densities.
- Allows defining volume-to-weight equivalencies using the standard quantity and unit picklists (e.g., `1 cup = 120 g` for all-purpose flour; `1 cup = 200 g` for granulated sugar).

### 8.3 Personal Preferences
Located in Settings, per account:
- Default ingredient presentation: Standard or Ingredient-First (4.1).
- Default unit system for volume and, separately, for weight (3.5).
- Ingredient mention style (5.1).

---

## 9. Sharing, Privacy, URLs, and Image Delivery

### 9.1 URL Structure and Hash IDs
- Every recipe has a stable URL incorporating a long random hash ID (e.g., `/r/e7f8a9b2c3d4e5f6`).
- The URL remains identical whether the recipe is public or private.

### 9.2 Privacy Toggle and HTTP Status Behavior
- **Default State:** Recipes are linkable by default.
- **Private Toggle:** Marking a recipe private restricts access to the logged-in owner account.
- **HTTP Response Rules for Unauthenticated / Non-Owner Requests:**
  - **Private Recipe:** Returns **HTTP 404 Not Found** with a generic, calm page ("This recipe is currently unavailable") and `Cache-Control: no-store`. Does not reveal that the recipe exists, nor its title, owner, or publication. (Avoids misusing HTTP 503).
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
  - References section is displayed as static text.
  - In-app pairs-with links are displayed as static text.

### 9.4 Secure Image Delivery
- All covers and recipe images are stored in **private Supabase Storage buckets**.
- The public bucket setting is disabled.
- Image assets are served via short-lived signed URLs generated on the server only after validating that the user is the owner OR that the recipe has public access enabled.

### 9.5 Abuse Protection
- Public recipe routes are rate limited. Initial target: 60 requests per minute per IP address, applied as a Vercel Firewall rate-limit rule on the public recipe path.
- Authentication endpoints keep Supabase's default rate limits.
- Authentication emails (recovery, verification) require a custom SMTP provider; Supabase's built-in email sender is limited to 2 emails per hour.

---

## 10. Authentication and Account Setup

### 10.1 Email and Password Authentication
- Email + password login with standard "Forgot Password" reset link flow.
- **Email Verification:** Verification is the invite. The app emails the invite link to the address the admin enters, and accepting it proves the person controls that mailbox, so there is no separate verification step and no skip option. Open development sign-up has no verification.

### 10.2 Social Authentication
- Google OAuth is an alternative to email/password, not an addition. Each account uses exactly one sign-in method, chosen when the invite is accepted. Methods are never combined or linked on one account.

### 10.3 Invite-Only Sign-Up
- In production, sign-up is invite-only. The admin generates account-creation links for specific people.
- In development, sign-up is open. A per-environment switch controls this; development runs locally and production is set up last (14).
- **Admin:** Admin is an account flag that existing admins can grant. Production starts with a pre-created admin invite to the owner's email address, supplied through configuration and not committed to the repository. This prevents a stranger from claiming the first account. Admins send all later invites.
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
Export is built for catastrophic disaster recovery and migration. The app's own ZIP export is the only backup mechanism; Supabase backups are not used, so a full-database import into an empty account must reproduce the account completely. All exports produce standard `.zip` files containing:
- `manifest.json`: Schema version, export date, bundle scope (`database`, `publication`, or `recipe`), app version, and asset file checksums.
- `data.json`: Normalized relational JSON export of records.
- `/images/`: Folder containing original binary image files for covers and photos.

### 11.2 Export Scopes
1. **Database Export:** Accessible in Settings. Dumps the entire account: all recipes, publications, ingredients, densities, picklists, tags, views, and images.
2. **Publication Export:** Accessible in Library view on any publication card. Dumps the publication, all its recipes, linked references, and associated images.
3. **Recipe Export:** Accessible on any recipe card beside `New Recipe`. Dumps the single recipe, its ingredient rows, steps, images, and basic publication metadata.

### 11.3 Import Conflict Resolution
Importing a ZIP bundle never silently overwrites data. When matching records are detected (by hash or title):
- Prompts user with options:
  - **Keep Existing:** Discard incoming duplicate.
  - **Create Duplicate:** Import as new copy with `(Imported)` appended to the title.
  - **Replace:** Overwrite local record with the imported version.
- Recipe import automatically offers to link to an existing publication if a match exists, or create a new publication from the bundled metadata.

### 11.4 Backup Reminder
Because export is the only backup, Settings shows the date of the last full-database export and a gentle reminder when it is more than 30 days old.

---

## 12. Change History and Forensic Audit

### 12.1 Purpose and Constraints
- Change history exists purely for forensic auditing (e.g., checking "what was the baking time before I changed it?", "when did I add cardamom?").
- **No Version Restore:** To keep the schema and UI clean, full version restoration is explicitly excluded from the v1 scope.
- **Export Exclusion:** History logs are excluded from ZIP backup bundles to keep backups clean and portable.

### 12.2 Captured Audit Events
History events are recorded on save (never on individual keystrokes):
- Recipe / Publication creation
- Metadata edits (field-level before/after diffs)
- Ingredient additions, removals, and quantity modifications
- Step reordering and edits
- Publication assignment and unparenting
- Trashed / restored states
- Account ID and ISO timestamp

---

## 13. Interaction, Keyboard-First Design, and Accessibility

### 13.1 Desktop Ergonomics
- **Keyboard Navigation:** Tab and arrow key traversal through the ingredient edit grid.
- **Shortcut Actions:** Shortcuts for quick save (`Ctrl+S` / `Cmd+S`), adding ingredient rows (`Enter` in the last column), and triggering autocomplete (`#`).
- **No Drag-and-Drop Reliance:** Reordering ingredients and steps uses explicit keyboard-friendly up/down buttons or index input fields.

### 13.2 Mobile Kitchen Ergonomics
- Touch targets strictly $\ge 48\times 48\text{ px}$.
- High-contrast text legible under kitchen lighting.
- Ingredient check-off state (temporary strikethrough/checkbox in cooking mode to track what has been added).
- Screen wake lock / cook mode to keep the mobile screen awake while cooking.

### 13.3 Accessibility Standards
- Contrast ratio $\ge 4.5:1$ across all text.
- Focus outlines visible on all interactive components.
- Dual visual encoding: Density auto-fills use a subtle tint *and* a text/badge label; color is never the sole conveyor of status.

### 13.4 Accessible controls and editable grids
- Prefer native semantic HTML for ordinary page structure, forms, and controls.
- Use React Aria Components when a custom interactive control needs managed
  keyboard and assistive-technology behavior. Keep styling application-owned.
- Use AG Grid Community for the spreadsheet-style ingredient editor only; its
  built-in keyboard navigation and cell editors match the arrow-key and inline
  editing requirements. Read-only data lists remain semantic tables.
- AG Grid Community is MIT-licensed and provides core accessibility, keyboard
  navigation, and cell editing. Do not depend on Enterprise-only features.
  Application-defined cell editors and actions still require focused keyboard,
  screen-reader, and automated accessibility tests. Evaluate screen-reader
  behavior and DOM ordering when the ingredient grid is implemented.

References: [React Aria Table](https://react-aria.adobe.com/Table), [AG Grid
keyboard interaction](https://www.ag-grid.com/react-data-grid/keyboard-navigation/),
[AG Grid accessibility](https://www.ag-grid.com/react-data-grid/accessibility/),
and [AG Grid license comparison](https://www.ag-grid.com/license-pricing/).

### 13.5 Private shell account menu

Use one account menu throughout the private shell. On desktop, place the account
email at the bottom of the left navigation, below navigation links (and directly
below Settings when available). On mobile, use a 48px circular initials control
at the right of the navigation. Both controls open the same menu with the email
and Sign out action.

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
- **Client Architecture:** Progressive Web App (PWA) with manifest, offline view caching for viewed recipes, and service worker.
- **Concurrent Edits:** Each recipe carries a version number. A save based on a stale version is rejected, and the user chooses between reloading the current version and keeping their edits.
- **Environments:** Development runs entirely locally: a local Supabase stack, a local email catcher, open sign-up, and no email verification. Production setup (Supabase, Vercel, Google, email delivery) comes last. Schema changes ship as versioned migrations. Unit, end-to-end, and accessibility checks run locally with one command.

---

## 15. Deferred Features Catalog

The following features were discussed and intentionally set aside for post-v1 releases:
- OCR and camera capture for paper cookbook recipes
- Automated web recipe URL scrapers
- Ingredient alias mapping (e.g., `bell pepper` $\leftrightarrow$ `capsicum`)
- Formal allergen and dietary restriction tags/warnings
- Cooking attempt logs, star ratings over time, and cook history
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
