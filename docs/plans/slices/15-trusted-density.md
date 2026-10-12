# Slice 15: Trusted Ingredient Density

This slice adds one trusted volume-to-weight equivalency per canonical
ingredient and uses it to derive the missing dimension while editing recipe
ingredients. The [comprehensive reference](../comprehensive-reference.md) is the
product authority; this brief resolves its Slice 15 implementation details.

## References

- [Delivery roadmap](../delivery-roadmap.md), Slice 15
- [First-draft specification](../first-draft-spec.md), Ingredients
- [Comprehensive reference § 3.3](../comprehensive-reference.md#33-trusted-ingredient-density)
- [Comprehensive reference § 8.2](../comprehensive-reference.md#82-trusted-density-registry)
- [Data model](../data-model.md), Core Entities and Configuration Boundaries
- [Visual design guide](../visual-design.md), Design Philosophy and Settings
- [Decision log](../decision-log.md)
- [Slice 6: Measurements](6-measurements.md)
- [Slice 13: Scaling and unit conversion](13-scaling-and-unit-conversion.md)
- [Slice 14C: Ingredient catalog management](14c-ingredient-catalog-management.md)

## Outcome

A signed-in owner can define, update, search, and remove a trusted density for a
canonical ingredient in Settings. In the recipe ingredient editor, entering a
valid Volume or Weight amount can fill the other dimension. The editor clearly
identifies a derived value, lets the owner override it, and derives it again
when that override is cleared and the field is left.

## Scope

Included:

- One optional density per account-owned canonical ingredient.
- Settings management for density values, including search, add, edit, remove,
  empty, loading, save, conflict, and error states.
- Volume-to-weight and weight-to-volume derivation for Unit measurements,
  including ranges and unit changes.
- Explicit distinction between values derived during the current edit session
  and values manually entered in the recipe.
- Owner isolation, optimistic catalog revision checks, catalog history, and
  local automated acceptance tests.

Excluded:

- Multiple densities or density profiles for one ingredient.
- Temperature, pressure, packing, or other context-dependent corrections.
- Automatic changes to saved recipe quantities when a density is added, edited,
  or removed.
- Density use for Count, Things, or Feel measurements.
- Density-based conversion on public recipe pages or in print beyond the
  quantities already saved on the recipe.

## Product and data contract

- Store density as one normalized, account-owned row per ingredient, keyed by
  `(account_id, ingredient_id)`. The row contains positive finite numeric
  reference amounts and fixed unit codes: one Volume amount/unit and one Weight
  amount/unit. Density entries accept one amount per dimension, not ranges.
- The density row's account must match its canonical ingredient. Enable RLS;
  authenticated owners may read their own rows but cannot write them directly.
  Add or update or remove density only through an authenticated owner-derived
  database operation; do not accept a caller-supplied account ID.
- Density mutations use the existing ingredient-catalog revision as the
  optimistic concurrency token. Each successful set, update, or removal
  advances that revision and appends an `ingredient.density_set` or
  `ingredient.density_removed` catalog-history event with before/after density
  snapshots. A stale or invalid mutation changes neither density, revision, nor
  history.
- Ingredient rename preserves its density. When ingredients merge, the
  selected surviving ingredient's density wins if it has one; otherwise the
  absorbed ingredient's density transfers to the survivor. The merge remains
  atomic and its history snapshots include both densities. Deleting an
  ingredient removes its density in the same transaction and records it in the
  before snapshot.
- A density is a ratio between its stored reference amounts, not a universal
  water-equivalent conversion. Use the existing fixed-unit conversion factors
  to normalize within each dimension, then apply the ratio. Preserve the
  selected unit of the derived dimension; if it is unset, use the editor's
  existing default unit for that dimension.
- Apply the same positive ratio to both endpoints of a range, retaining a
  single amount as a single amount and a range as a range. Do not round stored
  or derived values before serialization. Format the editor's visible derived
  quantity with the existing quantity formatter for the target unit system.
- Only Unit measurements participate. If one dimension is valid and its
  counterpart is empty, derive the counterpart. If the counterpart was
  derived in this editing session, changes to the source amount or unit update
  it. A non-empty value that was loaded from a saved recipe or manually edited
  remains manual and is never overwritten automatically.
- Editing an auto-filled value changes it to manual. Clearing that value and
  leaving the field re-derives it when the source and ingredient density are
  valid. An invalid or incomplete source clears an auto-derived counterpart;
  manually entered values remain untouched.
- Derived/manual status is transient editor state, not recipe data. Saving
  commits the numeric amounts through the existing versioned recipe-save path;
  reopening a recipe treats its saved amounts as manual. Density edits never
  rewrite recipe versions, measurements, or recipe history.
- Changing the selected ingredient preserves manually entered amounts. It
  discards a counterpart derived from the previous ingredient, then derives
  from the newly selected ingredient's density if possible.

## Settings and editor interaction contract

- Add a separate full-width, unframed Trusted density section to Settings after
  Tags. It follows the established Settings disclosure pattern and is collapsed
  by default; do not add a navigation shortcut, card grid, or explanatory
  feature copy.
- Show configured densities in a searchable, alphabetized table with
  understated alternating rows and a scroll limit of about eight entries. Each
  saved row shows its canonical ingredient and a serif expression containing
  Volume, Weight, and calculated density, such as
  `1 cup / 242 g - 1.023 g/mL`. Clicking the ingredient opens its fields inline.
- Search filters configured rows and offers a contextual add action for the
  top matching catalog ingredient that does not already have a density. The
  italic Add density action below the table opens an inline ingredient search
  restricted to existing canonical ingredients; typed names cannot create
  ingredients.
- Inline editing uses the recipe-style Volume amount/unit and Weight
  amount/unit controls, with a live normalized density preview. Save and Cancel
  are explicit; changes are staged until Save. Enter advances from Volume
  amount to Weight amount and saves from the final amount; Tab retains its
  normal focus order, Escape cancels, and clicking away saves a valid draft.
  Remove is a separate confirmed action. Failed validation, revision conflict,
  and save failure retain the draft and announce a recoverable status.
- The recipe editor keeps its existing Unit layout. An auto-filled dimension
  receives a subtle background tint and a compact calculator icon in the amount
  field. The decorative icon is hidden from assistive technology; an associated
  `Derived from density` status announces the state. Tint is never the only
  signal. A manually edited value loses both derived styling and status. Do not
  add extra columns or database-shaped controls.
- Match the light paper surface, dark ink, restrained borders, DM Sans controls,
  and existing leaf/navy/gold semantic palette. Keep Settings sections
  unframed. Do not use decorative imagery, gradients, nested cards, or color as
  the only state cue.
- Desktop keeps compact aligned controls and the searchable table readable.
  Derived amount inputs grow with their contents, including ten-digit values,
  but stay within the amount group and do not overlap the unit selector. Mobile
  stacks density rows and reflows the editor controls, keeps suggestions inside
  the table viewport, and has no page-level horizontal scroll.
  Labeled controls and standalone actions have at least 48px mobile hit areas;
  visible quantity inputs remain compact.

## Test-first acceptance

Write focused automated tests before production code:

- Unit tests cover ratios across every supported Volume and Weight unit,
  reciprocal conversion, ranges, fractional quantities, invalid or incomplete
  values, zero/negative/non-finite results, target-unit changes, and formatting
  without mutating source drafts.
- Database/API tests cover one density per ingredient, valid units and positive
  finite amounts, owner isolation, denied direct writes, account/ingredient
  mismatch, optimistic revision conflicts, atomic history, rename preservation,
  merge transfer/precedence, and deletion cleanup.
- Recipe-save tests verify derived values serialize as ordinary measurements,
  existing saved pairs remain unchanged, and density updates do not change
  recipe versions or recipe-history snapshots.
- Browser tests cover Settings search, add, edit, cancel, save, remove and its
  confirmation, empty state, validation, conflict/error recovery, and recipe
  editor derivation in both directions. Verify source edits and unit changes
  update only session-derived values; manual overrides persist; clearing and
  blurring re-derives; invalid input clears only a derived counterpart; and
  changing ingredient does not overwrite manual values.
- Accessibility tests cover labels and status announcements, keyboard
  operation, visible focus, the screen-reader `Derived from density` status, and
  dismissal/return of focus for Settings controls. Run on Chromium and Fold 6.
- Capture automated desktop and mobile acceptance screenshots for the expanded
  Settings list, staged density editor, and a recipe row showing both derived
  and manually overridden states. Screenshots supplement behavior and axe
  assertions; they do not replace them.

## Completion criteria

- Owners can manage one valid density per canonical ingredient without
  cross-account access or lost catalog history.
- Recipe editing derives the missing dimension and consistently distinguishes
  derived values from manual values through edits, override, clear, blur, and
  ingredient changes.
- Saved recipe amounts remain stable when density configuration changes.
- Focused unit, database/API, browser, and accessibility tests pass on
  Chromium and Fold 6, along with TypeScript typecheck, Biome, and the relevant
  recipe suite.
- Update the visual design guide with the validated current Settings and
  editor behavior after implementation; update the roadmap status only after
  all completion criteria pass.

## Implementation and verification status

Slice 15 is complete. The Settings registry, bidirectional recipe-editor
derivation, manual override behavior, and transient derived status are
implemented. The calculator icon is the visible cue; the associated
screen-reader status announces `Derived from density`.

Verification passed: density browser and accessibility acceptance tests 6/6
across Chromium and Fold 6; density unit tests 8/8; the recipe E2E file 37
passed and 1 skipped across its projects; TypeScript typecheck; and Biome with
no errors (13 existing CSS specificity warnings). The recipe confirmation test
now checks ingredient presence/removal without assuming desktop title-case or
mobile lowercase presentation.
