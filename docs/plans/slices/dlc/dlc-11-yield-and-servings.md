# DLC 11: Yield and servings

This brief adds a richer recipe yield while preserving the existing positive
integer `serves` value used by serving-based scaling.

## Outcome

A recipe can state what it produces, such as “one 9-inch cake” or “24 cookies,”
without making an ambiguous count serve as both people and product yield.

## Scope

- Define a yield quantity and human-readable unit/description.
- Keep `serves` as the serving-count input unless product review explicitly
  approves a migration.
- Display yield in private, public, print, search results where useful, and
  standalone exports.
- Preserve yield in history, import/export, offline snapshots, and recipe
  cloning or duplication.
- Keep scaling semantics explicit: yield may scale, but the user-facing
  serving count remains independently understood.

## Decisions before implementation

- Decide whether yield is structured quantity plus unit or a free-text field.
- Define conversion and scaling behavior for fractional, plural, and
  non-countable yields.
- Decide how yield and servings appear together on small screens and in print.

## Acceptance

- Existing recipes retain their current serving counts with no inferred yield.
- Yield can be entered, edited, cleared, scaled if supported, and rendered
  consistently without changing ingredient base quantities.
- Bundle import/export, history, public allow-list, and offline behavior are
  covered by regression tests.
- Unit, migration, database/RLS, browser, print, and accessibility checks pass.

## References

- [Recipe card basics](../4-recipe-card-basics.md)
- [Scaling and conversion](../13-scaling-and-unit-conversion.md)
