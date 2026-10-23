# DLC 04: Ingredient amount semantics and references

**Status:** Implementation complete. Domain rules, editor/reader behavior,
database migration, history, and bundle v3 support are implemented. Unit,
typecheck, build, documentation lint, isolated migration, and browser checks
pass.

This slice depends on ingredient sets in DLC 03 and should let a cook understand
how an ingredient is divided across uses, while making repeated ingredients and
set membership unambiguous in instruction references.

## Current behavior

- Ingredient rows own their existing measurement rows. Scaling and unit
  conversion derive reader values without changing the saved base amount.
- `Specifics` is qualitative detail, and `Preparation` is addable text;
  `cubed` and `divided` also trigger their structured Size or portion controls
  in the editor. `divided` remains an existing Feel phrase for Feel amounts.
- A structured instruction mention targets one stable recipe-ingredient ID.
  Its readable form is `#<slug>`; it carries neither a portion nor a set label.
- DLC 03 already provides stable ingredient-set IDs and row membership.
- Before DLC 04, the editor, reader, public projection, print, history, and
  bundle paths supported the existing row, measurement, set, and mention
  contracts, but did not model divided portions or Size as structured data.

Before this DLC, the application did not model divided portions or Size as
structured data. The implementation now adds those behaviors while preserving
existing amounts and whole-row mentions; existing data is not silently
reinterpreted.

## Scope

- Add explicit ratio-allocation semantics for divided ingredients without
  replacing or rewriting their existing base measurements.
- Add numeric Size and inch/centimeter unit fields for cubed ingredients while
  preserving existing Specifics and Preparation values.
- Enforce one canonical ingredient row per set and represent repeated uses as
  portions, with references that distinguish sets and portions.
- Carry the meaning through scaling, unit conversion, private and public
  readers, print, offline snapshots, history, and versioned bundles.
- Preserve explicit recipe Save, optimistic concurrency, owner scoping, and
  existing mention unlink behavior.

## Out of scope

- Ingredient aliases, nutrition calculations, or changing measurement
  precision and unit-conversion rules.
- Linking instruction steps to whole ingredient sets or changing set order.
- Replacing free-text recipe instructions or automatically rewriting existing
  `Specifics`, `Preparation`, or Feel values.

## Accepted decisions

- Keep the row's existing measurements as the canonical total. Division creates
  exactly two ordered portions: the person enters the first portion's amount,
  and the app calculates the remainder. Store the first portion as a ratio of
  the total; the second ratio is its complement. Scale and convert the total
  before deriving either portion. Reading never changes the saved total.
- Do not ask the person to enter a new unit for a portion. The first amount
  reuses one measurement dimension already present on the row. When both volume
  and weight are present, choose the dimension by activating its existing
  underlined unit control; do not add a "Divide using" header. Derive one
  shared ratio and apply it to both.
- Only scalar numeric totals can be divided: Unit, Count, and Things values.
  Ranges and Feel phrases cannot be divided. New size values are positive
  decimals in inches or centimeters, stored in the chosen unit and formatted
  with the existing recipe-quantity rules; Size appears only with `cubed`
  Preparation.
- An ingredient can appear at most once in a set. To use it more than once in
  that set, add portions to that one row; another occurrence belongs in a
  different set. Each row owns an independent total and independent division:
  dividing the ingredient in one set does not divide or change its row in
  another set. The same ingredient may therefore be divided in both sets, with
  each set's row holding its own first-use amount and computed remainder. There
  is no automatic aggregation across sets. The save boundary must reject
  duplicates within one set rather than silently merge rows.
- A divided-row mention must select one of its two portions. A regular row
  mention selects the whole amount. A mention always resolves to one row within
  one set; it never targets all rows with the same canonical ingredient.
  Autocomplete labels use only the qualifiers needed to distinguish candidates:
  show the set when that canonical ingredient occurs in more than one set, and
  show the portion amount when the row is divided. If the ingredient occurs in
  only one set, omit the set even if it is not Main. For example, a lone Carrot
  row is labeled `Carrot`; a lone divided Salt row in Sauce is labeled
  `Salt (1 tsp)` and `Salt (1/2 tsp)` (or `Salt (1st 1 tsp)` and
  `Salt (2nd 1 tsp)` if the portions are equal). If Sugar occurs in both Main
  and Sauce, with two equal `1 cup` portions in Main and `1 tbsp` plus `3 tbsp`
  in Sauce, show `Sugar (Main) (1st 1 cup)`, `Sugar (Main) (2nd 1 cup)`,
  `Sugar (Sauce) (1 tbsp)`, and `Sugar (Sauce) (3 tbsp)`. Set labels
  disambiguate rows across sets; current portion amounts disambiguate portions
  within each row, adding `1st` or `2nd` only when its two amounts are equal.
- Readable reference slugs include ingredient and set, and use a stable portion
  ordinal for each divided row, such as `sugar-main-1`, `sugar-main-2`,
  `sugar-sauce-1`, and `sugar-sauce-2`. Thus each autocomplete label maps to
  exactly one stable row/set/portion target, even when two sets have the same
  ingredient and portion amounts. Slugs always include set identity even when
  the autocomplete label omits it (for example, `carrot-main` and
  `salt-sauce-1`). Stable IDs are authoritative; a set rename refreshes the
  readable slug without retargeting the mention.
- Size is numeric and has an explicit unit choice of inches or centimeters.
  `Cubed` remains Preparation; Size is separate and is not a free-text
  replacement for Preparation.

## Implementation constraints

### Persistence and compatibility

- Store `portion_one_ratio` on the ingredient row as a nullable numeric ratio
  strictly between zero and one. Its complement is portion 2. The fixed
  portion identity is the stable recipe-ingredient row ID plus ordinal `1` or
  `2`; no separate portion table is needed. A null ratio means the row is not
  divided.
- Store `size_value` and `size_unit` on the ingredient row. Both are null when
  Size is absent; otherwise the value is positive and the unit is `in` or
  `cm`. Size is valid only when Preparation is `cubed`.
- Preserve whole-row markers as
  `[[ingredient:<row-id>|<slug>]]`. A portion marker adds its fixed ordinal,
  `[[ingredient:<row-id>:<1-or-2>|<slug>]]`, and the mention projection stores
  the nullable `portion_ordinal`. The row ID and ordinal are authoritative;
  the slug is readable only. Existing whole-row markers remain valid and refer
  to the canonical total. Autocomplete offers portion options, not a whole-row
  option, for a divided row.
- Advance portable bundles to schema version 3. Version 3 records include the
  new ingredient-row fields and mention ordinal. Imports of versions 1 and 2
  default the new fields to null, preserving their unsplit, no-Size, whole-row
  mention behavior. Export/import must retain ratios, units, row IDs, and
  portion ordinals when IDs are remapped.
- History snapshots include row ratios, Size values/units, and mention
  ordinals. Public and offline projections include only the new data needed to
  render portions and Size; they do not expose additional private fields.
- Before any schema or data change, migration preflight checks all recipes,
  including trashed recipes, for repeated canonical ingredients within one
  set. If found, it aborts. After successful preflight, enforce per-set
  uniqueness in the database as well as in recipe-save validation.

- Size accepts any positive decimal, preserves the entered inches or
  centimeters, and has no minimum beyond greater than zero. Reader and print
  display use the app's quantity formatting (customary inch fractions and
  metric centimeter decimals), with the existing `cubed` Preparation before
  the Size value.
- The first-portion amount must be positive and less than the total. The
  computed remainder is read-only. For dual-measurement rows, the existing
  underlined unit control selects which dimension supplies the entered amount;
  there is no additional heading or new unit field.
- Migration preflight stops before changing schema or data if it finds
  same-set duplicate canonical ingredients. Owners must resolve them
  explicitly; no existing rows are silently merged or removed.

## State and failure boundaries

- New allocation and size edits are staged in the existing recipe form and
  commit only on Save. Cancel, close, or navigation discards the draft; reload
  shows only committed values.
- Validation and version-conflict failures keep the complete draft and use the
  existing form error region. No partial recipe, portion, or mention writes are
  allowed.
- If schema changes are approved, the migration must preserve existing
  measurements, rows, sets, and mentions. New writes remain owner-scoped through
  the recipe-save boundary; public output includes only information required to
  read the recipe. History captures before/after values, and import validates
  all new references before commit.
- Existing bundles remain importable. Any bundle schema change, ID remapping,
  and default for recipes without new allocation data must be specified before
  implementation.

## UI and accessibility contract

- Reuse the existing ingredient row editor and mobile row pane; do not add a
  parallel editor or new page. Place controls within the current row workflow
  and let them wrap at the existing responsive boundary.
- Selecting `divided` in Preparation reveals compact inline controls for the
  first-use amount, its current measurement unit, and the read-only remainder;
  do not show a standalone Divide checkbox. Selecting `cubed` reveals the Size
  input and an underlined `in`/`cm` toggle in Preparation. Make changing Preparation and
  editing these controls available by keyboard, pointer, and touch, with
  visible focus and announced validation. The dual-measure dimension is chosen
  through the existing underlined unit control without a new heading.
- Keep instruction autocomplete keyboard-operable and viewport-bounded. Its
  option name must distinguish repeated rows and sets to screen readers as well
  as visually.
- Preserve reader ingredient grouping and print layout; test narrow widths for
  wrapping, clipping, overlap, and page-level horizontal overflow.

## Acceptance tests proposed

- **Unit:** Validate two-portion math, positive scalar inputs, range/Feel
  rejection, shared-ratio behavior for volume plus weight, same-set duplicate
  rejection, and independent totals and portions for the same ingredient in
  different sets. Verify references resolve only to the selected row/set and
  portion, and scaling and unit conversion do not mutate saved totals.
- **Database/migration:** Verify existing rows and mentions are unchanged;
  preflight aborts without schema/data changes when a same-set duplicate exists;
  owner isolation, version-conflict rollback, atomic save, constraints, and
  history snapshots for new fields and references.
- **Browser:** Create/edit/save/cancel allocations and Size; verify autocomplete
  omits the set for an ingredient present in only one set, includes it when the
  ingredient occurs in multiple sets, and labels divided portions by amount
  (adding an ordinal only for equal amounts). Verify each option inserts only
  its corresponding stable reference, plus keyboard focus, accessible names,
  announced validation, and draft retention on failure.
- **Representations:** Verify private/public, Standard/Ingredient-first,
  print, and offline display; exports round-trip new data, imports remap
  references, and bundle versions 1 and 2 remain compatible.
- **Responsive:** Assert ingredient editor and reader geometry at the current
  reflow boundary, immediately on either side, and at an intermediate width
  where the new controls wrap. Run axe on the changed editor and reader states.

## References

- [DLC brainstorm](../../discussion/dlc.md)
- [DLC 03: Ingredient sets](dlc-03-ingredient-sets.md)
- [DLC 05: Instruction authoring and references](dlc-05-instruction-authoring-and-references.md)
- [Comprehensive reference, § 3](../../comprehensive-reference.md#3-ingredient-rows-measurements-and-density)
- [Comprehensive reference, § 4](../../comprehensive-reference.md#4-ingredient-presentation-and-sorting)
- [Comprehensive reference, § 5](../../comprehensive-reference.md#5-instructions-autocomplete-and-recipe-linking)
- [Comprehensive reference, § 9](../../comprehensive-reference.md#9-sharing-privacy-urls-and-image-delivery)
- [Comprehensive reference, § 11](../../comprehensive-reference.md#11-import-export-and-backup-bundles)
- [Comprehensive reference, § 12](../../comprehensive-reference.md#12-change-history-and-forensic-audit)
- [Data model](../../data-model.md)
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide, Ingredient Presentation](../../visual-design.md#ingredient-presentation)
