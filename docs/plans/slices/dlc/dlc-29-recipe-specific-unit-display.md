# DLC 29: Recipe-Specific Unit Display

This brief adds a `Recipe` choice to the independent Volume and Weight
preferences. In that mode, private recipe reading and printing use each
measurement's saved unit system and may apply the existing same-system unit
simplification, allowing a recipe to retain mixed units such as
`1 lb meat` and `200 g milk` without converting between systems.

## References

- [DLC roadmap](README.md), Phase 5
- [First-draft specification](../../first-draft-spec.md), Ingredients
- [Comprehensive reference, § 3.5](../../comprehensive-reference.md#35-unit-display-preferences)
- [Comprehensive reference, § 4: Ingredient presentation](../../comprehensive-reference.md#4-ingredient-presentation-and-sorting)
- [Comprehensive reference, § 8.3: Personal preferences](../../comprehensive-reference.md#83-personal-preferences)
- [Comprehensive reference, § 9.3: Public recipe experience](../../comprehensive-reference.md#93-public-recipe-experience)
- [Comprehensive reference, § 13: Accessibility](../../comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility)
- [Data model](../../data-model.md), Configuration Boundaries
- [Design philosophy](../../design-philosophy.md) and
  [visual design guide](../../visual-design.md), Settings and recipe reading
- [Decision log](../../decision-log.md)
- [Slice 13: Scaling and Unit Conversion](../13-scaling-and-unit-conversion.md)
- [Slice 14A: Settings and Personal Preferences](../14a-settings-and-preferences.md)

## Outcome

A signed-in person can choose `Recipe` independently for Volume, Weight, or
both. The private reader and its print output then preserve each measurement's
saved unit system instead of converting it to a single system. Existing
same-system display simplification remains available. Saved recipe data
remains unchanged.

## Scope and boundaries

- Add `Recipe` to the existing Volume and Weight Picklists in Settings. Keep
  their independent, immediate-save behavior and use the existing
  owner-derived preference RPC.
- Resolve each volume or weight measurement to its saved unit when its account
  preference is `recipe`. Scale its amount as usual and allow existing
  same-system simplification, but never convert it to the other unit system.
  An explicit per-ingredient unit override continues to take precedence.
- Keep the intrinsic system of each unit (`us_customary` or `metric`) separate
  from the account's display preference. Formatting follows the saved unit, so
  customary fractions and metric decimals retain their existing rules.
- Reset clears transient scale and per-ingredient overrides; the reader then
  resolves units from the account defaults, including `Recipe`.
- Add a forward migration that expands the account constraints and every
  active database-side preference validator to accept `recipe`. Preserve
  existing values, defaults, RPC ownership checks, grants, and unrelated
  preferences.
- Preserve `Recipe` in account export/import without changing recipe bundle
  structure. Verify imported preferences still pass the owner-scoped import
  path.
- Public recipes remain unchanged: they already preserve saved units and have
  no account preference control. Do not add a public preference or change
  public access.
- Do not rewrite recipe measurements, add recipe-level unit settings, or add
  volume-to-weight conversion.

## Existing pattern and interaction

The Volume and Weight controls in `src/app/settings/unit-preferences.tsx` are
the closest working reference. Their labeled shared Picklists, immediate
independent saves, and error recovery serve this workflow well; retain them and
add one option rather than introducing a new control or Settings section.

Keep the existing unframed Personal preferences layout, Picklist keyboard and
focus behavior, and mobile hit-area contract from Slice 14A. A selection saves
only its changed dimension. On failure, restore the last saved value and
announce the error; on success, persist through the existing preference path
and reload normally.

The reader continues to use its existing transient state. In Recipe mode,
explicit per-ingredient overrides win until reset; print reflects the same
active scale and units as the screen while hiding interactive controls.

## Data, validation, and compatibility

- Keep recipe unit codes and amounts as the source of truth. No recipe data
  migration is needed.
- Represent `recipe` as an account display preference, not as an intrinsic
  measurement-unit system. Keep unit-definition and amount-formatting types
  limited to `us_customary` and `metric`.
- Validate `recipe` in the Settings action and database preference path;
  unsupported values must fail without changing either preference.
- Existing accounts retain their current US customary or Metric choices.
  Existing recipes, imports, and exports remain readable.
- A failed preference save leaves the saved preference and the other
  dimension unchanged. Existing authentication and owner-isolation boundaries
  remain in force.

## Acceptance criteria and automated coverage

Write focused failing tests before production changes:

- The Settings Volume and Weight Picklists each expose `Recipe`; selecting it
  saves only that dimension, survives reload, and leaves the other dimension
  unchanged. Failure restores the prior selection and announces an error.
- The database accepts `recipe` for either dimension, rejects unsupported
  values without partial updates, preserves existing account defaults, and
  retains owner-only access. The migration harness covers existing and new
  accounts.
- Pure reader-rule tests prove that Recipe mode preserves each stored unit
  system independently across mixed-unit recipes, dual-measurement rows, and
  ranges, while scaling numeric amounts. Same-system simplification remains
  available, but Recipe mode never converts between US customary and Metric.
  Existing US customary and Metric preference behavior remains unchanged.
- Tests prove that per-ingredient overrides still win in Recipe mode and that
  reset returns to the selected account defaults.
- Reader and print tests show the same scaled, mixed-unit values. Public recipe
  tests continue to show stored units without reading account preferences.
- Export/import tests round-trip Recipe preferences without changing bundle
  structure or bypassing validation.
- Chromium and Fold 6 checks verify the existing Settings Picklists, keyboard
  operation, focus, mobile hit targets, and no horizontal overflow. Recipe
  detail and print checks cover representative mixed-unit content.

## Accepted behavior

Recipe mode allows existing same-system simplification after scaling, but does
not convert between US customary and Metric. For example, a saved `0.5 lb`
remains in pounds under the current simplification threshold; a saved `0.125
lb` may display as `2 oz`, while metric measurements remain metric.

## Completion

Update the comprehensive reference, data model, visual guide, decision log,
and roadmap to match the verified behavior. Complete the roadmap's automated
test, accessibility, responsive, and migration checks before marking this DLC
delivered.
