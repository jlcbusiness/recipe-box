# DLC 35: Count and Things Measure Equivalents

**Status:** Implemented; app version 1.9.0.

This slice lets a person switch a private recipe quantity between Count or
Things and its configured physical-measure equivalent, while keeping saved
recipe measurements unchanged. A saved trusted density takes precedence when
the other physical dimension must be derived; without a trusted density, a
person may enter both physical equivalents explicitly.

## Outcome

A person reading a private recipe can activate a quantity such as `1 lemon`
and choose its configured volume or weight equivalent. If a trusted density
exists, entering one physical equivalent derives the other from that density.
Without a trusted density, both dimensions may be entered as explicit
equivalents.

## References

- [Update-slice request](../../../../.github/prompts/update.prompt.md)
- [Comprehensive reference § 3: Ingredient rows, measurements, and density](../../comprehensive-reference.md#3-ingredient-rows-measurements-and-density)
- [Comprehensive reference § 8.2: Trusted density registry](../../comprehensive-reference.md#82-trusted-density-registry)
- [Comprehensive reference § 8.3: Nutrition and measure equivalents](../../comprehensive-reference.md#83-nutrition-and-measure-equivalents)
- [Data model](../../data-model.md)
- [Visual design guide](../../visual-design.md), especially Ingredient Presentation and Accessibility
- [Decision log](../../decision-log.md)
- [DLC 12: Recipe nutrition](dlc-12-recipe-nutrition.md)
- [Slice 13: Scaling and unit conversion](../13-scaling-and-unit-conversion.md)
- [Slice 15: Trusted densities](../15-trusted-density.md)

## Scope and boundaries

- In the private recipe reader, resolve the configured Count/Things
  equivalent dimensions, including any dimension derived from trusted density.
  When both Volume and Weight are available, show the stored Count/Things
  quantity initially. Its inline picklist offers `Units`; selecting it shows
  both equivalent measurements. Each measurement's normal unit picklist then
  offers the stored Count/Things measurement as an independent alternative.
  Label those alternatives `Count` or `Things: <unit>` (or `Things (<unit>)`
  in a physical unit list); do not add `Recipe measurement` wording.
  Selecting Count/Things for one measurement changes only that slot; return to
  the single Count/Things display only when both slots are set to Count/Things.
- When only one equivalent dimension is available, show that physical
  equivalent initially, without a separate Count/Things-versus-Units picker.
  Add the stored Count/Things measurement to its normal unit picklist so it
  can be selected and switched back.
- Do not add a separate `Recipe default` option to physical unit lists. The
  saved recipe unit remains among the normal unit choices, and selecting it
  clears that dimension's transient override.
- Keep each control as an inline text picklist that is visible and usable on
  mobile; do not rely on hover or add a repeated row of icons.
- Scale each equivalent from its explicit one-unit basis. Convert ranges by
  applying the same factor to both endpoints. Preserve the active recipe
  scale and the transient per-slot choices.
- In the Settings Measure equivalents editor, when a trusted density exists,
  entering one physical equivalent derives the other with the trusted density.
  Show the calculated field with the existing green tint, calculator icon, and
  accessible density-derived status. Add a tooltip to the calculator icon;
  make it available on hover, keyboard focus, and touch. The calculated field
  is read-only.
  Clearing the entered dimension clears its calculated counterpart, allowing
  the other dimension to be entered as the source instead.
- When no trusted density exists, allow a person to enter either or both
  physical equivalents explicitly. Do not infer the missing dimension.
- A trusted density remains authoritative for cross-dimension conversions. Do
  not replace it with a ratio inferred from the measure equivalent. When its
  value changes, recalculate any derived measure field and reader alternative
  from the saved one-dimensional equivalent.
- Keep quantity switching transient, like current reader unit overrides.
  Reset restores the stored recipe measurement. Never rewrite recipe rows,
  recipe history, exports, or bundles when a quantity is switched or Settings
  equivalents change.
- Keep public/Guest projections unchanged. Ingredient Settings equivalents
  and trusted densities are private; public recipes retain their existing
  stored-measure and unit-switch behavior.
- Persist only manually entered equivalent dimensions when a trusted density
  derives the counterpart; do not save a calculated value as an independent
  observation. Reuse existing equivalent and density records and current
  readers. No schema or bundle migration is expected unless implementation
  inspection finds a missing requirement.

## Existing patterns

The recipe reader's `ReaderUnitPicklist` is the closest interaction precedent:
its underlined unit control opens a keyboard-operable Picklist and changes
only transient display state. Reuse it for each physical measurement, adding
the stored Count/Things measurement as an option. When both dimensions are
available, use one additional text picklist on the initial Count/Things
quantity to reveal both physical measurements. Keep these controls visible on
mobile; do not depend on hover or add repeated icons. Keep option labels short,
and let selecting a saved unit restore it without a separate `Recipe default`
menu item.

The Settings Measure equivalents dialog already stages and validates the
one-unit average measures. The Trusted densities section and recipe editor
already show density-derived values with a green tint, calculator icon, and
accessible status. Those patterns serve this workflow well; reuse them in the
equivalent editor rather than styling the density itself as
equivalent-derived. Confirm tooltip placement and touch behavior against the
visual guide during implementation.

## Trusted-density behavior

Resolve Count/Things-to-measure conversions from committed ingredient
Settings:

1. If a trusted density exists, an explicitly entered volume or weight
   equivalent is the source. Derive the other dimension from the trusted
   density; the derived value is not a second saved equivalent.
2. If no trusted density exists, use whichever explicit measure equivalents
   are saved. If both exist, each remains an explicit count-to-measure mapping.
3. If an equivalent has only one dimension and no trusted density exists, do
   not offer the other dimension.
4. For an existing equivalent that already has both values when a trusted
   density is present, temporarily use Weight as the source and derive Volume.
   Preserve both stored values until the mapping is edited; then ask which
   dimension to retain as the explicit source. If density is removed before
   that edit, both stored values become explicit again.

The Measure equivalents editor displays the calculated counterpart using the
existing green density-derived treatment. Clearing the entered source clears
that counterpart in the draft; the person can then enter the opposite
dimension. On editing a legacy two-value mapping with a trusted density,
require a source choice before saving. Editing an equivalent does not change
the trusted density record or add a density-history event; the equivalent
change is recorded as its own ingredient-catalog history event.

## Interaction and accessibility

- Preserve the existing reader Picklist's keyboard behavior, visible focus,
  screen-reader naming, transient overrides, reset behavior, and printing of
  the active private reader state.
- For two available dimensions, make the Count/Things quantity a text trigger
  for `Units`; give it an accessible name describing the ingredient and
  current quantity. Each revealed physical unit picklist independently offers
  Count/Things. For one dimension, expose Count/Things in that dimension's
  existing unit picklist instead of adding a separate trigger.
- Keep text triggers visibly identifiable without relying on hover. Associate
  the calculated equivalent field with the accessible status `derived from
  density`. The calculator tooltip explains the derivation, but does not
  replace the status; color and the icon are not the only indicators.
- Keep unavailable conversions out of the option list. A recipe with no
  matching equivalent continues to display and behave exactly as it does now.
- Apply the same behavior in desktop and mobile readers without page-level
  horizontal overflow. Preserve the existing public reader and print behavior.

## Data, validation, and compatibility

- Count/Things equivalents remain explicit, account-owned Settings data; do
  not infer or fetch average measures.
- Continue to validate positive finite amounts and recognized volume/weight
  units through the existing equivalent path.
- Use the saved trusted density to calculate a missing equivalent dimension.
  Do not mutate the density row, its revision, or catalog history when the
  equivalent is saved, edited, cleared, or removed.
- Use the same equivalent-resolution rules in the private recipe reader and
  nutrition calculations. When density exists, a saved one-dimensional
  equivalent supplies the source and density derives the other dimension. For
  legacy two-dimensional equivalents, use the compatibility source rule above
  until the owner edits and chooses a source. Without density, preserve both
  explicit dimensions.
- Apply this resolution to public recipe nutrition calculations where
  applicable, but expose only the existing recipe-level nutrition output;
  never expose the underlying Settings equivalent or trusted density.
- Keep the feature private; public projections must not expose Settings
  equivalents or density values.

## Acceptance criteria and automated coverage

Write focused failing tests before production changes:

- Pure conversion tests cover Count and Things equivalents with volume only,
  weight only, and both dimensions; one-unit scaling; recipe scaling; ranges;
  recognized unit conversion; and absent or invalid conversion data.
- Density-backed equivalent tests prove that entering one dimension derives
  the other from the saved trusted density, clearing the source clears the
  derived value, and entering the opposite dimension derives the original
  source again.
- Tests cover an existing two-value equivalent with a trusted density:
  Weight supplies the compatibility source until the mapping is edited, the
  original pair remains intact until save, and editing requires a choice of
  which dimension to retain. Removing density before editing restores both
  stored values as explicit equivalents.
- Tests prove that without a trusted density, either or both explicit
  dimensions can be saved and that no missing dimension is inferred.
- Settings tests show the green tint, calculator icon, and accessible status.
  Verify that the calculator tooltip explains the derivation on hover, focus,
  and touch. Prove that derived values are read-only, not persisted as
  independent measurements, and that trusted-density data and history do not
  change.
- Reader tests prove that the full Count/Things quantity opens the choices,
  selecting each available measure updates only transient display state,
  switching back restores the recipe measurement, scaling is preserved, and
  saved recipe rows remain byte-for-byte unchanged.
- Test that trusted density is authoritative when deriving the second
  dimension from a one-dimensional Count/Things equivalent.
- Nutrition-rule tests prove that the calculation uses the same resolved
  equivalent as the reader, including the legacy Weight-source behavior when
  density exists and both explicit values are preserved when it does not.
- Public recipe nutrition continues to expose only recipe-level results while
  using the same account-owned conversion rule internally.
- Existing dimensional unit switching and trusted-density derivation remain
  unchanged when no complete Count/Things equivalent applies.
- Guest/public recipe tests confirm the current public unit-switch behavior
  and verify that no Settings equivalent or density-derived Count option is
  exposed.
- Private print tests confirm the active equivalent display is printed without
  interactive controls. Chromium and Fold 6 checks cover keyboard use, focus,
  tooltip access, touch targets, responsive layout, and no horizontal
  overflow.

## Assumptions for review

- The conversion is bidirectional between Count/Things and each available
  physical dimension; conversions are transient and do not save a changed
  recipe measurement.
- With a trusted density, one equivalent dimension is an explicit observation
  and the other is calculated. Without one, both can be explicit.
- The calculated field is read-only; clear its source to enter the other
  dimension.
- Count-equivalent and Things-equivalent behavior uses the existing single
  mapping per canonical ingredient; Feel remains unsupported.
- Public/Guest readers do not gain Count/Things switching because the source
  Settings data is private.
- Existing two-dimensional mappings with a trusted density use Weight as a
  compatibility source until edited; editing asks which dimension to retain.
