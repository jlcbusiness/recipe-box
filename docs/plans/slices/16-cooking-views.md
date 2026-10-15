# Slice 16: Cooking views

This slice adds reader presentation and ingredient ordering controls, plus a
mobile cooking mode for temporary check-off and screen wake lock. The
[comprehensive reference](../comprehensive-reference.md) is the product
authority; this brief resolves its Slice 16 implementation details.

## References

- [Delivery roadmap](../delivery-roadmap.md), Slice 16
- [First-draft specification](../first-draft-spec.md), Views and Sorting
- [Comprehensive reference § 4](../comprehensive-reference.md#4-ingredient-presentation-and-sorting)
- [Comprehensive reference § 8.3](../comprehensive-reference.md#83-personal-preferences)
- [Comprehensive reference § 13](../comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility)
- [Data model](../data-model.md), Core Entities and Configuration Boundaries
- [Visual design guide](../visual-design.md), Ingredient Presentation and Mobile
- [Decision log](../decision-log.md)
- [Slice 13: Scaling and unit conversion](13-scaling-and-unit-conversion.md)
- [MDN: Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)

## Outcome

A reader can change a recipe's ingredient presentation and temporary sort
without changing saved recipe order, set a default presentation in Settings,
and use mobile cook mode to check off ingredients while requesting that the
screen stay awake when the browser allows it. The active scale, unit overrides,
presentation, and sort remain reader-only state; recipe data and history do not
change.

## Scope

Included:

- Standard amount-first reading and Ingredient-first tabular reading.
- An account-level default presentation, initially Standard, managed from
  Personal preferences and written through an authenticated owner-derived
  preference RPC.
- Four temporary ingredient sort choices: Appears in Instructions, Alphabetical,
  By Size, and Order Entered. Alphabetical and size sorts expose ascending and
  descending direction.
- Mobile cook mode with temporary ingredient check-off and screen wake lock
  lifecycle handling.
- Reader controls included in print behavior, with all interactive controls
  omitted from printed output.
- Focused unit, database/API, browser, and accessibility acceptance tests on
  Chromium and Fold 6.

Excluded:

- Public recipe pages, which are delivered in Slice 20; their Ingredient-first
  default remains a requirement for that slice.
- Persisting sort direction, check-off state, cook-mode state, or per-recipe
  presentation choices.
- Changing canonical ingredient order, recipe measurements, scaling behavior,
  or unit override persistence.
- A full-screen or navigation-replacing cooking experience.

## Data and state contract

- Add `accounts.ingredient_presentation`, constrained to `standard` or
  `ingredient_first`, defaulting existing and new accounts to `standard`.
- Extend the existing `update_account_unit_preferences` owner-derived function
  with an optional presentation argument. Validate it, update only the
  supplied preference, retain all other values, and keep execute privileges
  restricted to authenticated users. Do not broaden direct account update
  permissions.
- Settings saves the selected default immediately, matching the existing
  Volume and Weight preference workflow. On failure it restores the last saved
  value and announces an error; on success it announces `Saved.`
- On desktop, initialize the reader from the saved account default. On mobile,
  initialize to Ingredient-first as specified by the responsive product
  default. An explicit presentation selection applies for the current reader
  session and is not persisted by the recipe view.
- Sort mode and direction are transient reader state. Sort a copied ingredient
  collection; never mutate the supplied rows or their `position` values.
- `Order Entered` uses `position` ascending. `Appears in Instructions` orders
  by each ingredient row's first structured mention in step order and then
  mention order; unmentioned rows follow in entered order. Ignore literal
  hashtag text and mentions that do not resolve to a row on the recipe.
- `Alphabetical` compares canonical ingredient names case-insensitively with
  numeric collation, then uses entered order for ties. Direction reverses only
  the name comparison; entered order remains the tie-breaker.
- `By Size` keeps fixed groups in this order: Volume, Weight, Count/Things,
  then Feel or rows with no usable amount. Convert volume values to milliliters
  and weight values to grams before comparison. Compare ranges by their lower
  endpoint. Count and Things compare their numeric lower endpoint without
  converting or comparing unit words. A row with both Volume and Weight uses
  Volume only. Direction changes order within comparable numeric groups, never
  group order; non-numeric final-group rows retain entered order.
- Check-off state exists only while cook mode is active on the current recipe.
  It resets when cook mode closes, the recipe changes, or the component
  unmounts. It is never saved or included in print output.
- Cook mode requests a screen wake lock after the user's activation when
  `navigator.wakeLock` is available. Unsupported or rejected requests do not
  disable check-off; announce that the screen may turn off. Show active status,
  release on cook-mode exit and unmount, and reacquire after the document
  becomes visible if cook mode is still active. A system-released lock updates
  the status and may be reacquired on visibility return. The cook-mode toggle
  is the user's way to stop the lock.

## Reader interaction and visual contract

- Place compact, icon-only Presentation and Sort buttons on the Ingredients
  heading line. Each cycles to the next mode and changes its icon to show the
  active mode; its accessible name and tooltip identify the current and next
  mode. Keep a reserved sort-direction toggle slot to the left of Sort so the
  toolbar does not shift when direction is available. Keep all controls
  operable by keyboard and touch.
- Standard keeps the existing natural amount-first row format. On desktop,
  place Ingredients beside Instructions in the recipe reading area; size the
  Ingredients column to its widest row, cap it at half the available reader
  width, and let Instructions use the remaining space. On mobile, retain the
  vertical reading flow.
- Ingredient-first uses a semantic table with Ingredient, Volume, Weight, and
  Preparation columns. Rows without a volume or weight use a cell spanning both
  measurement columns. Specifics appears lowercase and indented under the
  ingredient name. Mobile abbreviates the measurement headers to Vol, Wt, and
  Prep. Keep paired measurements together and retain current scaling, unit
  conversion, preparation, and print formatting.
- Cook mode is an icon-only switch in the Ingredients toolbar. While active,
  each ingredient has a labeled native checkbox with a minimum 48px hit target;
  Ingredient-first adds an unlabeled checkbox column before Ingredient.
  Checked rows have a visible check and subdued strike-through. Announce
  wake-lock active, unavailable, and failed states through a polite status;
  allow the warning to be dismissed. Cook controls do not appear in print.
- Scale is in the Ingredients toolbar. Its pane keeps the serving-count input
  centered and spinner-free, uses a filled Submit button, and shows Reset only
  when the scale differs from its base value.
- Keep the recipe as the visual anchor. Use the existing paper-and-ink
  foundation, DM Sans controls, restrained borders, and semantic leaf/navy/gold
  accents. Do not add cards around ordinary recipe sections, decorative
  gradients, or explanatory feature copy.
- Preserve visible focus, sufficient contrast, natural heading order, no
  horizontal overflow, and stable layout at desktop and mobile sizes.

## Test-first acceptance

Write focused automated tests before production code:

- Unit tests cover instruction mention ordering (including repeated and absent
  mentions), entered-order stability, case-insensitive alphabetical direction,
  size-group order, normalized volume/weight comparison, Count/Things numeric
  ordering, range lower endpoints, dual-measurement Volume precedence, stable
  ties, and proof that source rows are not mutated.
- Preference action and database/API tests cover valid values, invalid values,
  partial updates retaining Volume and Weight settings, existing-account
  defaults, and denial of unauthenticated or cross-account writes.
- Browser tests cover changing each presentation and sort, presentation
  default save and failure recovery, the responsive initial presentation,
  content-sized Ingredients beside the flexible Instructions column on desktop,
  stacked reading flow on mobile, print matching the active presentation, and
  unchanged saved ingredient order.
- Cook-mode tests cover entering and leaving mode, check and uncheck, reset on
  exit and recipe change, unavailable API, rejected request, active status,
  release on exit/unmount, system release, and reacquisition after visibility
  return. Use a deterministic Wake Lock API stub; do not rely on hardware or
  browser timing.
- Accessibility tests cover labels, keyboard operation, visible focus, polite
  status announcements, semantic table headers, checkbox names, 48px mobile
  targets, contrast, and absence of horizontal overflow on Chromium and Fold 6.
- Capture automated desktop and mobile screenshots for both presentations and
  active cook mode. Screenshots supplement behavior and accessibility tests.

## Completion criteria

- Readers can switch both presentations, sort by all four choices, and cook on
  mobile without modifying canonical recipe order or saved content.
- Settings persists the default presentation through the existing
  owner-derived preference boundary, preserving other preferences.
- Cook mode provides usable check-off whether or not the Wake Lock API is
  available, reports actual lock state, and releases/reacquires it according
  to the lifecycle contract.
- Print reflects the active presentation and excludes controls and temporary
  check-off state.
- Focused unit, database/API, browser, and accessibility tests pass on
  Chromium and Fold 6, along with TypeScript typecheck, Biome, and production
  build.
- Update the visual design guide and decision log with validated behavior;
  update the roadmap status only after all completion criteria pass.

## Implementation and verification status

Slice 16 is implemented but not complete. The account-level presentation
preference, owner-derived save path, cycling reader controls, four sort modes,
direction toggle, semantic Ingredient-first table, temporary check-off, and
Wake Lock lifecycle are implemented.

Verified:

- The unit suite passes: 145 tests across 16 files.
- TypeScript passes with `npm run typecheck`.
- The isolated production build passes with
  `NEXT_DIST_DIR=.next-slice16-build npm run build`.
- The full E2E suite passes: 160 passed and 2 skipped across Chromium and Fold
  6, including the publication ISBN workflow.
- The accessibility suite passes: 61 passed and 1 skipped across Chromium and
  Fold 6.
- The focused print-presentation test passes on Chromium and Fold 6. Its check
  now targets the input's `textfield` appearance rather than a browser-specific
  computed style for the WebKit spinner pseudo-element.
- Focused Chromium and Fold 6 tests also cover reader sorting and cooking,
  presentation controls, layout, and instruction-mention rendering.
- The focused account-preference RLS test passed after applying the forward
  migration locally without resetting Supabase.
- Repository-wide Biome passes with `npm run lint` (exit code 0). The three
  formatter and import-order errors were fixed; 22 CSS specificity warnings
  remain.

All completion criteria and verification gates pass. Slice 16 is complete;
the roadmap status is updated. Biome still reports 22 non-blocking CSS
specificity warnings.
