# Recipe Box Comprehensive Reference: Ingredients and Presentation

[Back to the comprehensive reference index](../comprehensive-reference.md)

> Canonical product requirements: Ingredient rows, measurements, density,
> scaling, sets, portions, equivalents, reader modes, sorting, and reordering.

## 3. Ingredient Rows, Measurements, and Density

### 3.1 Ingredient Row Structure

An ingredient and its quantities are permanently tied together in a single
relational row. The desktop edit table displays Ingredient, Specifics, Amount,
Preparation, and Divide values in that order; the Main checkbox and 12px drag
handle sit in a narrow control rail outside the table. The table always has
one trailing empty row.

1. **Main (Checkbox):** Checked if this ingredient defines the essence of the dish (e.g., chicken in chicken soup, lemon
   in lemon bars). Populates the recipe's `Main Ingredients` index used by the Query **Main Ingredient** field and
   Search's **Main ingredients only** option. The checkbox sits outside the table in the row
   control rail and is edit-only. The rail heading, visible help, and checkbox
   description explain its main-ingredient search purpose.
2. **Ingredient (Picker):** Desktop cell suggestions show above and align to the left edge of the active cell. The user
   can select an account-owned canonical ingredient or type a new name. Mobile uses the same addable suggestions inside
   its row editor pane; menus remain within the viewport and use the available space above or below the field.
3. **Quantity (Numeric/Range/Fraction):** Accepts positive decimals, including
   leading-decimal forms such as `.5`, fraction text (`1/2`, `1 1/4`), and
   optionally equivalent Unicode fraction glyphs (`½`, `1 ¼`),
   ranges (`2-3`), and
   comma-grouped whole-number parts (for example, `1,000` , `1,000 1/2` , or `1,000-2,000` ). Blank for Feel phrases.
   On blur, the editor preserves exact values expressible with supported fraction denominators as fraction text;
   other parsed values retain shortest round-trip decimal text instead of being rounded to hundredths. Recipe reading
   groups thousands and displays supported US customary fractions as Unicode glyphs, while preserving range and
   unit-system formatting.
4. **Measurement Category (fixed selector and fields):**
   - **Unit:** The default category. Shows separate Volume amount/unit and Weight amount/unit fields. Either or both
     dimensions may be entered; a slash separates them visually and in recipe display.
   - **Volume Picker:** Predefined, immutable convertible units: teaspoon (tsp), tablespoon (TBSP), fluid ounce (fl oz),
     cup, pint (pt), quart (qt), gallon (gal), milliliter (ml), liter (L).
   - **Weight Picker:** Predefined, immutable convertible units: gram (g), kilogram (kg), ounce (oz), pound (lb).
   - **Count:** A count has no unit. The quantity is simply how many of the ingredient (`2` eggs, `1` cucumber).
     Packaging and portion words such as can or bag are not units: a 14 oz can is entered as 14 oz under Units.
   - **Things Picker:** Settings-managed extensible picklist of non-standard units: bunch, sprig, clove, head, stalk,
     sheet, stick, slice, handful. Amounts in this category scale but do not convert by default or take part in
     density; display pluralizes the unit when the amount (or range maximum) exceeds one. A configured DLC 12 measure
     equivalent lets the private reader switch from Count/Things to its available Volume and/or Weight measures;
     public readers do not expose this Settings data. When both dimensions are available, `Units` reveals both and
     each unit picker can independently switch its slot back to Count/Things. The reader returns to the single
     Count/Things display only when both slots are switched back. When only one dimension is available, show it
     initially and include Count/Things in its normal unit picker. Use concise Count/Things labels, omit a separate
     `Recipe default` unit-list option, and let selecting the saved unit restore the recipe's display. An explicit
     equivalent is also required before Count/Things can contribute to nutrition. Packaging words (can, bag,
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
5. **Specifics (Text):** Qualitative ingredient specification. Displayed in lowercase after the amount in
   recipe view. Examples: `all-purpose` (for flour), `large` (for eggs), `full-fat` (for coconut milk), `unsalted` (for
   butter), `Brummel & Brown` (for margarine).
6. **Preparation (Addable single-value suggestions):** Processing instructions performed on the ingredient before or
   during cooking. Examples: `diced` , `minced` , `cubed` , `melted` , `room-temperature` , `crushed` , and `sliced` .
   Users can add a preparation while editing; saved values appear in future suggestions. Selecting `cubed`, `diced`,
   or `sliced` reveals the separate Size field and an underlined `in`/`cm` unit toggle there.
   Positive inch Size values also accept simple and mixed fractions; centimeters remain decimal-only.
7. **Divide:** An optional two-portion allocation independent of Preparation. The Divide field uses the existing first-
   portion input and read-only remainder; it stores one ratio and its complement. Division values are not preparation
   suggestions.

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
- When a Count/Things measure equivalent and trusted density are both
  configured, density is authoritative for cross-dimension conversion. One
  explicitly saved equivalent dimension supplies the source and density
  derives the other. Existing equivalents that already contain both
  dimensions use Weight as a compatibility source until edited; editing asks
  which dimension to retain. Without trusted density, both explicitly saved
  dimensions remain available. No equivalent or density change rewrites saved
  recipe measurements.

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
  - US customary reader display uses common cooking fractions with denominators 2, 3, 4, and 8 as Unicode glyphs when
    within $0.03$ of the fraction (e.g., $0.25 \rightarrow ¼$ , $0.333 \rightarrow ⅓$ , $1.625 \rightarrow 1\ ⅝$ ).
    Glyphs are slightly larger and vertically centered with surrounding digits, with optical corrections where font
    metrics require them. Other reader quantities display as decimals rounded to two places (e.g., $1.17$ cups).
    Quantity inputs separately accept leading decimals, conventional fraction text, and optional fraction glyphs.
    On blur, exact values expressible with supported fraction denominators remain fraction text; other parsed values
    use shortest round-trip decimal text so formatting does not change their numeric value before save.
  - Metric measurements always display as decimals rounded to at most two decimal places (e.g., $1.5$ L, $0.33$ g,
    $1.625$ g displayed as $1.63$ g); never display metric quantities as fractions.

### 3.5 Unit Display Preferences

- **Default unit systems:** The account stores independent US customary, Metric,
  or Recipe preferences for volume and weight. Recipe mode keeps each saved
  measurement in its intrinsic unit system. Signed-in users change these
  values in Settings' Personal preferences section using the shared portal
  `Picklist`; the shared navigation has no Units shortcut.
- **Preference writes:** A narrow authenticated database function derives the account from `auth.uid()` , validates the
  requested systems, and updates only the preference fields. Direct authenticated account updates remain restricted;
  admin and sign-in-method fields are not writable through this function.
- **Best-fit conversion:** When a stored unit differs from the selected system, choose the largest target-system unit
  whose converted lower amount is at least one; if none qualifies, use the target system's smallest unit. Both
  endpoints of a range use the same unit.
- **Recipe preference:** Volume and Weight preferences are independent. For a
  dimension set to Recipe, resolve each measurement using its saved unit's
  system and allow existing same-system simplification. Never convert between
  US customary and Metric or change saved recipe data.
- **Automatic same-system display simplification:** In the private reader, preserve fractions at or above `1/4` unless
  the amount equals exactly one smaller unit (for example, `1/2 qt` becomes `1 pt`, and `1/4 qt` becomes `1 cup`),
  or the immediate smaller unit expresses it as a fraction from `1/4` up to but not including one (for example,
  `1/4 pt` becomes `1/2 cup`). Amounts below `1/4` step down the supported unit ladder until the displayed amount
  is at least `1/4`; if that value is still below one, continue down while the next smaller unit also stays below one.
  Keep each measurement in one unit; do not decompose it into mixed units. Apply this after scaling and only in the
  private reader's automatic same-system resolution. Public pages continue to preserve stored units.
- **Recipe-level override (view time):** While viewing a recipe, the user can switch an individual ingredient to a
  specific unit within its dimension (e.g., teaspoons instead of tablespoons, or ounces instead of grams). These
  overrides and scale values are transient reader state, never saved to the recipe or account.
- **Reset:** Reset restores the recipe's saved base servings and resolves units from the account defaults again by
  clearing all transient volume and weight overrides.
- **Dimensions:** Conversion stays within volume or within weight. Volume-to-weight conversion needs a trusted density (3.3).
- **Printing:** The printed recipe reflects the active scale, account defaults, and per-ingredient overrides while
  omitting the interactive controls. DLC 08 hides recipe gallery photos, applies the private inline-photo and
  instruction-emphasis preferences, presents metadata as a compact wrapping summary, and requests landscape; the
  browser print dialog may override orientation.
- **Public pages:** Guests have no saved unit preferences. Public recipe pages
  use US customary units and keep scaling and unit overrides transient.
- **System naming:** The app uses "US customary", not "imperial", because UK imperial pints and gallons differ.

### 3.6 Ingredient Sets

Every recipe has at least one ordered ingredient set. Existing recipes migrate
into a set named `Main`; new recipes start with the same default. Each set has a
stable identity, a required trimmed label of at most 80 characters, and a
position within its recipe. Labels are unique within a recipe after
case-folding. Empty sets persist. A populated set must be emptied by explicitly
moving its rows before it can be removed, and the last set cannot be removed.

Each ingredient row belongs to exactly one set. Moving a row preserves its
stable row ID, measurements, and structured instruction mentions. Set order is
independent of row order; reader sorting applies within each set. Empty sets do
not appear in readers. A one-set recipe retains its existing ingredient-list
appearance; multiple non-empty sets use a thin divider with the set label, not a
card. Private, public, print, and offline readers use the same grouping.

Each canonical ingredient can appear at most once within a set. The database
and recipe-save boundary enforce this rule; the migration checks all recipes,
including trashed recipes, and aborts before schema changes if a legacy
duplicate exists. Repeated use in one set is represented by two portions on
that row. The same canonical ingredient may have an independent row, total, and
division in another set.

### 3.7 Divided portions and Size

A divided ingredient keeps its saved measurements as the canonical total and
stores a nullable `portion_one_ratio` strictly between zero and one. Portion 2
uses the complementary ratio. The editor accepts the first portion amount and
shows the computed remainder read-only; scaling and unit conversion apply to
the total before the two displayed amounts are derived. Only scalar Unit,
Count, and Things values divide. Ranges and Feel phrases do not. For rows with
both volume and weight, focusing a unit control selects that dimension only
when its amount is populated, and the resulting ratio applies to both. If only
one dimension has an amount, use it regardless of focus; an empty focused
dimension cannot override it. If the remembered dimension becomes empty, fall
back to the populated one. The selected dimension is an editing aid only; Save
persists one dimensionless ratio, not a preferred display dimension. In Edit,
Divide is a separate field from Preparation. Existing rows whose Preparation
is `divided` load with that value in Divide and an empty Preparation.

Readers calculate each populated dimension's two displayed portion amounts
from the shared ratio after scaling and unit conversion. For a dual-measure
row, show one pair: choose the dimension whose formatted pair contains more
whole-number amounts; if tied, choose the pair with the smaller sum of
displayed amounts; if still tied, choose Volume. Re-evaluate this
display-only choice when scaling or unit preferences change. The Divide cell
does not repeat units. Ingredient-first desktop omits the Divide column when
no row is divided and otherwise sizes it for the portion pair (including
`8 8/8 : 8 8/8`). Mobile uses the existing Prep cell for a second line labeled
`Divide a : b`; when Volume and Weight are both present, stack both totals in
Amount and show the one selected portion pair from the readability rule above.
For the ratios `1 : 1`, `1 : 2`, `1 : 3`, `1 : 4`, `2 : 3`, and `3 : 4`,
show the reduced ratio instead of the formatted portion pair only when the
selected displayed pair uses metric units. Determine eligibility from the
units after scaling and conversion; for dual Volume/Weight rows, use the
existing readable-pair selection. Apply the shorthand in both Standard and
Ingredient-first reader views on desktop and mobile. Customary, count,
informal, unmeasured, and other ratios keep their formatted portion pair.
Print follows the active reader presentation and inherits the same display.
The shorthand never changes amounts or instruction mention popups.

Cubed, diced, and sliced ingredients may have a separate positive numeric Size
with unit `in` or `cm`. Both Size fields are null when absent; Size is valid
only with those preparations. Readers and print format the value using the
recipe quantity formatter and display the preparation before the Size value.
Selecting any of the three preparations in the editor reveals the Size field
and underlined unit toggle in the Preparation section. Inch input accepts
positive decimals, simple fractions, and mixed fractions; centimeter input
remains decimal-only. Fractions are stored as their numeric equivalents.

### 3.8 Nutrition and Measure Equivalents

- No nutrition data is fetched from outside Recipe Box. Settings contains one
  optional user-entered nutrition profile per canonical ingredient. The profile
  uses a positive scalar serving size in one fixed Volume or Weight unit and
  requires Calories. Nutrient amounts are finite and nonnegative; zero is
  known and blank is unknown.
- The fixed core fields are Calories; Total Fat, Saturated Fat, Trans Fat,
  Cholesterol, Sodium, Total Carbohydrate, Dietary Fiber, Total Sugars, Added
  Sugars, Protein, Vitamin D, Calcium, Iron, and Potassium. Amount units are
  fixed per nutrient. **Add vitamin/mineral** exposes only FDA-recognized
  optional label nutrients: Vitamins A, C, E, and K; Thiamin, Riboflavin,
  Niacin, Vitamins B6 and B12, Folate, Biotin, Pantothenic Acid, Choline,
  Phosphorus, Iodine, Magnesium, Zinc, Selenium, Copper, Manganese, Chromium,
  Molybdenum, and Chloride. Values are stored as amounts; %DV is derived from
  FDA adult reference values. No %DV is shown for Trans Fat or Total Sugars,
  and Protein follows FDA label conditions.
- A recipe ingredient uses current Settings nutrition fields as per-field
  defaults. Its serving-size basis may inherit the Settings basis or be
  overridden for that recipe ingredient only. Without a Settings profile, the
  User can enter a recipe-only basis and nutrient values. Settings defaults
  scale to a recipe-only basis when dimensions match. A manually entered field
  overrides only that field and is stored on the recipe ingredient. Clearing
  the override releases it to the current Settings value. Derived/default
  values have a subtle tint and accessible status; manual values do not.
- Each manual recipe-ingredient nutrient override stores its own serving-size
  basis. If the row inherits its basis from Settings and that Settings basis
  changes, affected values are marked stale and automatic recipe calculation
  stops. Recipe-only serving-size bases are independent of Settings. Editing a
  stale field assigns the current effective serving-size basis. Saving without edits opens a
  **Serving changed** confirmation dialog with filled **Keep stale** and
  **Update as-is** buttons plus **Cancel**; updating acknowledges the old basis without changing its
  value or basis. A later basis change makes it stale again. Stale values are
  red-tinted with a “serving changed” tag; color is never the only cue.
- Settings may define one average equivalent per canonical ingredient: either
  one Count or one selected Things unit, mapping an amount of one to optional
  Volume and/or Weight amounts. Users may enter estimates even for
  non-countable Things such as bunch, handful, or head; the app never supplies
  defaults or infers equivalency. This mapping is separate from Trusted
  Density. Count/Things-to-other-dimension conversion may use only the selected
  ingredient's explicit mapping and trusted density.
- Remove Pinch and Dash from the default Things picklist and migrate existing
  recipe uses to fixed Volume values (`1 pinch = 1/16 tsp`; `1 dash = 1/8
  tsp`). Reader display may continue aliasing the scalar 1/16 tsp amount to
  “pinch”; Pinch is not a stored unit.
- Calculate each populated ingredient row once. Select the saved dimension
  matching the nutrition profile basis; when both Volume and Weight exist,
  never add both. Convert within dimensions with fixed factors, and cross
  dimensions only through the ingredient's trusted density. A Count or Things
  amount requires its explicit equivalent. Same canonical ingredients in
  different sets remain independent contributions.
- Ranges, Feel, missing/unsupported amounts, missing Calories, incompatible
  dimensions, and unacknowledged stale overrides make that row ineligible.
  Do not average ranges or silently use an endpoint. A recipe automatically
  calculates only when every populated ingredient row is eligible and has
  serving-count semantics; no Serves means no per-serving display. For each
  nutrient, calculate a total only when every ingredient has a known value for
  it; explicit zero counts as known.
- Divide the full-recipe totals by positive Serves to show per-serving values.
  Recipe-level manual values are whole-recipe totals and override only their
  matching calculated nutrient. Clearing a manual value releases it back to
  calculation. Unedited nutrients stay calculated. Values are not adjusted for
  cooking loss and are labeled estimates, not laboratory results or nutrition
  advice.
- Ingredient Settings profiles and measure equivalents are User-only. Public
  pages, print, offline snapshots, history, and versioned bundles preserve the
  recipe-level outputs and required data without exposing Settings profiles in
  public projections. See [DLC 12](slices/dlc/dlc-12-recipe-nutrition.md).

---

## 4. Ingredient Presentation and Sorting

### 4.1 The Two Presentation Modes

The recipe card supports two distinct view presentations. This is a reader/device preference, not stored recipe data:

#### A. Standard View (Amount-First)

Inspired by work items and classical cookbooks:

- **Ingredient-row reading order:** Amount, Ingredient (and Specifics), then
  Preparation, followed by a separately labeled Divide value when present,
  following conventional recipe-book notation such as
  `1 cup all-purpose flour, sifted`.
- **Desktop layout:** The structured ingredient area sits alongside the
  instruction column. Give Ingredients a stable 46% reader-grid track and let
  Instructions use the remaining space; the track does not resize based on
  which ingredient fields are populated. In Ingredient-First view, the table
  fills the full Ingredients track even when measurement, specifics, or
  preparation cells are empty. At 760px and below, stack Ingredients before
  Instructions and keep the table full width within its section.

#### B. Ingredient-First View ("Mine")

Organized by how a cook actually operates in the kitchen ("get the item, check the amount, prep it"):

- **Ingredient:** Specifics render as a distinct subtitle beneath the name.
- **Amount:** Desktop keeps Volume and Weight separate. On mobile, use one
  Amount column and stack Volume above Weight when both are present.
- **Preparation:** Diced, melted, minced, and other processing instructions.
- **Divide:** A conditional desktop column, omitted when no row is divided.
  Mobile keeps the existing Prep column and places `Divide a : b` on a second
  line without adding a column or subheading. For dual measures, the displayed
  pair follows the readability rule in § 3.7.

```text
+---------------------------+----------------+---------------+--------+
| Ingredient                | Amount         | Preparation   | Divide |
+---------------------------+----------------+---------------+--------+
| flour                     | 1 cup / 120 g  |               |        |
|   all-purpose             |                |               |        |
| eggs                      | 2              |               |        |
|   large                   |                |               |        |
| onion                     | 1              | diced         |        |
| butter                    | 2 cups         | softened      | 1 : 1  |
| coconut milk              | 14 oz          |               |        |
| salt                      | to taste       |               |        |
+---------------------------+----------------+---------------+--------+
```

- **Defaults:**
  - Authenticated desktop view: User-configurable default in settings (defaults to Standard).
  - Authenticated mobile view: Defaults to Ingredient-First.
  - Print view: Follows the active ingredient presentation. Until Slice 16
    introduces alternate reader views, print uses Standard presentation while
    retaining Slice 13's active scale and unit choices.
  - Public share view: Defaults to Ingredient-First.

- Reader unit labels, including single-letter units such as `g`, have one
  continuous underline at rest so unit changes are discoverable without hover.
  Unit overrides and scale remain transient. A scalar US
  customary teaspoon value displays as `pinch` only when it is closer to
  `1/16 tsp` than to `0` or `1/8 tsp`; midpoint ties, ranges, other units, and
  values shown outside teaspoons remain numeric. This alias never changes the
  saved measurement.
- Reader controls share the Ingredients heading line when the heading, summary,
  and toolbar fit together, and start immediately after the title group. The
  lowercase italic summary sits directly below Ingredients. When the title,
  summary, and toolbar do not fit, keep the title and summary at their natural
  width and wrap the toolbar below the summary. At 760px and below, always place
  the toolbar on its own row below the summary. The sort-direction control keeps
  its slot when unavailable on wider layouts, but collapses on mobile so visible
  controls align with the heading. The Screen Lock control follows Scale at the
  standard mobile toolbar gap. In mobile Ingredient-first cook mode, the table
  remains aligned to the section's left edge instead of shifting right to
  center the added checkbox column. The 21px checkbox rail gives the checkbox
  1mm clearance from the table edge and ingredient column, with a 48px-tall hit
  area.
- Screen recipe content uses at most 96 CSS pixels of outer gutter on each
  side of the main-content area, excluding navigation. Overview, reading,
  nutrition, Notes, and other section groups share aligned outer edges; internal
  column spacing is not an additional outer inset. Print retains its page margins.
- Indented instruction lists preserve semantic nesting, sibling order, and mixed
  ordered/unordered child lists. Explicit instruction-photo widths use the
  requested CSS pixels up to available space; the default remains 200px.
  Desktop photos become bounded blocks when the requested width would leave
  less than 240px for adjacent text. Mobile photos remain blocks.

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
   - Ascending or descending sorts _within_ each group. Volume and weight are never mixed into an arbitrary single scale.
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
  edit/popover. The explicit Save recipe button or the `Ctrl+S`/`Cmd+S`
  recipe-editor shortcut saves the recipe; see §13.1 for shortcut behavior.
- Reordering changes only the canonical entered order. Temporary view sorts do
  not rewrite it.

---
