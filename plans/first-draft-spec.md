# Recipe Box First-Draft Specification

> **Document authority:** [plans/comprehensive-reference.md](comprehensive-reference.md)
> is the master document. This spec is the high-level strategy summary and must
> always defer to it. If the two disagree, the reference wins and this spec is
> corrected. Read this spec first, then open only the reference sections the
> current work needs.

## Product

Recipe Box is a private, relational recipe application with database-backed
links, configurable data, and Azure DevOps-style information density.
See [comprehensive-reference.md § 1](comprehensive-reference.md#1-product-vision-and-paradigm).

It is a TypeScript web application built with Next.js and React on Vercel.
Supabase Postgres provides relational data, authentication, and search.
Private Supabase Storage buckets hold covers and recipe images. The web app is
an installable progressive web app; native mobile clients are future work.

Desktop is keyboard-first and optimized for data entry, detail, and queries.
Mobile is touch-first and optimized for quick lookup, entry, scaling, and
cooking. The two experiences share data and rules but are not the same layout.

## Scope

The first release includes recipes, publications, the Recipe Tin, ingredients,
measurement conversion, settings-managed picklists, tags, queries, history,
sharing, printing, and ZIP-based backup and import.

The first release excludes OCR and URL import, ingredient aliases, diet and
allergen modeling, collaboration, cooking history, and native mobile clients.

## Terms

| Term | Meaning |
| ---- | ------- |
| Publication | A book, magazine issue, or website that can own recipes. |
| Recipe Tin | The permanent home for recipes without a primary publication. |
| Reference | Supplemental source material attached to a recipe. |
| Detail | An ingredient qualification such as `all-purpose`, `large`, or `14 oz`. |
| Preparation | Handling such as `diced`, `melted`, or `minced`. |

## Recipes

Each recipe has an internal ID and a random public-link ID. It has zero or one
primary publication. A recipe without one belongs in the Recipe Tin and may be
assigned a publication later.
See [comprehensive-reference.md § 2](comprehensive-reference.md#2-recipe-card-and-metadata).

Recipes include name, primary publication, page or recipe URL, food type
(e.g., roast, pie, galette, casserole, pasta, soup, sauce, cake, cocktail),
multi-select meal type (e.g., breakfast, lunch, dinner, appetizer, side dish,
snack, dessert, drink, booze, sauce), multi-select cuisine (e.g., American,
Italian, Chinese, Mexican, French, Fusion), tags, equipment (e.g. small/medium/large
pan, bowl, baking sheet, skillet, spatula, whisk, peeler), an optional positive
integer Serves count, notes, and separate
optional times for chill, freeze, marinate, prep, mix, cook, bake, cool, rest,
and total.

Food type describes what is made. Meal type describes when or how it is used.
New recipes default to Want to try; State and its active response appear
immediately below Name, with Serves at the end of that row. Food Type, Meal Type,
and Cuisine occupy the next wrapping row; Equipment follows Serves on the State
row.
Multi-value picklists use compact checkmark dropdowns with a stable trigger width,
not checklists. Selected values use a checkmark and pale green, bold text.
Total time is manual. An explicit calculate control (`Σ`) visibly
replaces total time with the sum of entered time fields only after the user invokes it.

State is Want to try, Tried, or Will not try. State conditionally shows Enthusiasm,
Verdict, or Reason:
- Verdict (when Tried): concepts such as favorite, delicious, staple, practice,
  try again, occasionally, specific occasion, once-a-year-rich, so-so, no,
  hell no, MISTAKE. `Specific occasion`, `Once-a-year-rich`, and `So-so` appear
  consecutively in that order.
- Enthusiasm (when Want to try): concepts such as absolutely, sounds good!,
  try, specific occasion, maybe, eh.
- The empty Enthusiasm prompt is "What am I feeling?".
- Occasion detail: text field shown when Verdict or Enthusiasm is Specific occasion.
- Reason: single-line text explaining why the recipe will not be tried.

Changing State clears the Verdict, Enthusiasm, Occasion detail, and Reason
values that no longer apply. Recipes can also carry photos; the add-photo
mechanism is defined in the Images slice
(see [comprehensive-reference.md § 2.3](comprehensive-reference.md#23-recipe-photos)).

### Ingredients

An ingredient and its measurements are one ordered row.
See [comprehensive-reference.md § 3](comprehensive-reference.md#3-ingredient-rows-measurements-and-density).
The edit grid is:

| Ingredient | Quantity | Unit | Detail | Preparation |
| ---------- | -------- | ---- | ------ | ----------- |
| Canonical ingredient | Numeric amount | Unit picker (not used for Count) | Optional text | Addable single-value suggestion |

The Main checkbox and a compact drag handle sit in a rail beside the table.
Desktop starts with one trailing empty row; activating a value opens a compact
cell editor. Mobile shows one ingredient column and opens a compact row popover
when tapped. The Main checkbox is edit-only and is not a table column.

The Main checkbox builds the searchable main-ingredient index. It does not need
to appear in read-only recipe views.

Measurement types are Volume, Weight, Count, Informal, and Unmeasured. Volume
and Weight use fixed recognized units. Count is a bare number with no unit
(`2` eggs). Informal is a number with a Settings-managed non-standard unit such
as bunch, sprig, or clove; it scales but never converts. Packaging words such as
can are not units, so a 14 oz can is entered as 14 oz Weight. Unmeasured uses
approved phrases such as `to taste`, `as needed`, and `for garnish`.

A row may have both volume and weight measurements. The second is added on
demand and displays as, for example, `1 cup / 120 g`. Detail is free text and
renders as an Ingredient subtitle in Ingredient-first view. Preparation is a
single-value suggestion list that accepts new user-entered values.

Numeric values accept integers, ranges, decimals, fractions, and mixed numbers.
Store precise values. Display common fractions with denominators 2, 3, 4, and 8
where practical; otherwise display up to two decimal places.

Settings supports one trusted density per canonical ingredient, expressed with
the same volume and weight controls, for example `1 cup = 120 g`. An empty
convertible measurement auto-fills from trusted density. Derived values have a
visual treatment and accessible label. Editing a derived value makes it manual;
clearing it and leaving the field re-applies the density.

Recipes are base batches. Readers can select target servings, multiply, or
divide. Scaling changes numeric amounts but does not invent precision for
unmeasured values. Unit conversion works within volume or weight dimensions;
cross-dimension conversion requires trusted density.

Settings holds a default unit system for volume and a separate one for weight
(US customary or metric). While viewing a recipe, the reader can switch an
individual ingredient to a specific unit, such as teaspoons instead of
tablespoons or ounces instead of grams. Those recipe-level choices are not saved
to the recipe.

### Instructions And Relationships

Instructions are ordered markdown blocks, and notes are markdown too.
See [comprehensive-reference.md § 5](comprehensive-reference.md#5-instructions-autocomplete-and-recipe-linking).
Typing `#` starts ingredient-link
autocomplete. The user can select an existing ingredient row, create and link a
new one, or press Escape to cancel. The editor accepts lookup tokens such as
`#all-purpose-flour` but renders readable text. Structured references determine
the default ingredient sort by first instruction appearance. Only selected or
newly created structured ingredient references count; ordinary text does not.

Recipes support Pairs with entries as ordinary text or directional recipe links.
Typing `#` in Pairs with searches existing recipes and creates a link; a tooltip
explains this optional linking behavior. Linked entries show both outgoing and
incoming relationships. A References section supports in-app publications,
external URLs, and printed citations.
References do not change the primary-publication rule.

### Views And Sorting

Ingredient presentation is a viewer preference, not recipe data.
See [comprehensive-reference.md § 4](comprehensive-reference.md#4-ingredient-presentation-and-sorting).

- Standard lists each ingredient as Amount, Ingredient (with Detail), then
  Preparation, beside the instructions.
- Ingredient-first displays Ingredient, Amount, and Preparation, with Detail as
  an Ingredient subtitle.

Signed-in users can save a default. Print and public pages use Ingredient-first
by default. Sort choices are first instruction appearance, alphabetical, size,
and entered order. Size has fixed groups: volume, weight, count and informal, then rows with
no usable amount. Ascending and descending only order within a group. A row
with both volume and weight sorts by its volume. Edit mode
has a left-edge drag handle for persistent manual reordering, with keyboard and
other non-drag controls providing the equivalent operation.

## Publications And Recipe Tin

Publication types are Book, Magazine, and Site.
See [comprehensive-reference.md § 6](comprehensive-reference.md#6-publications-magazine-handling-and-the-recipe-tin).
The Library supports grid and
details views, sorting, type filtering, and an optional preview pane.

- All publications have name, type, optional image, tags, and a recipe list.
- Books have author, optional edition, ISBN, and external lookup URL (e.g., Amazon, B&N, AbeBooks).
- Magazines are individual issues, with required free-text issue, edition, or
  date. Magazine recipes have no page number.
- Sites have display name and site URL.

A recipe whose primary publication is a Magazine has a + Site button that picks
a Site Publication as a secondary source and records the recipe's URL there. The
recipe lists under both publications, and the magazine issue remains primary.
The searchable single-select
Publication picker includes Add new publication. Creating a recipe inside a
publication preselects it; app-level creation starts in the Recipe Tin.

A publication recipe list displays each recipe's state, meal type, food type,
applicable enthusiasm, verdict, or reason, and total time. A recipe displays a
page or a recipe URL according to its publication context, not both together.

The Recipe Tin is permanent and has a distinctive tin-and-paper treatment (hinged
tin lid graphic, ragged/deckled paper background for its recipe cards).
Ordinary publication and recipe cards remain restrained. Deleting a publication
prompts to delete recipes, move to Recipe Tin, or move to another publication.

## Queries And Settings

Recipes and publications are searchable, filterable, sortable, and available as
saved views with selected columns.
See [comprehensive-reference.md § 7](comprehensive-reference.md#7-queries-search-and-library-explorer).
Advanced queries support typed conditions,
field-appropriate operators, AND/OR groups, blank checks, and full-text search
across names, notes, ingredients, instructions, publications, and authors.

Settings manages ingredients, tags, food types, meal types, cuisines, equipment, verdicts,
enthusiasm, informal units, unmeasured phrases, and other picklists.
See [comprehensive-reference.md § 8](comprehensive-reference.md#8-settings-taxonomies-and-picklists).
Values can be
added, modified, deleted, or merged. Deleting an in-use value requires choosing
a replacement; optional fields may instead be explicitly cleared, but
ingredients always need a replacement. Settings also holds personal
preferences: default ingredient presentation, unit systems, and ingredient
mention style.

## Sharing And Authentication

Recipes are linkable by default at stable random URLs.
See [comprehensive-reference.md § 9](comprehensive-reference.md#9-sharing-privacy-urls-and-image-delivery)
and [comprehensive-reference.md § 10](comprehensive-reference.md#10-authentication-and-account-setup).
A Private toggle limits
viewing to the owning account while preserving the URL. Public readers can scale,
convert units, and print, but cannot navigate, open references, edit, or access
publication links. Attribution may appear but is not clickable.

Public recipe images are served from private storage only after the recipe's
public-link access check succeeds. The application must not expose a generally
public image bucket.

A private or trashed recipe URL returns a custom unavailable page with HTTP
`404` and `Cache-Control: no-store`. A permanently purged recipe returns HTTP
`410`. The public payload allow-list permits title, Serves, timings,
equipment, ingredients, instructions, and static publication attribution, while
strictly omitting personal fields (verdict, enthusiasm, reason, notes, gotchas)
and change history.

Support password sign-in, password recovery, and Google sign-in. Each account
uses exactly one sign-in method, chosen when its invite is accepted.
In production, sign-up is invite-only: an admin generates account-creation
links, and the owner's account is created by accepting a pre-created admin invite
sent to the configured owner email address. Admin is a flag that existing admins
can grant. Invites are emailed, and accepting one verifies the email address.
Development keeps sign-up open, with no verification, through a per-environment
switch.

Print uses Ingredient-first presentation, selected scaling, and selected units.

## Import, Export, Lifecycle, And History

All recovery exports are ZIP bundles with a manifest, structured JSON, assets,
and checksums. History is excluded. These exports are the only backup
mechanism; Supabase backups are not used. Settings shows the last export date and
reminds the user when it is more than 30 days old.
See [comprehensive-reference.md § 11](comprehensive-reference.md#11-import-export-and-backup-bundles)
and [comprehensive-reference.md § 12](comprehensive-reference.md#12-change-history-and-forensic-audit).

- Settings provides Export database and Import database.
- The Library provides Export publication and Import publication beside New
  publication.
- Recipe views provide Export recipe and Import recipe beside New recipe.

Imports never overwrite silently. Matching records offer Keep existing, Create
duplicate, or Replace. Recipe import can link to an existing publication or
create its bundled publication.

Deleting a recipe or publication moves it to the trash, and it is purged
permanently if not restored within 30 days. Deleting a publication offers
Delete its recipes, Move recipes to Recipe Tin, or Move recipes to another
publication. A restored recipe's own relationships and references return.

Recipes and publications record append-only forensic history on save, not each
keystroke. Entries capture creation, edits, trash and restore, and
changes to ingredients, instructions, references, tags, relationships, and
publication links. Each includes timestamp and account. Version restoration is
explicitly excluded from the first release.

## Accessibility

The first release includes semantic controls and labels, keyboard-first desktop
operation, visible focus, sufficient contrast, touch-sized mobile controls, and
no drag-and-drop-only workflows. Baseline accessibility is not deferred.
See [comprehensive-reference.md § 13](comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility).

## Testability and delivery

Every behavior must be designed for deterministic local automation and receive
focused automated tests before its production code. The test suite covers unit
logic, database and service boundaries, end-to-end user workflows, and
accessibility for each screen. A manual demonstration is evidence that a slice
works, not a substitute for automated acceptance coverage. See
[comprehensive-reference.md § 16](comprehensive-reference.md#16-testability-and-test-first-delivery).

## Deferred Work

See [comprehensive-reference.md § 15](comprehensive-reference.md#15-deferred-features-catalog).

- URL, text, photo, and OCR import.
- Ingredient aliases and normalization.
- Diet, allergen, substitution, and nutrition features.
- Cooking history, favorites, and per-cook notes.
- Collaboration and household sharing.
- Native mobile clients.
- Recipe-version restoration.
- Dark theme.
