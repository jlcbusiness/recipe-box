# DLC 02: Recipe reader and measurement polish

This slice refines the existing recipe-reading flow without changing recipe
data, account preferences, or measurement storage.

## References

- [DLC roadmap](README.md), Phase 1
- [First-draft specification](../../first-draft-spec.md), Recipes and Views
- [Comprehensive reference](../../comprehensive-reference.md), §§ 2, 3, 4,
  9, and 13
- [Data model](../../data-model.md), Measurement and Preference boundaries
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide](../../visual-design.md), Ingredient Presentation and
  Recipe Detail
- [Decision log](../../decision-log.md), reader controls, measurement display,
  cook mode, and DLC 02
- [Slice 16: Cooking views](../16-cooking-views.md)
- [DLC 08: Recipe reading, public, and print layout](dlc-08-recipe-public-and-print-layout.md)
- [MDN: Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)

## Outcome

A person reading or cooking from a recipe can identify and use the reader
controls, change displayed units without a hover-only cue, check off ingredients
in cook mode on narrow screens, and scan durations and small teaspoon amounts
consistently. Private, public, and printed views reuse the same display rules
where their existing contracts allow them. All conversions remain transient.

## Scope

- Left-align the Ingredients reader controls with their heading and keep the
  current/next mode available in each button's accessible name and tooltip.
- Keep the reader's presentation summary associated with the heading. Reserve
  the sort-direction slot on wider layouts, but collapse it when unavailable
  on mobile so visible controls align with the heading.
- Make editable volume and weight unit labels, including single-letter units
  such as `g`, visibly underlined at rest on pointer and touch layouts. Keep
  the existing picklist, keyboard behavior, accessible name, conversion
  choices, and transient override state.
- Reduce only the ingredient-side spacing that crowds cook-mode checkboxes.
  Preserve the 48px checkbox target and existing wake-lock lifecycle. Check-off
  remains available when Wake Lock is unsupported or denied.
- Label time summaries “Time Breakdown” and display durations below one hour in
  minutes, then durations of at least one hour as `N hr` or `N hr M min`,
  omitting zero minutes. Apply this to private detail, public detail, and print.
- In US customary teaspoons, display a scalar amount as `pinch` when it is
  closer to 1/16 tsp than to 0 or 1/8 tsp. The exact midpoint ties remain
  numeric. Do not alias ranges, metric volumes, or values displayed in a unit
  other than teaspoons. Scaling is applied before this display decision.

## Exclusions and dependencies

- No migration, new database field, unit code, picklist option, or settings
  preference. `pinch` is not a selectable or stored unit.
- Do not change the exact measurement, saved unit, recipe version, history,
  export format, account defaults, scale behavior, or unit-override behavior.
- Preserve Slice 16's presentation, sorting, cook-mode, and Wake Lock contracts;
  preserve DLC 08's public privacy and print contracts.
- Preserve the public page's stored-unit default and its existing public
  allow-list. Do not introduce private reader controls or data to guests.
- Do not change recipe form entry or measurement parsing.

## Data, state, and failure boundaries

- The existing recipe record remains the sole persisted source for minutes and
  measurements. Formatting is pure display logic over saved or transiently
  scaled/converted values.
- Unit overrides, scale values, presentation, sort, cook-mode check-off, and
  wake-lock status remain transient. Reset, recipe changes, and wake-lock
  failures retain their existing Slice 16 behavior.
- The `pinch` alias is calculated from the final displayed scalar teaspoon
  amount. It never changes the value or unit passed to storage or export. A
  unit change away from teaspoons displays the ordinary converted value; a
  later return to teaspoons applies the same alias rule again.
- No new network, database, authorization, or external-service boundary is
  introduced. Browser wake-lock support remains optional and failure must not
  disable check-off.

## Interaction and responsive behavior

- Reader buttons remain icon-only, keyboard-operable controls with visible
  focus and names/tooltips that announce the current and next mode. The summary
  remains readable text; controls remain stable when modes change on wider
  layouts and align with the heading on mobile.
- Unit tokens are still buttons/listbox triggers. Underlining is visible before
  hover or focus, including for single-letter units such as `g`; selection,
  Escape, focus return, and transient conversion continue to use the existing
  picklist contract.
- Cook mode keeps labeled native checkboxes and minimum 48px hit targets. The
  ingredient table/list may reclaim only the margin needed for the checkbox
  rail at narrow widths; no page-level horizontal overflow is permitted.
- Print hides interactive controls and check-off state, but shows the active
  presentation, scaled/converted values, time wording, and pinch display.
- No draft, submit, cancel, or save action is added. Reader changes apply
  immediately and are discarded on navigation or reload.

## Test-first acceptance

- Unit tests cover duration boundaries (`0`, `59`, `60`, `61`, and multiple
  hours), omission of zero minutes, and pinch values below, at, and above both
  midpoint boundaries. They also prove ranges, metric values, and non-teaspoon
  values are not aliased and source measurements remain unchanged.
- Private recipe browser tests verify desktop control ordering, mobile
  alignment and Scale-to-Screen-Lock spacing, resting underlines including for
  `g`, keyboard opening/selection/focus behavior, cook-mode geometry and 48px
  targets at mobile and narrow widths, the new time heading/format, active
  print formatting, and unchanged stored measurements.
- Public browser tests verify `Time Breakdown`, duration formatting, and the
  shared pinch display without exposing private fields or unit preferences.
- Axe checks cover the changed private/public reader states. Existing
  presentation, sort, print, and wake-lock regression tests continue to pass.
- Focused tests run first, followed by TypeScript, Biome, Markdown lint, the
  relevant Chromium/Fold 6 E2E and accessibility checks, and production build.
  Do not reset local Supabase data; use the existing local test harness.

## Assumptions

- The nearest-value pinch interval is open at 1/32 tsp and 3/32 tsp, so exact
  ties stay numeric. This follows the stated “closer to 1/16 than to 0 or 1/8”
  rule without adding an arbitrary tolerance.
- Ranges remain numeric because replacing two endpoints with one singular
  informal display word would lose the range distinction.
- Durations use the compact established unit abbreviations `hr` and `min`.

## Completion criteria

- The reader controls, unit affordance, cook-mode spacing, time display, and
  pinch display meet the automated acceptance criteria without changing
  persisted data or adjacent Slice 16/DLC 08 behavior.
- Focused unit, Chromium/Fold 6 browser, accessibility, TypeScript, Biome,
  Markdown lint, and production-build checks pass. No unrun check is reported
  as passed.
- The comprehensive reference, visual guide, decision log, and DLC roadmap
  reflect verified behavior; the roadmap marks DLC 02 delivered only after all
  completion criteria pass.
