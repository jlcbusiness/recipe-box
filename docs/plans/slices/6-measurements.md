# Slice 6: Measurements

This brief defines quantity entry, persistence, and display for recipe ingredient
rows. The product authority is [the comprehensive reference](../comprehensive-reference.md),
especially [§ 3, Ingredient Rows, Measurements, and Density](../comprehensive-reference.md#3-ingredient-rows-measurements-and-density).
Related boundaries are in the [data model](../data-model.md),
[visual design guide](../visual-design.md),
[delivery roadmap](../delivery-roadmap.md), and
[decision log](../decision-log.md).

## Outcome

A recipe owner can choose one fixed measurement category per ingredient row:
Unit, Count, Things, or Feel. Unit provides independent optional volume
and weight amounts; the other categories expose only their relevant fields.
Saved values render in recipe order and persist when the recipe is edited again.
This slice is implemented and validated locally.

## Scope

Included:

- Positive integer, decimal, fraction, mixed-number, and range quantity input.
- Validation and normalized numeric range storage.
- Fixed Volume and Weight unit catalogs, each identifying US customary or metric
  units. This slice records units but does not convert them.
- Unitless Count, account-managed Things units, and approved Feel
  phrases.
- One category per ingredient row; Unit may contain a volume amount, a weight
  amount, or both.
- Compact desktop table and mobile row-editor controls for measurements,
  including viewport-aware custom picklists with keyboard navigation.
- Amount-first recipe detail rendering, including dual amounts and Feel
  phrases.
- Measurement ownership, save atomicity, edit-version conflicts, and history
  snapshots through the existing recipe save RPC.

Excluded:

- Unit conversion, serving scaling, and trusted-density derivation (Slices 13
  and 15).
- Measurement settings management, unit renaming, and aliases (Slice 14).
- Ingredient display sorting, Ingredient-first presentation, print/public
  output, and instruction mentions (later slices).

## Decisions

- Store measurements in a child table owned by `recipe_ingredients`. Each record
  contains the measurement type, lower numeric bound, optional upper bound,
  fixed unit code or account picklist reference, and display position.
- The editor exposes one fixed category at a time: Unit, Count, Things, or
  Feel. Unit allows a volume amount, a weight amount, or both; Count, Things,
  and Feel each allow one value. The existing storage contract
  remains one Volume row, one Weight row, or the existing single Count,
  Informal, or Unmeasured row.
- Store range endpoints separately as PostgreSQL `numeric`; fractions and mixed
  numbers are parsed to high-precision numeric values before persistence.
  Reject empty, malformed, zero, negative, reversed, non-finite, or unsupported
  quantity syntax. A range uses an ASCII hyphen.
- The fixed catalog contains these stable codes and labels:
  - Volume, US customary: `tsp` (teaspoon), `tbsp` (tablespoon), `fl_oz` (fluid
    ounce), `cup`, `pt` (pint), `qt` (quart), `gal` (gallon).
  - Volume, metric: `ml` (milliliter), `l` (liter).
  - Weight, US customary: `oz` (ounce), `lb` (pound).
  - Weight, metric: `g` (gram), `kg` (kilogram).
- Unit names in the Things category display in plural form when the numeric
  amount (or range maximum) is greater than one; stored account picklist values
  remain singular.
- Things units and Feel phrases reference the existing account-owned
  `recipe_picklist_values` records in the `informal_unit` and
  `unmeasured_phrase` categories. The baseline already seeds both categories;
  Slice 6 adds no duplicate seed path.
- The non-editable category picklist shows only Unit, Count, Things, and Feel,
  and defaults to Unit. Unit presents volume amount/unit and weight amount/unit
  controls side-by-side with a visual slash; either dimension may be left blank
  as long as the other has an amount. Count has no unit control. The Things
  category uses its account unit picklist and Feel uses its approved phrase
  picklist.
- In the desktop edit table, Type has its own cell and all quantity/unit
  controls share one Amount cell. Unit displays volume and weight amount/unit
  pairs separated by a slash; Count, Things, and Feel display only their
  relevant controls. Keep the controls on one line and constrain the table to
  the available width; the compact Type picker is sized to `Things` plus 1mm
  and sits directly beside the Amount controls without an expanded blank
  column. Switch to the mobile row list at narrow widths. The
  left-aligned Amount header spans Type and the Amount cell without subheaders.
  Quantity inputs start at two characters wide, grow with their contents, and
  center their text. Things and Feel picklists use short `Unit` and `Phrase`
  prompts. The weight-unit picker uses compact horizontal padding. The mobile
  row popover keeps Type, quantity, and unit controls on a compact wrapping
  line; paired Unit dimensions may wrap as needed. Quantity inputs retain
  content-based widths and the layout must not introduce horizontal page
  scrolling. Mobile quantity fields use short horizontal padding and keep a
  deliberate small amount-to-unit gap; the row pane is sized to accommodate
  paired fractional Unit values at supported mobile widths.
- Recipe detail places formatted amounts before ingredient/specifics text.
  Specifics text is lowercase. Volume
  and Weight use catalog abbreviations; dual amounts are separated by ` / `.
  Feel phrases follow the ingredient name (for example, `salt to taste`);
  Preparation remains after the ingredient text. US customary values use common
  fractions with denominators 2, 3, 4, and 8 when within 0.03; other values
  display as decimals rounded to at most two places. Metric values always display
  as decimals rounded to at most two decimal places. Ranges format both endpoints
  using the applicable unit-system rule. In view mode, pluralize `cup` as `cups`
  when the amount or range maximum is greater than one; leave abbreviated units
  unchanged.
- Ingredient rows, measurements, recipe version, and before/after history
  snapshots commit atomically in the existing versioned `save_recipe` RPC.
  Owners can read their measurements; direct writes remain denied.

## Save and data contract

Add an owner-scoped `recipe_ingredient_measurements` table with a foreign key to
its recipe ingredient. Define row-local checks for valid type, finite positive
bounds, non-reversed ranges, legal fixed units, unitless Count, and the required
picklist category for Informal or Unmeasured values. Reject PostgreSQL numeric
`NaN` and positive or negative `Infinity` at this boundary as well as in the
client parser. The owner ID must match the parent ingredient row and referenced
picklist value.

Extend each `p_ingredient_rows` payload item with a `measurements` array. Each
entry identifies its type, parsed lower and optional upper numeric bound, fixed
unit code or picklist value ID, and order. Treat an omitted array as empty for
compatibility with existing clients and test fixtures. Reject unknown fields
that could create an ambiguous type/unit combination; reject duplicate types,
more than two entries, or any pair other than Volume plus Weight.

Update the deferred recipe-history snapshot to include each ingredient's
ordered measurement records on both the before and after sides. A failed,
invalid, or stale save must leave recipe metadata, ingredient rows, measurements,
and history unchanged.

## Acceptance tests

Write these tests before production code:

- Unit tests parse integers, decimals, simple fractions, mixed numbers, and
  ranges; format common fractions and decimal fallbacks; reject malformed,
  zero, negative, reversed, and non-finite values; and validate every type/unit
  combination and dual-measurement rule.
- Database/API tests save Volume, Weight, Count, Informal, and Unmeasured
  records, including a Volume-plus-Weight pair; verify stored bounds,
  unit/picklist ownership, and history snapshots; and prove direct measurement
  writes and cross-account references are denied.
- Database/API tests reject invalid units, missing required values, duplicated
  measurement types, unsupported pairs, invalid ranges, and non-finite bounds
  without changing recipe version, ingredients, measurements, or history.
- End-to-end tests select each of the four fixed categories, enter measurements
  in desktop and mobile editors, save, view formatted ingredient text, reopen
  edit mode, and verify values, units, and order persist. Include volume-only,
  weight-only, and dual Units amounts.
- Accessibility checks cover type controls, amount/unit labels, validation
  feedback, keyboard operation (Arrow keys, Home, End, Enter, Space, and
  Escape for custom listboxes), and mobile layout.

## Verification

Run the measurement unit tests first. Run database and browser tests only
against the existing local Supabase stack; do not run `npm run dev:local`,
`npm run supabase:reset`, or any command that resets the local database. Then
run TypeScript typecheck, Biome, and the focused recipe suite.

## Completion criteria

- Each measurement type can be entered, saved, reloaded, and displayed
  according to the acceptance behavior above.
- The editor offers only the four fixed categories; Units accepts a volume
  amount, a weight amount, or both, and no other category can be paired.
- Owner isolation, input validation, atomic rollback, and history snapshots are
  verified by deterministic automated tests.
- Focused unit, database/API, end-to-end, and accessibility tests pass, as do
  TypeScript typecheck, Biome, and the relevant recipe suite.
- Slice 6 adds no conversion, scaling, density, settings-management, or
  instruction-mention behavior.
