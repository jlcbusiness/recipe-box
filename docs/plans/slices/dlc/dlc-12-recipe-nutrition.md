# DLC 12: Recipe nutrition

This slice adds owner-entered ingredient nutrition and explicit measurement
equivalents, plus recipe-level estimated nutrition derived from those values.
No nutrition information is fetched from outside Recipe Box.

## Outcome

An owner can enter nutrition facts for canonical ingredients, use them as
per-field defaults in recipe ingredients, and inspect estimated recipe
nutrition per serving in private, public, print, and offline recipe views.
Owners can override calculated recipe totals without losing the live
ingredient-based calculation.

## References

- [DLC 12 source request](../../../../.github/prompts/slice.prompt.md)
- [Comprehensive reference § 3: Ingredient rows and measurements](../../comprehensive-reference.md#3-ingredient-rows-measurements-and-density)
- [Comprehensive reference § 8: Settings](../../comprehensive-reference.md#8-settings-taxonomies-and-picklists)
- [Comprehensive reference § 9: Public recipe experience](../../comprehensive-reference.md#9-sharing-privacy-urls-and-image-delivery)
- [Comprehensive reference § 11: Bundles](../../comprehensive-reference.md#11-import-export-and-backup-bundles)
- [Data model](../../data-model.md)
- [DLC 11: Makes and servings](dlc-11-yield-and-servings.md)
- [Slice 6: Measurements](../6-measurements.md)
- [Slice 13: Scaling and unit conversion](../13-scaling-and-unit-conversion.md)
- [Slice 15: Trusted ingredient density](../15-trusted-density.md)
- [Visual design guide](../../visual-design.md)
- [Decision log](../../decision-log.md)
- [FDA: What's on the Nutrition Facts Label](https://www.fda.gov/food/nutrition-facts-label/whats-nutrition-facts-label)
- [FDA: Daily Value and Percent Daily Value](https://www.fda.gov/food/nutrition-facts-label/daily-value-and-percent-daily-value)

## Scope

- Ingredient Settings manage one optional nutrition profile per canonical
  ingredient. It is user-entered and has a positive serving-size amount in one
  fixed Volume or Weight unit, plus required Calories. Zero is a valid nutrient
  amount; blank means unknown.
- Provide fields for Total Fat, Saturated Fat, Trans Fat, Cholesterol, Sodium,
  Total Carbohydrate, Dietary Fiber, Total Sugars, Added Sugars, Protein,
  Vitamin D, Calcium, Iron, and Potassium. Amount units are fixed by nutrient.
  An **Add vitamin/mineral** action exposes only FDA-recognized optional label
  nutrients: Vitamins A, C, E, and K; Thiamin, Riboflavin, Niacin, Vitamins B6
  and B12, Folate, Biotin, Pantothenic Acid, Choline, Phosphorus, Iodine,
  Magnesium, Zinc, Selenium, Copper, Manganese, Chromium, Molybdenum, and
  Chloride. Arbitrary nutrient names and units are not accepted.
- Derive % Daily Value from nutrient amounts using the current FDA adult
  reference values. Do not accept manually entered %DV. Do not show %DV for
  nutrients without a label %DV, including Trans Fat and Total Sugars.
- Recipe ingredient nutrition uses the Settings profile and equivalent loaded
  when the recipe editor opens as per-field defaults. Refresh an open editor
  after changing Settings elsewhere. The recipe pane also permits a recipe-only
  serving-size basis when no Settings profile exists or the owner needs a
  different basis. A row-specific basis and nutrient overrides are saved with
  the recipe, never to Settings.
  Settings nutrient defaults are scaled to the recipe-only basis when their
  dimensions match. A recipe-specific nutrient override takes precedence;
  clearing it releases that field to the current Settings value. Auto-populated
  values are lightly tinted, show the calculator icon inside the field, and have an accessible “from ingredient Settings”
  name. The serving-size basis is visible in the pane; recipe context can
  save a recipe-only basis while Settings context edits the ingredient default.
- Each manual recipe-ingredient nutrient override retains its own original
  serving-size basis. If the row inherits its serving-size basis from Settings
  and that Settings basis changes, affected manual values become stale and the
  recipe is not automatically nutrition-calculable. A recipe-only basis is
  independent of Settings and does not become stale when Settings changes.
  Stale fields have a light red background, a “serving changed” tag, and an
  explanation in the recipe Nutrition section. Editing a stale value re-bases
  it on the current effective serving size. Saving unchanged stale values opens a
  **Serving changed** modal over the pane with **Cancel** and filled
  **Keep stale** and **Update as-is** buttons; Update as-is acknowledges the old
  basis and restores calculation without altering the value or its stored
  basis. A later Settings basis change can make it stale again.
- Ingredient Settings have one explicit average-equivalent mapping per
  ingredient, for either one Count or one selected Things unit, with optional
  average Volume and/or Weight for a quantity of one. Do not infer values for
  bunch, handful, head, or other units; owners may enter their own estimates.
  A mapping is separate from Trusted Density. It may bridge to the other
  dimension only through the ingredient's trusted density.
- Remove Pinch from the default Things picklist and migrate existing recipe
  uses to Volume (`1 pinch = 1/16 tsp`). Keep the existing reader's numeric
  teaspoon-to-pinch display alias; pinch is not a stored measurement unit.
  Leave Dash unchanged; Dash migration is out of scope.
- Recipe nutrition is calculated from every populated recipe ingredient row.
  Use the measurement matching the profile's volume/weight basis; if needed,
  convert within a dimension, use the ingredient's Trusted Density across
  volume and weight, or use its explicit Count/Things equivalent. When both
  volume and weight are saved on one row, use the matching basis once; never
  add both. Repeated canonical ingredients in different sets are separate rows
  and each contributes once.
- A range, Feel phrase, absent or unsupported amount, any blank standard
  label nutrient, incompatible basis, unacknowledged stale override, or missing
  conversion makes that ingredient ineligible for automatic calculation.
  Ranges remain supported for recipe measurements; DLC 12 does not remove or
  reinterpret them. The ingredient's Nutrition icon is green when its current
  recipe amount has a valid serving-size match and every standard label
  nutrient (Calories through Potassium) has a value, red when nutrition data
  exists but any standard field is blank or the basis cannot be matched, and
  unlit when no nutrition data exists. Owners enter 0 for nutrients the
  ingredient does not contain; optional vitamins/minerals never block green.
  Saving still requires only serving size and Calories, so partial profiles
  are allowed and show red. Recipe auto-calculation runs only when every
  populated row is green. Color is supplementary; accessible text describes
  status. On desktop, lit (green or red) icons stay visible; unlit icons
  appear on row hover or focus.
- Compute nutrient totals at full precision. Only produce an automatic value
  for a nutrient when every contributing ingredient has a known value for it;
  explicit zero is known, blank is unknown. All standard label nutrients are
  required for every eligible ingredient. Divide eligible totals by positive `Serves` for the
  per-serving display. If Serves is absent, do not show per-serving nutrition.
- Recipe-level manual values are per-whole-recipe totals. A manual field
  overrides only that calculated nutrient; clearing it releases the field to
  the current calculation. A manual recipe-level save does not disable
  calculation for untouched fields.
- The fifteen standard nutrients from Calories through Potassium are numeric
  Find Recipes Query fields, optional recipe List columns, and sort choices
  when their columns are visible.
  Filtering and sorting use the same rounded per-serving values as the recipe
  editor and reader, including ingredient calculations and recipe-level
  overrides. Missing values remain unknown; optional vitamins and minerals
  are not searchable or sortable.
- Reader scaling is transient. Target-servings scaling changes ingredients and
  servings together, so nutrition per serving remains unchanged. Multiply and
  Divide change ingredient amounts while keeping saved Serves fixed; the
  displayed per-serving values scale with those amounts. Never mutate saved
  nutrition because of a reader scale control.
- Show **Nutrition Per Serving** after Notes in private and public detail and
  in output; on desktop it sits in a left column beside Notes. Use italic
  sans-serif body text (DM Sans) as one compact string ordered from Calories
  through the FDA label fields and optional nutrients. Include only available
  values, with fixed nutrient units and derived %DV. Separate major sections
  (Calories, macronutrients, vitamins/minerals) with ` | `, minor groups (fats,
  cholesterol, sodium, carbohydrates, protein, and each vitamin/mineral) with
  ` ~ `, and items within a group with ` - `. Write no space between an amount
  and its unit (`8g`, `90mcg RAE`). On screen, detail presents the same values
  with Nutrition Facts-style rows, indentation, rules, and right-aligned %DV
  instead of separators; the editor's Nutrition section does so at 640px or
  narrower. Print and downloads keep the string. Display rounds
  every calculated value to a whole number (percentages use the unrounded
  amount), and calculated per-serving values that pre-fill the recipe pane are
  rounded to whole numbers. For example, `Calories: 230 | Total Fat: 8g (10%) -
  Saturated Fat: 1g (5%) ~ Sodium: 160mg (7%) ~ Protein: 3g | Iron: 8mg (44%)`.
  Label the values as estimates. Public projections include only the recipe-level
  displayed values, never Settings profiles, row overrides, or equivalency data.
- In recipe edit, each populated ingredient row has the same Nutrition action
  and pane as Settings. The recipe view of the pane reads Settings defaults but
  saves its optional serving-size basis and nutrient overrides only to the
  recipe draft. When no Settings profile exists, the owner can enter a complete
  recipe-only basis and nutrient values. Beneath Ingredients, show the matching
  estimate and a **Nutrition** Edit action with the nutrition icon.
  The recipe Nutrition pane requires a positive Serves value and displays
  calculated and manual values per serving. Saving a manual field scales it by
  Serves and stores the full-recipe total; changing Serves therefore changes
  the displayed per-serving value of that override.
- In the recipe-level Nutrition pane, each calculated field's calculator
  control reveals a keyboard-accessible ingredient breakdown with ingredient,
  listed nutrient amount, multiplier, and contribution total. It opens on
  hover or focus, and Escape closes only the breakdown.
- The Nutrition pane has a consistent layout and keyboard/dismissal rules in
  Settings and recipe editing: close button, Escape, outside click, Save,
  Cancel, and Clear. Save commits Settings immediately but stages recipe edits
  until the ordinary Save recipe action. Cancel discards pane changes. Clear
  removes the Settings profile in Settings; in recipe context it clears recipe
  overrides and releases fields to Settings/calculation. Errors preserve drafts.
- Add help text that recipe ingredient nutrition edits are recipe-specific and
  do not change Settings.
- Preserve the data through recipe history, Trash/restore, portable database,
  publication and recipe bundles, import conflict choices, and offline recipe
  snapshots. Public/print/offline views must use the same calculation and
  formatting rules.

## Data, calculation, and failure boundaries

- Use owner-scoped rows for ingredient Settings profiles and measure
  equivalents, protected by RLS and authenticated, owner-derived mutation
  functions. Settings mutations use the ingredient-catalog revision and append
  before/after catalog history. Merge keeps the surviving ingredient's
  profile/equivalent when present, otherwise transfers the absorbed value;
  deletion cascades them atomically.
- Store recipe-ingredient field overrides and their source basis/acknowledged
  basis signatures with the recipe ingredient. Store recipe-level manual
  nutrient overrides with the recipe. Extend the existing version-checked
  recipe save and history snapshots so ingredients, nutrition overrides, and
  metadata commit atomically.
- Validate finite, nonnegative nutrient values, serving-size amount strictly
  positive, valid fixed units, the required Calories, supported nutrient keys,
  and basis consistency both at the client and database write boundary. Reject
  unknown fields and cross-account references. Failed validation, stale
  catalog revision, or recipe-version conflict changes no data or history and
  retains the user's draft with an explicit error.
- Calculation is pure library logic. Convert within volume or weight using the
  existing fixed unit factors; convert cross-dimension only with a valid
  ingredient Trusted Density. Count/Things equivalents represent exactly one
  selected unit. No density or equivalent is inferred globally.
- Ingredient amount ranges are not silently reduced to an average or endpoint.
  Mark affected recipe nutrition as incomplete and explain why.
- Use FDA label ordering and daily values as reference metadata in code and
  tests. Round only for display. Missing values never become zero. Do not imply
  laboratory accuracy, nutrition advice, or adjustment for preparation loss.
- Add the portable format version for all new records and fields. Older bundle
  versions import with no nutrition profile, overrides, or equivalents.

## UI and accessibility contract

- Reuse the Ingredient Catalog and Trusted Densities sections in Settings;
  show a compact Nutrition action on each canonical ingredient. The related
  measurement-equivalent action is separately named and described and uses a
  measuring-cup icon (a local Lucide-style SVG, since Lucide has none).
- The closest UI precedent is the inline Settings manager pattern in
  `IngredientCatalogManager` and `IngredientDensityManager`: staged drafts,
  explicit Save/Cancel/Remove, anchored compact panes, focus restoration, and
  responsive list management. Reuse its behavior where suitable; the nutrition
  pane is a shared modal workflow, not another dense field wall.
- Use the `Salad` icon from the existing Lucide set for Nutrition, with a
  visible tooltip and accessible name. Use an established measurement icon for
  equivalents; do not use an apple unless no clearer existing icon is
  available.
- The pane title is the Nutrition icon plus the ingredient or recipe name,
  truncated on one line; its accessible name is “Nutrition for `<name>`”. The
  body is laid out like a US Nutrition Facts label: serving size, thick rule,
  Calories, macronutrients with indented sub-items, thick rule, and
  vitamins/minerals. Serving size uses one app picklist of units grouped by
  Volume and Weight. Optional nutrients are added through the app picklist
  **Add vitamin/mineral** and removed with a hover `x` aligned right of the
  label (always visible on touch). A **Zero Empty Fields** footer button
  beside **Clear** sets every visible blank nutrient to 0 as a user-entered
  value; filled and
  shaded auto values are unchanged, and it is disabled when nothing is blank.
  Native selects are not used. Save, Cancel, and Clear stay distinct. The stale confirmation is a
  semantic confirmation dialog that identifies affected values and offers
  distinct choices.
- Recipe nutrition text uses the sans-serif body font (DM Sans) in italics,
  never the serif heading font. Keep the
  section after Notes; preserve established ingredient/instruction layout and
  print pagination behavior.
- Keyboard operation, visible focus, labels, live status, contrast, dialog
  focus containment/return, Escape/outside dismissal, and touch targets are
  automated. Settings Nutrition and Measure equivalent panes and recipe panes
  are horizontally centered,
  at least 4mm from the viewport top, remain within the viewport, and avoid
  horizontal overflow on desktop and mobile, including with classic
  (space-taking) scrollbars. The Measure equivalent pane titles itself with
  the measuring-cup icon and ingredient name over an "Average measures"
  subtitle, uses app Picklists sized to their longest option plus 1mm, and
  uses three-digit amount fields.

## Acceptance

- Unit tests cover nutrient keys/units, nonnegative values, explicit zero,
  %DV references, basis conversions, every conversion failure, dual
  measurements, count and Things equivalents, stale signatures, stale
  acknowledgement, nutrient completeness, servings, scaling modes, and exact
  output order/format.
- Database/API tests cover RLS, direct-write denial, account isolation,
  authenticated owner derivation, revisions, history, merge/delete behavior,
  the proven Pinch migration, recipe-version conflicts, and atomic rollback.
- Recipe tests cover live Settings defaults, per-field recipe overrides,
  reset-to-default, Settings basis change/stale states, accept-as-is,
  whole-recipe overrides, and ingredient amount/nutrition validation.
- Browser tests cover Settings nutrition/equivalents, including a saved Count
  average used by a freshly loaded recipe editor, empty and populated states,
  Save/Cancel/Clear, validation/error recovery, stale confirmation, recipe
  editor actions, Nutrition section, help, detail, public visibility, print,
  a database bundle export/import round trip, and offline snapshots.
- Accessibility tests cover keyboard, focus, labels, dialog semantics, status
  announcements, contrast, and representative mobile geometry.
- Run focused tests, isolated database migration acceptance, TypeScript,
  Biome, Markdown lint, relevant E2E and accessibility tests, and an isolated
  production build. Visually verify representative desktop and mobile widths,
  including pane dismissal, stale state, and wrapped nutrition text.
- `npm run test:migration:nutrition` runs the isolated migration checks and
  nutrition browser suite. To run another browser spec against the isolated
  migrated database, use
  `node scripts/test-dlc12-nutrition-migration.mjs --browser-file=tests/e2e/import-commit.spec.ts`;
  `--full-browser` runs the tagged application-wide browser suite.

## Completion

Update the comprehensive reference, data model, first-draft spec, visual guide,
portable bundle contract, roadmap, decision log, and Help page to match shipped
behavior. Mark this slice complete only after every acceptance criterion has
automated coverage and the existing local database and synthetic fixture have
been preserved or deliberately restored. Never reset a linked or hosted
database.
