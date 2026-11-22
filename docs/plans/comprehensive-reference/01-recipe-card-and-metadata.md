# Recipe Box Comprehensive Reference: Recipe Card and Metadata

[Back to the comprehensive reference index](../comprehensive-reference.md)

> Canonical product requirements: Recipe identity, metadata fields, times, photos, entry presentation, and nutrition.

## 2. Recipe Card and Metadata

### 2.1 Metadata Fields Breakdown

The top portion of the desktop recipe card contains compact, dense metadata inspired by Azure DevOps work items:

| Field Name              | Type                                           | Options / Formats                                                                                                                | Behavior & Visibility                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                | Text                                           | Free text                                                                                                                        | Primary recipe title.                                                                                                                                                                                                                                                                                                                                                  |
| **Primary Publication** | Single-select picker                           | Searchable list of all user publications, including the reserved Recipe Tin collection, + "Add new publication" button           | Clickable in view mode; navigates directly to the publication page. Every recipe belongs to a publication; Recipe Tin is the default collection and has no location fields.                                                                                                                                                                                            |
| **Location**            | Text / URL                                     | Book page or range; free-text Magazine citation; website recipe URL                                                              | A Magazine citation is free text because citation styles vary. Its optional online recipe URL is a separate field and may coexist with the citation.                                                                                                                                                                                                                   |
| **Food Type**           | Single-select picklist                         | Casserole, roast, pie, galette, pasta, soup, sauce, cake, cocktail, bread, stew, salad, etc.                                     | "What kind of dish is this?" Settings-managed picklist; use a compact custom dropdown aligned with the other picklist triggers.                                                                                                                                                                                                                                        |
| **Meal Type**           | Multi-select picklist                          | Breakfast, lunch, dinner, appetizer, side dish, snack, dessert, drink, booze, sauce, etc.                                        | "When or how do I serve this?" Settings-managed multi-select dropdown. Multiple values are toggled with buttons; selected values show a checkmark, leaf-green text, and a pale green background.                                                                                                                                                                       |
| **Cuisine**             | Multi-select picklist                          | American, Italian, Chinese, Mexican, French, Thai, Indian, Fusion, etc.                                                          | Settings-managed multi-select dropdown to cleanly support fusion cooking.                                                                                                                                                                                                                                                                                              |
| **Main Ingredients**    | Derived index                                  | Derived from ingredient rows                                                                                                     | Not an independent metadata input. Automatically compiled from ingredient rows marked with the `Main` checkbox. Queryable as the **Main Ingredient** multi-select field and used by Search's **Main ingredients only** option.                                                                                                                                         |
| **State**               | Single-select enum                             | `Want to try`, `Tried`, `Will not try`                                                                                           | New recipes default to `Want to try`. Place State immediately after Name; its active Enthusiasm, Verdict and optional Score, or Reason, Serves, and Equipment share its row. Food Type, Meal Type, and Cuisine follow on the next wrapping row. Changing State clears stale conditional values, including Score.                                                       |
| **Verdict**             | Single-select picklist                         | Favorite, delicious, staple, practice, try again, occasionally, specific occasion, once-a-year-rich, so-so, no, hell no, MISTAKE | Visible **only** when `State == Tried`. Combines emotional verdict, culinary opinion, and repeat cadence ("Law of Undulation"). User-customizable in settings. Existing values, including Favorite, are preserved and are not mapped to Score, Star, or Heart.                                                                                                         |
| **Score**               | Optional signed integer                        | `-5`, `-3`, `-1`, `0`, `1`, `2`, `3`, `4`, `5`                                                                                   | Visible only when `State == Tried`; changing State away from Tried clears it. The private detail picker labels are `NO`, `Bad`, `Needs work`, `Eh`, `Okay`, `Decent`, `Good`, `Great`, and `Amazing` in score order; assistive technology receives both the signed value and label. Store and preserve only the signed integer. Negative numeric values use red as a supplementary cue wherever Rating appears in private detail and list views. |
| **Star**                | Boolean marker                                 | On or off                                                                                                                        | Private “note this” marker, available in any State. Toggled immediately through a custom stamp control on private recipe detail; independent of Heart and Verdict. Each recipe defaults off.                                                                                                                                                                           |
| **Heart**               | Boolean marker                                 | On or off                                                                                                                        | Private “love this and want to repeat it” marker, available in any State. Toggled immediately through a custom stamp control on private recipe detail; independent of Star, Score, Verdict, and State. Each recipe defaults off.                                                                                                                                       |
| **Made**                | Nonnegative integer count and nullable timestamp | Count and last-made timestamp                                           | Private detail uses a stew-pot action with the count centered. A successful mark is allowed once per current device local calendar day and records an absolute timestamp. Changing State to Tried initializes a zero count to one; Tried requires count >= 1. Legacy Tried recipes may have an unknown timestamp. The control is disabled while State is Will not try. Find Search and Query provide numeric Made-count and explicit-date Last-Made filters; both are optional filterable columns hidden by default in Find and publication-specific recipe lists. The Last Made column shows the local date only; private detail otherwise retains the date and time. While State is Want to try, show Made as zero and Last Made as empty while preserving stored values until the first successful Made tap resets them to one and now. Returning to Tried before that tap restores prior values. While State is Will not try, hide both values and treat Made as absent for numeric filters and Last Made as empty. Owner backups preserve the fields; private and public print/download output omits them. |
| **Enthusiasm**          | Single-select picklist                         | Absolutely, sounds good!, try, specific occasion, maybe, eh                                                                      | Visible **only** when `State == Want to try`. The empty prompt reads “What am I feeling?” User-customizable in settings.                                                                                                                                                                                                                                               |
| **Occasion Details**    | Free text                                      | Text string describing the occasion                                                                                              | Visible **only** when either Verdict or Enthusiasm has `Specific occasion` selected.                                                                                                                                                                                                                                                                                   |
| **Reason**              | Single-line text                               | Text string explaining rejection                                                                                                 | Visible **only** when `State == Will not try`.                                                                                                                                                                                                                                                                                                                         |
| **Equipment**           | Multi-select picklist                          | Small pan, medium skillet, 12-inch cast iron, stand mixer, baking sheet, chef knife, spatula, whisk, peeler, blender, etc.       | Settings-managed multi-select dropdown; follows Serves on the State row.                                                                                                                                                                                                                                                                                               |
| **Serves**              | Optional positive integer                      | Number of people served (e.g., `4`)                                                                                              | Appears on the State row before Makes and Equipment. It is the base serving count for recipe scaling. Editable numeric input follows the [Numeric Arithmetic contract](../slices/fixes/2026-11-18-numeric-arithmetic.md).                                                                                                                                                              |
| **Makes**               | Optional paired positive integer and free text | `makes_quantity` and `makes_thing`, such as `2 cakes`                                                                            | Appears beside Serves under one Makes heading. Both values are saved together or left blank; the quantity scales with the reader while the authored thing text stays unchanged. Editable numeric input follows the [Numeric Arithmetic contract](../slices/fixes/2026-11-18-numeric-arithmetic.md).                                                                         |
| **Nutrition**           | Optional estimated nutrient values             | FDA label nutrients and approved optional vitamins/minerals                                                                      | Shown as an italic sans-serif “Nutrition Per Serving” Nutrition Facts-style list after Notes (left of Notes on desktop) when Serves and nutrition values are available; print and downloads use one compact string. Values are estimates from User-entered ingredient profiles and/or whole-recipe overrides, never an external lookup.                                |
| **Tags**                | Multi-select account-owned tags                | Flat freeform tags can be created or reused inline; Settings manages their shared pastel color and catalog lifecycle             | Translucent color distinguishes tags visually. Private detail chips preserve their text and are searchable across both entity types in Slice 17.                                                                                                                                                                                                                       |
| **Notes**               | Markdown text                                  | Multi-line text                                                                                                                  | Captured gotchas, recipe tweaks, variations, and improvement observations.                                                                                                                                                                                                                                                                                             |
| **Pre-recipe Prep**     | Markdown pre-instruction                      | Compact auto-growing instruction row                                                                                             | Optional unnumbered pre-instruction, stored separately from Notes and ordered steps; supports ingredient references and marked duration emphasis without creating recipe time entries. Detail shows a tomato-accented Pre-recipe Prep callout before the steps and a title indicator only when saved content is non-empty.                                                   |

When State is **Will not try**, suppress the Made count and timestamp from all
owner-facing recipe views, including private detail, Find Search/Query, and
Made columns. Treat Made as absent for numeric filters and Last Made as empty.
Sort both values as absent too. Keep the stored values unchanged so they can be
shown again if State returns to Tried.

When State is **Want to try**, show Made as zero and Last Made as empty in
owner-facing views, filters, and sorting while retaining the stored values.
The first successful Made tap resets them to one and the current timestamp;
returning to Tried before that tap restores prior values.

Recipe reading, public, print, and standalone recipe outputs display assigned
Equipment labels in lowercase. This is presentation-only; the shared catalog,
Settings, search labels, and saved assignment IDs retain their existing values.

Made count and last-made timestamp are private owner data. They are not part of
the public recipe allow-list or public output.

### 2.2 Time Tracking and Overlapping Times

Recipes can have any number of ordered time entries. Each entry has a
Settings-managed Time Type and a non-negative whole-minute value. The default
types are Prep, Mixing, Marinate, Chill, Freeze, Cook, Bake, Cooling, and Rest;
Users may add and manage more types in Settings. Multiple entries may use the
same type. Time values remain minutes in storage.

- **Total Time:** The editor displays a read-only total equal to the sum of all
  entries. It is zero when no entries exist. Overlapping activities are not
  discounted. Find Recipes retains Total Time filters and its column, but
  removes the former fixed component-time filters and columns.
- **Expression Input:** Time values use the shared exact-arithmetic input
  contract in the [Numeric Arithmetic brief](../slices/fixes/2026-11-18-numeric-arithmetic.md).
  Evaluate expressions before field normalization; time values then normalize
  to the nearest whole minute, with ties away from zero, and retain the
  existing non-negative validation. Do not save the equation. Invalid,
  incomplete, negative, divide-by-zero, or out-of-range results remain visible
  as errors and block save. Never evaluate an expression as JavaScript.
- **Legacy Migration:** Preserve non-null fixed component values as entries
  with their matching default Time Type. If a recipe has no component values
  but has a manual total, create a Cook entry with that value. If component
  values exist, their sum becomes the total even when it differs from the old
  manual total.
- **Card Display Rule:** Show only non-zero/applicable entries and the derived
  Total Time on recipe cards and summaries.
- **Reader Display Rule:** Time summaries use the heading “Time Breakdown.”
  Show Total Time first, followed by non-zero time entries in their saved
  order. Durations below one hour display as `N min`; durations of at least
  one hour display as `N hr` or `N hr M min`, omitting zero minutes. Private,
  public, and print views share this formatting while stored values remain
  minutes. Time types use the same label, value, and management conventions as
  other recipe picklists. Serves and duration values display with comma
  grouping for thousands.

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
  recording metadata. Signed read URLs are User-authorized and expire after
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
- Users can save reversible framing independently for each recipe photo and
  publication cover. Without saved framing, show the complete source using
  Fit/contain; never crop automatically. A saved frame is used consistently in
  thumbnails, detail views, instruction references, public recipe views, and
  the existing single-image viewer, preserving the saved crop's aspect ratio
  within each display's bounds. Fixed square thumbnail viewports may letterbox a
  crop but must not stretch it. Only the framing editor shows the complete
  uncropped source while the User adjusts the frame. Saved framing generates
  versioned official WebP display files while retaining the normalized source
  variants for future edits and reset. New displays use those generated files;
  legacy assets retain metadata-based framing until the next framing save or
  reset.
- The framing editor offers responsive Free, Original, Square, 4:3, 3:2, and
  16:9 choices in the shared mobile-safe Picklist. Common ratio orientation
  follows the active crop frame, so portrait framing shows 3:4, 2:3, and 9:16;
  Original follows the rotated source image. The fitted crop canvas rotates
  with the source. It supports desktop wheel zoom, touch pinch zoom, image drag
  within the frame, one counterclockwise 90-degree rotation action, and Reset,
  Cancel, and Apply, without visible control headings. Recipe photo Apply saves
  immediately; cover Apply stages
  framing until the publication cover manager is submitted. Cancel discards the
  current draft. The ratio picker omits its selection checkmark, and rotation
  has no numeric degree readout. At narrow mobile widths, the ratio picker,
  icon-only rotation control, and Reset/Cancel/Apply actions share one compact
  row when space permits.
- Clicking a non-thumbnail recipe photo opens that image in a modal viewer with
  its saved framing, constrained to fit within the viewport without enlarging
  smaller images. A top-right close action, Escape, and clicking outside the
  image dismiss the viewer. Thumbnail buttons continue to select the featured
  photo and do not open the viewer; the viewer has no gallery navigation.
- Trashed parents hide but retain their photos for restoration. Permanent purge
  queues all object paths for deletion; failed Storage deletions remain queued
  for retry. Public photo requests recheck public-link, privacy, and
  active-lifecycle state on every request; public photos are not served through
  signed URLs. Publication covers remain User-only. Image export is delivered
  in Slice 20; image import is delivered in Slice 21.

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
  36px on mobile. Time-entry controls remain compact; distinct actions
  retain their separately specified hit areas.
- Time expression fields use exact arithmetic before normalizing to a grouped
  whole-minute value on blur. Invalid expressions remain visible and block
  save.
- Center the Serves number within its 36px input on desktop and mobile.
- On desktop, the recipe list shows Name, Food Type, State, and Opinion, which
  shows the active Enthusiasm, Verdict, or Reason; Score and active custom
  marker stamps are available through list-column preferences, with marker
  columns visible by default and independently hideable. List indicators align
  right; Grid indicators stack at the top-right. Only active stamps are drawn.
  On mobile, the list shows Name and Opinion with compact Score and active
  marker indicators. Detail view
  uses content-sized wrapping metadata. It omits Verdict, Enthusiasm, Reason,
  Occasion Details, Food Type, Meal Type, and Cuisine, except that a
  **Will not try** recipe shows State and Reason together. Other fields remain
  in their current order. Private detail has one Tried-only Rating
  toolbar control and no duplicate standalone on-screen Rating value;
  eligible private print retains its numeric Rating. When **Include
  private-only details** is enabled, private Print and standalone HTML retain
  State and its applicable response (Enthusiasm, Verdict, or Reason), plus
  Occasion Details when present, but omit Food Type, Meal Type, and Cuisine;
  preserve the existing preference gating. Offline detail snapshots match
  private detail, including the **Will not try** exception. Public detail and
  print remain unchanged; their allow-listed
  payload omits all eight fields. Total Time
  leads the separate time breakdown on
  private and public pages. On mobile, it occupies a full-width row above
  time entries in the subsection with a divider and small-caps “Time
  Breakdown” title. On desktop, a fixed vertical rule separates Total Time
  from the entries, centered in the gap before the first entry. Omit the rule
  when there are no entries.
  Private recipe detail shows a breadcrumb from the Library through its assigned
  publication when that parent is not directly reachable from navigation. End
  the path at the publication when the recipe title is already shown as the H1.
  Left-align the path with the title and keep about one line of visual spacing
  between them. The desktop action toolbar aligns with the breadcrumb, and the
  section divider sits close below the heading. Use `>` separators in the
  ancestor-link color. The breadcrumb carries the publication context, so do not
  repeat the publication name in the recipe attribution; retain location details
  such as issue, page, and URL. Public pages do not show breadcrumbs and keep
  their existing attribution.
  Recipe-page headings are about 16pt (about 21.33px). When a recipe belongs
  to a publication, the private breadcrumb carries its publication identity;
  the compact attribution beneath the title retains location details such as
  issue, page, and URL without repeating the publication name. Recipe Tin
  recipes have no publication-location attribution.
- Standalone text actions are 48px high. Compact icon-only actions, including
  Print and Edit, are 36px square with descriptive accessible names and
  tooltips. On private recipe detail, the desktop action toolbar aligns with
  the breadcrumb row. On mobile, action hit areas expand to 48px without
  changing their visible size. Picklist triggers have separate sizing rules. In
  edit mode, a standard 48px icon-only `x` with a 24px icon in the header
  returns to view; Delete remains a distinct text action below it.
- The desktop Recipe Tin list is up to 1172px wide and its detail metadata
  section is up to 1012px wide.

### 2.5 Nutrition Presentation

- Private and public recipe detail show **Nutrition Per Serving** after Notes
  (left of Notes on desktop) when at least Calories and a positive Serves count
  are available. On screen it is a Nutrition Facts-style list; print and
  downloads use the compact string. The text is italic,
  uses the body font, and orders values from Calories through the FDA label
  nutrients and then approved optional vitamins/minerals. Omit unknown values;
  include explicit zeros. Include %DV only for nutrients with an FDA label
  %DV. Label values as estimates.
- Nutrition is calculated from whole-recipe totals divided by Serves. With
  target-servings scaling, ingredient amounts and servings scale together and
  per-serving values remain invariant. Multiply/Divide scale ingredient
  amounts while saved Serves stays fixed, so the displayed per-serving values
  scale with the amounts. Reading never mutates saved nutrition.
- Recipe edit shows a matching estimate under Ingredients and offers an
  **Edit** action with the Nutrition icon. Ingredient Nutrition actions open
  the shared pane and save recipe-specific overrides only with Save recipe.
  Settings values remain defaults and are never edited from recipe context.
  In the recipe-level Nutrition pane, the calculator control for a calculated
  nutrient opens an accessible ingredient breakdown with one row per
  ingredient and columns for its listed amount, recipe-amount multiplier, and
  contribution total. The breakdown is available on hover and keyboard focus;
  Escape dismisses it without closing the pane.
- Public projections expose only recipe-level displayed values; ingredient
  Settings profiles, row overrides, and measure equivalents remain private.

---
