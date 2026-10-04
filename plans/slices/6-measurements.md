# Slice 6: Measurements

This brief defines quantity entry, persistence, and display for recipe ingredient
rows. The product authority is [the comprehensive reference](../comprehensive-reference.md),
especially [§ 3, Ingredient Rows, Measurements, and Density](../comprehensive-reference.md#3-ingredient-rows-measurements-and-density).
Related boundaries are in the [data model](../data-model.md),
[visual design guide](../visual-design.md),
[delivery roadmap](../delivery-roadmap.md), and
[decision log](../decision-log.md).

## Outcome

A recipe owner can give an ingredient row a Volume, Weight, Count, Informal, or
Unmeasured value, optionally add its complementary Volume or Weight value, save
it with the ingredient row, and see the amount rendered in recipe order. Editing
and reloading preserves the measurement values and their type.

## Scope

Included:

- Positive integer, decimal, fraction, mixed-number, and range quantity input.
- Validation and normalized numeric range storage.
- Fixed Volume and Weight unit catalogs, each identifying US customary or metric
  units. This slice records units but does not convert them.
- Unitless Count, account-managed Informal units, and approved Unmeasured
  phrases.
- One measurement or a Volume-plus-Weight pair per ingredient row.
- Compact desktop table and mobile row-editor controls for measurements.
- Amount-first recipe detail rendering, including dual amounts and unmeasured
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
- A row may have no measurement, one measurement of any type, or exactly one
  Volume and one Weight measurement. Count, Informal, and Unmeasured cannot be
  paired with another measurement. Enforce the contract in both the save RPC
  and database constraints where row-local constraints permit.
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
- Informal units and Unmeasured phrases reference the existing account-owned
  `recipe_picklist_values` records in the `informal_unit` and
  `unmeasured_phrase` categories. The baseline already seeds both categories;
  Slice 6 adds no duplicate seed path.
- A measurement editor presents the type selector and only the fields valid for
  that type. Volume and Weight can expose `+ Add measurement` for the other
  dimension. Count has no unit control; Informal and Unmeasured use their
  account picklists. All fields have row-specific accessible names and invalid
  quantities expose an associated error.
- The desktop editor adds an Amount column. The mobile row popover includes the
  same measurement controls without introducing horizontal page scrolling.
- Recipe detail places formatted amounts before ingredient/detail text. Volume
  and Weight use catalog abbreviations; dual amounts are separated by ` / `.
  Unmeasured phrases follow the ingredient name (for example, `salt to taste`);
  Preparation remains after the ingredient text. Common fractions use
  denominators 2, 3, 4, and 8 when within 0.03; other values display as decimals
  rounded to at most two places. Ranges format both endpoints using the same
  rule.
- Ingredient rows, measurements, recipe version, and before/after history
  snapshots commit atomically in the existing versioned `save_recipe` RPC.
  Owners can read their measurements; direct writes remain denied.

## Save and data contract

Add an owner-scoped `recipe_ingredient_measurements` table with a foreign key to
its recipe ingredient. Define row-local checks for valid type, positive bounds,
non-reversed ranges, legal fixed units, unitless Count, and the required
picklist category for Informal or Unmeasured values. The owner ID must match the
parent ingredient row and referenced picklist value.

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
- Database/API tests save Volume, Weight, Count, Informal, Unmeasured, and a
  Volume-plus-Weight pair; verify stored bounds, unit/picklist ownership, and
  history snapshots; and prove direct measurement writes and cross-account
  references are denied.
- Database/API tests reject invalid units, missing required values, duplicated
  measurement types, unsupported pairs, and invalid ranges without changing
  recipe version, ingredients, measurements, or history.
- End-to-end tests enter measurements in desktop and mobile editors, save, view
  formatted ingredient text, reopen edit mode, and verify type, value, unit, and
  order persist. Include the dual-measurement display and at least one value of
  each measurement type.
- Accessibility checks cover type controls, amount/unit labels, validation
  feedback, keyboard operation, and mobile layout.

## Verification

Run the measurement unit tests first. Run database and browser tests only
against the existing local Supabase stack; do not run `npm run dev:local`,
`npm run supabase:reset`, or any command that resets the local database. Then
run TypeScript typecheck, Biome, and the focused recipe suite.

## Completion criteria

- Each measurement type can be entered, saved, reloaded, and displayed
  according to the acceptance behavior above.
- A row can have a Volume-plus-Weight pair and cannot have any other pair.
- Owner isolation, input validation, atomic rollback, and history snapshots are
  verified by deterministic automated tests.
- Focused unit, database/API, end-to-end, and accessibility tests pass, as do
  TypeScript typecheck, Biome, and the relevant recipe suite.
- Slice 6 adds no conversion, scaling, density, settings-management, or
  instruction-mention behavior.
