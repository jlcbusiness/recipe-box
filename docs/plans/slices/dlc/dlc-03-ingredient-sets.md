# DLC 03: Ingredient sets

This brief adds named groups of ingredients to a recipe, such as “For the
sauce” and “For the filling.” It precedes work that needs set-aware references.

## Outcome

A recipe can contain multiple labeled ingredient sets. Existing recipes remain
valid and display as one default set unless a migration decision says otherwise.

## Scope

- Define stable identity, ordering, and labels for recipe ingredient sets.
- Assign each ingredient row to one set and support moving rows between sets.
- Render labels consistently in edit, Standard, Ingredient-first, public, and
  print views.
- Preserve ingredient row identity so instruction mentions remain valid.
- Integrate set identity with reorder, scaling, export/import, history, trash,
  restore, public projection, and offline snapshots.

## Decisions before implementation

- Decide whether every recipe has at least one set and what the default label
  is for existing and newly created recipes.
- Define whether empty sets persist and whether sets can be reordered or deleted.
- Define set-level versus recipe-level ordering and how sets appear in each
  reader presentation.
- Review migrations and import compatibility before choosing the storage model.

## Acceptance

- Create, rename, reorder, and remove a set without losing or silently
  reassigning ingredient rows.
- Existing recipes migrate deterministically and remain readable and editable.
- Structured ingredient mentions continue resolving to the same row after set
  changes.
- Unit, migration, database/RLS, import/export, browser, public, print, and
  accessibility tests cover the new boundaries.

## References

- [Ingredient rows](../5-ingredient-rows.md)
- [Ingredient presentations](../16-cooking-views.md)
- [DLC brainstorm](../../discussion/dlc.md)
