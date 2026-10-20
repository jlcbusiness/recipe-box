# DLC 16: Ingredient density profiles

This brief extends the single trusted density from Slice 15 to contexts where
one ingredient has multiple valid conversions.

## Outcome

A person can choose or apply an appropriate density profile for an ingredient
without silently changing saved recipe quantities.

## Scope

- Define profile identity and context, such as preparation, packing, or
  temperature, using only validated domain terms.
- Support multiple owner-managed profiles per canonical ingredient.
- Preserve the current trusted density as a default or migration candidate.
- Make conversion context visible when it affects derived amounts.
- Keep derived values transient unless a user explicitly saves an amount.
- Avoid speculative pressure or temperature corrections until verified.

## Decisions before implementation

- Define profile naming, uniqueness, default selection, and ambiguity behavior.
- Decide which measurement forms can derive a value; Count, Things, and Feel
  require separate domain rules.
- Research authoritative density data and whether updates can be maintained.
- Specify public and print behavior when a recipe has no explicit context.

## Acceptance

- Existing recipes and densities retain their current behavior after migration.
- Editing or deleting a profile never mutates recipe quantities or history.
- Derived values expose their selected context and can be overridden safely.
- Migration, owner-isolation, calculation, editor, public/print, and
  accessibility tests pass.

## References

- [Trusted densities](../15-trusted-density.md)
- [Ingredient catalog](../14c-ingredient-catalog-management.md)
