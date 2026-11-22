# Recipe Box Comprehensive Reference: Publications and Search

[Back to the comprehensive reference index](../comprehensive-reference.md)

> Canonical product requirements: Publications, the Recipe Tin, deletion and
> restore, recipe and publication search, and the source Library explorer.

## 6. Publications, Magazine Handling, and The Recipe Tin

### 6.1 Publication Types and Attributes

A Publication is any formal collection or entity that contains recipes.

All publication types can carry account-owned tags selected during creation or
editing. The form can create or reuse a tag inline; selected assignments are
saved with the publication. Publication detail shows assigned tags as text
chips with the tag's shared translucent pastel color; an empty assignment is
omitted.

| Publication Type | Specific Attributes                                                                                                          | Recipe Location Field                                              | Visual Treatment                                                                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Book**         | Name, Author, Edition (optional), ISBN (optional), Retailer Lookup URL (Amazon, B&N, AbeBooks, etc. - optional), Cover image | Page number or page range                                          | Postage-stamp cover thumbnail. Without an image, show a light-blue book-shaped rectangle with a dark-blue border and italic title text sized to fit. ISBN-10 and ISBN-13 accept pasted separators and format with registered ISBN range hyphens while preserving validation. |
| **Magazine**     | Magazine title and optional cover image                                                                                      | Per-recipe issue, volume, edition/date, and optional page citation | Postage-stamp cover thumbnail. Without an image, show a white magazine-shaped rectangle with a black border and normal title text sized to fit.                                                                                                                              |
| **Website**      | Site Display Name, Site Root URL, Site Logo/Favicon (optional)                                                               | Full recipe URL                                                    | Minimalist site icon / badge.                                                                                                                                                                                                                                                |
| **Collection**   | Reserved Recipe Tin, one per account                                                                                         | None                                                               | Sign-in illustration as decorative cover artwork; cannot be created, edited, or deleted by the User.                                                                                                                                                                         |

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
submitted values are unchanged. The save checks account ownership, active status, and
the version loaded by the editor. Validation, duplicate-title, and stale-version
errors leave the dialog open with its draft intact; the top-right close control
and Escape discard the draft. Delete is available in the edit pane and opens
the existing publication deletion confirmation. Delete stays left-aligned and
Save stays right-aligned at equal widths on desktop and mobile. Updating
metadata preserves the publication ID, its recipe links and locations, and its
cover association. Cover management remains a separate interaction in the edit
pane. The authenticated client has no direct table-update grant; edits go
through the account-scoped update function.

### 6.4 The Recipe Tin Collection

- **Concept and Identity:** The Recipe Tin is a permanent, system-managed
  collection publication reserved for recipes without an external publication
  source (family recipes, original experiments, clippings, recipes adapted from
  multiple sources). Each account has exactly one Tin, displayed before other
  matching Library entries regardless of sort direction.
- **Library Behavior:** Normal search and filters apply. A type or field filter
  can exclude the Tin; selecting Collection shows it. Its static cover uses
  the sign-in illustration at `src/app/images/logo_detail.png`. The former
  `/recipes` destination redirects to the Tin's Library detail page.
- **Physical Metaphor:** A vintage metal tin box with a hinged lid, containing dog-eared 3x5 index cards and handwritten
  scraps of paper.
- **Visual Design:**
  - Private recipe detail shows Recipe Tin in the breadcrumb as its assigned
    Library publication, but does not repeat the recipe title already shown as
    the H1. The attribution does not repeat the Tin. The Tin is a container,
    not an external recipe source.
  - Recipes belonging to the Recipe Tin are rendered with a subtle, textured **ragged/deckled paper border background**
    instead of standard clean rounded cards.
  - Book, Magazine, and Site publication detail and associated private recipe
    detail/edit/history pages use restrained, role-matched tints; the new/edit
    recipe form follows its selected non-Tin publication. Map the existing
    green surfaces, washes, lines, and controls to each type's blue-gray (Book),
    gold (Magazine), or plum (Site) hue without changing their relative
    saturation or lightness.
  - The left navigation uses a paler version of the active tint, distinct from
    the page surface. Recipe Tin and unrelated routes retain the default app
    palette. The mixed-type Library keeps per-type icons and accessible names
    without adopting one page-wide theme or showing type-name badges. Private
    recipe breadcrumbs show the publication name without an additional Book,
    Magazine, or Site badge; the existing Recipe Tin name identifies the
    collection.
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
  with `AND` by default. Find's Query mode optionally combines numbered rules
  with an **Advanced Rules** expression; a visual nested-group builder and
  named-query lifecycle are not included. Numeric filter values, including
  each explicit **Between** bound, use the shared exact-arithmetic input
  contract in the [Numeric Arithmetic brief](../slices/fixes/2026-11-18-numeric-arithmetic.md);
  **Between** remains a two-bound query operator, not a quantity range.
- **Advanced Rules:** A pane lists the current numbered Query rules and accepts
  their numbers with parentheses and case-insensitive `AND`, `OR`, and `NOT`.
  Aliases `&&`, `&`, `||`, `|`, `!`, `-and`, `-or`, and `-not` have the same
  Boolean meaning. Precedence is parentheses, NOT, AND, OR. Every rule must
  appear at least once; errors explicitly list unused or missing references.
  **Add** stages the logic without running the Query; main **apply** runs the
  staged rules and logic together. Clear empties only the pane draft, and Add
  commits that removal. Cancel, X, Escape, and outside-click discard pane edits.
  A floating X beside the italic expression clears staged logic without
  removing rules or changing current results. Query Clear all clears staged
  rules and logic; switching away from Query clears both. Rule IDs remain
  stable while edits are staged: a deleted rule keeps its numbered slot as
  **Rule deleted**, later rules do not shift, and new rules append after the
  highest slot. Deleted references are invalid and never bind to another rule.
  On Apply, compact active rules and update expression numbers by stable rule
  ID while preserving entered text and aliases. Show “Remove or replace the
  deleted rule.” beneath the Advanced Rules link and in the pane for deleted
  references; center it on mobile with next-line spacing and do not repeat the
  deleted rule number. Highlight the invalid number token red in both the
  builder summary and pane until corrected.
  On desktop, place the italic expression to the right of the Advanced Rules
  link and align both text bottoms with the **Don't auto-select columns**
  label; center the expression's remove X and checkbox vertically on their
  respective text. On mobile, right-align the link above the rules and wrap a
  long expression below it, using the full row width and aligning its right
  edge and remove X with the ordinary rule remove controls.
  URL and last-used state retain the versioned expression and rule IDs.
  Owner, active-record, and publication-scope constraints remain outside the
  expression. Independent column filters AND the complete expression; the
  database evaluates it before counts, facets, sorting, and pagination.
  NOT complements each rule's Boolean match, including a nonmatch caused by
  an unavailable value. Bounds are ten rules, 1,024 expression characters,
  256 tokens, 16 parenthesis levels, and 65,536 UTF-8 bytes per envelope.
- **Marker quick filters:** Find's Search mode and each publication's recipe
  list provide immediate, URL-backed toggle buttons visually labeled only ⭐
  and ❤️. Query has no quick marker filters; it provides staged Starred and
  Hearted fields instead. Descriptive accessible names identify each
  marker-only filter. Either may be enabled alone; when both are enabled,
  recipes must have both markers. They combine with other filters using `AND`.
  On mobile, Search filters sit to the left of view controls on the same row;
  publication filters sit below the view and column controls. Keep Choose
  columns attached to the view controls and publication actions beside them
  without overlap.
- **Score search:** Score is available as a recipe filter and sort field.
  Rating comparisons accept signed values from -5 through 5 and support
  Exists/Doesn't Exist checks.
- **Nutrition Query and sorting:** Calories and the other fourteen standard
  FDA label nutrients through Potassium are numeric Query fields and become
  sort choices when their corresponding List columns are visible.
  Their values are the same rounded per-serving estimates shown in the recipe
  editor and reader, including ingredient-derived values and per-nutrient
  recipe overrides. Whole-recipe manual totals are divided by Serves. Unknown
  values remain unavailable rather than becoming zero. Optional vitamins and
  minerals are not Query fields or sort keys. Apply nutrition filters in the
  database before pagination so result counts and pages remain correct.
- **Made Search and Query fields:** Find Search and Query provide **Made**
  count as a numeric field and **Last Made** as a date field. Last Made uses
  explicit-date comparisons and empty/not-empty checks; rolling relative-date
  windows are deferred. These fields are structured filters, not free-text
  search terms. Interpret explicit dates in the current device timezone so
  they match the local date shown in the Last Made column. “Not made since”
  uses a chosen cutoff date. A blank Last Made date can mean no recorded mark
  or an unknown legacy date; Made count distinguishes those cases except while
  State is Will not try. In that state, Made is absent and matches no numeric
  comparison, while Last Made is empty, regardless of preserved stored values.
  While State is Want to try, treat Made as zero and Last Made as empty even
  when stored values are retained; the first successful Made tap resets them.
- **Query columns and Details sorting:** In Details only, applying Query
  automatically selects visible List columns corresponding to its fields
  unless the user checks **Don't auto-select columns** for that application.
  List and Grid never auto-select columns and do not show the opt-out checkbox.
  The resulting Details visibility choice is persisted normally and can be
  changed afterward; place the checkbox below the Clear all and apply button
  row, opposite Advanced Rules. On mobile its label is **Don't add cols.**
  Details renders current-page
  values for hidden columns so revealing one adds populated cells without blank
  tracks. In Details, click a column header to sort ascending; click the active
  header again to toggle direction. Choosing another header starts ascending,
  preserves active filters,
  and resets pagination. Details omits the separate Sort and Sort Order
  controls. Keep headers vertically centered without changing their horizontal
  alignment.
- **Last-used explorer state:** Each explorer restores its User's last-used
  filters, sort key, sort direction, and List/Grid choice. A valid shareable
  URL takes precedence over remembered search state. Publication recipe scope
  remains fixed by its route.
- **List display preferences:** Each account can choose visible List columns
  and resize desktop column widths independently in Find, Library, and each
  publication recipe explorer. A small settings icon opens the column chooser.
  Star and Heart columns are visible by default in each recipe-list explorer
  and may be hidden or shown independently. Made and Last Made are optional
  filterable columns, hidden by default in Find and each publication recipe
  explorer. The Made column uses numeric operators; Last Made uses explicit
  date operators and empty/not-empty checks rather than facets for every
  timestamp. A blank Last Made date can represent either zero recorded marks
  or a legacy unknown date, so use the Made count to distinguish them. Show
  the local date only in the Last Made column, using the current device
  timezone for date comparisons. While State is Will not try, leave both Made
  columns blank and treat the values as absent without clearing them; show
  preserved values again if State returns to Tried. While State is Want to try,
  show Made as zero and Last Made as blank, and sort as zero and empty,
  regardless of preserved values. The first successful Made tap resets them to
  one and now. Sort Will not try values as absent, never by stored values.
  Publication-list filters remain scoped to their publication. A User's saved
  visibility choice
  overrides the default for that exact account and explorer context. Makes and
  nutrition columns are hidden by default. Active custom stamp indicators
  align right in List and stack at the top-right of
  Grid cards; show an available numeric Rating below the Grid marker icons.
  Inactive markers are not drawn. These preferences are not part of
  a saved view or search URL. Column visibility applies immediately; widths are
  adjusted by pointer or touch dragging. Resizing has no keyboard equivalent
  by explicit product choice; all other explorer controls remain
  keyboard-operable. In mobile Details views, active Star and Heart indicators share the
  recipe-title row at the right, vertically centered on the title; the
  remaining metadata continues below. Search and Query Details place the
  numeric Rating beside those stamps without a visible label, with equal
  visible spacing from Rating to Star and Star to Heart; do not repeat Rating
  in a metadata cell. Grid Ratings appear
  below the markers in an opaque pill matching the card surface. Vertically
  center the complete stack in a pill sized to its contents: one Rating or
  marker forms a 32px circle, and additional signals extend the pill vertically
  with equal visual spacing. Negative values remain tomato red. Rating picker
  labels and its accessible score/label name follow the DLC 43 contract; search,
  list, grid, filter, and sort values remain numeric.
- **Nutrition columns:** Each of the fifteen standard nutrients is available
  as an optional recipe List column, hidden by default. Display the per-serving
  estimate in the nutrient's fixed unit; load these values only when at least
  one nutrition column is visible.

### 7.2 Full-Text Search

Fast, indexed text search across:

- Recipe titles
- Recipe notes
- Ingredients and details
- Instructions text
- Publication name, and author

### 7.3 Source Library Explorer

The Library provides a compact publication explorer with a desktop list/grid
and a single-line mobile list. Keep the Library page title visible as the
level-one heading above explorer controls at desktop and mobile widths;
switching view modes does not remove it.

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
    and its aspect ratio inside the cover frame by default. An explicitly saved
    crop uses the User's framing; do not crop automatically. Desktop covers are
    72px wide; mobile cards use 48px covers and truncate long titles and authors
    to one line.
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
  the default recipe photo when available with Fit/contain unless the User has
  saved framing. Filter and sort fields follow the recipe field catalog; Slice
  18 restores its last-used
  state without losing the publication scope. On mobile, Sort, direction, View,
  and List columns form one connected 40px group, with a visible divider
  between View and List columns. Keep publication actions separate, with equal
  8px gaps above 340px, reducing uniformly to 4px at 340px and below without
  horizontal overflow. Show Total Time only when positive: leave its Details
  cell blank at zero, and omit the separator and duration from Grid metadata.
  Positive durations and the existing null fallbacks remain unchanged.

---
