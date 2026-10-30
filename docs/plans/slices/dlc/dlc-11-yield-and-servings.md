# DLC 11: Makes and servings

This slice adds optional recipe yield as a companion to `Serves`, without
changing the existing positive integer serving count or inferring yield for
existing recipes.

## Outcome

A recipe can state both how many people it serves and what the base recipe
makes, such as `Serves 4` and `Makes 1 cake`.

## Scope

- Keep `serves` as the optional positive integer count of people served.
- Add one optional **Makes** group with `makes_quantity` (a positive integer)
  and `makes_thing` (free text). Save both fields together or leave both blank.
- Preserve the authored thing text exactly; do not pluralize or otherwise
  rewrite it. The existing ingredient Things helper is a limited display
  heuristic, not a general pluralization API or dictionary.
- Keep the stored Makes quantity as the unscaled positive integer. When recipe
  scaling is applied, display the quantity multiplied by the same active scale
  factor used for ingredient amounts. Use the existing quantity formatter, so
  a scaled result may be fractional. Scaling remains a reader presentation and
  does not alter saved Makes, Serves, or ingredient base quantities.
- Display Makes alongside Serves in recipe detail, public detail, print, and
  standalone exports. Preserve it in recipe history, bundle import/export,
  offline snapshots, and recipe cloning or duplication. Include it in search
  results where recipe metadata is surfaced.
- Reconcile the earlier “Yield is removed” decision in the product references
  and decision log with this DLC 11 contract before implementation.

## Form and display

- Use the shared **Makes** header for the quantity and thing controls; expose
  clear accessible names for both fields.
- Under the **Makes** metadata heading, display `<scaled quantity> <authored
  thing>` without repeating “Makes.” Keep the thing text unchanged even when
  the scaled quantity is fractional or its grammar appears unusual. The public
  title has no separate Makes heading, so retain its inline “Makes” label.
- In recipe metadata, keep Makes grouped and adjacent to Serves. Keep the two
  controls on one line: size quantity for two digits and let the thing input
  fill the remaining available width under the shared heading. Print keeps
  Serves and Makes together as readable metadata.

## Data and scaling boundaries

- Existing recipes retain their current `serves` values and start with no
  Makes data.
- The database stores both Makes values as nullable recipe metadata. A Makes
  value is either a complete quantity-and-thing pair or absent.
- Validate the saved quantity as a positive integer. Validate the thing as
  non-empty free text when Makes is present; do not constrain it to a
  vocabulary.
- Scaling uses the applied reader scale factor. Pending changes do not alter
  the displayed yield until the existing scale action applies them; reset
  restores the saved base yield.

## Acceptance

- Existing recipes keep their serving counts and render no inferred Makes.
- The editor accepts, edits, and clears Makes; rejects zero, negative,
  fractional, or incomplete saved values; and preserves arbitrary thing text.
- Scaling applies to Makes quantity using the same applied factor and quantity
  formatting as ingredient amounts, without changing saved recipe data.
- Private, public, print, search, bundle import/export, history, offline, and
  clone/duplicate paths preserve and expose Makes consistently.
- Unit, migration, database/RLS, browser, print, and accessibility checks
  cover the new field and its failure boundaries.

## References

- [Recipe card basics](../4-recipe-card-basics.md)
- [Scaling and conversion](../13-scaling-and-unit-conversion.md)
- [Visual design guide](../../visual-design.md)
- [Decision log](../../decision-log.md)
