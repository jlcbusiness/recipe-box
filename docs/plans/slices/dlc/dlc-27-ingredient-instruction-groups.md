# DLC 27: Ingredient sets and instruction groups

This candidate slice explores linking recipe ingredient sets to named groups of
instruction steps. It follows the ingredient-set, instruction-authoring, and
standalone-output foundations in DLC 03, DLC 05, and DLC 09. It is not ready
for implementation until the decisions below are resolved.

## Candidate outcome

A recipe can organize its ingredient sets and instruction steps into matching
sections, so each section presents the ingredients needed for its steps and
can be placed independently in print and standalone exports. For example, a
main dish and its sauce can be authored and presented as separate sections.

## Dependencies and boundaries

- Reuse recipe-owned ingredient sets from [DLC 03](dlc-03-ingredient-sets.md)
  and ordered instruction steps and Markdown behavior from
  [DLC 05](dlc-05-instruction-authoring-and-references.md).
- Integrate with the responsive recipe reader and page-based print/export
  layouts from [DLC 09](dlc-09-standalone-recipe-exports.md).
- Keep section relationships within one recipe. Do not add a reusable
  cross-recipe section catalog.
- Preserve unrelated recipe fields, measurement semantics, and the existing
  public/private data boundary.

## Decisions before implementation

- Define whether one instruction group maps to one ingredient set or whether
  either side can participate in multiple groups.
- Decide whether instruction groups are explicit records with labels and
  ordering, or whether existing instruction headings provide the grouping.
- Define how existing recipes migrate and how ungrouped ingredients or steps
  are represented.
- Specify the editor interaction for creating, naming, ordering, and assigning
  groups without disrupting the current instruction and ingredient workflows.
- Decide whether a group boundary only changes reader organization or also
  starts a new print/export page by default, and how the person can override
  that behavior.
- Define save/version-conflict behavior, history snapshots, public projection,
  Trash and restore, offline snapshots, ZIP import/export compatibility,
  validation, and authorization for the relationship.

## Acceptance to define after decisions

- The editor can create and revise the agreed section relationships with
  keyboard and pointer input.
- Reader, public view, print, offline, and all applicable export formats show
  each section's ingredients and instructions in the agreed order.
- Existing recipes retain their content and have deterministic migrated
  behavior.
- Save conflicts, history, restore, public authorization, and bundle
  round-trips preserve or reject the complete relationship atomically.
- Automated unit, database, browser, accessibility, responsive, import/export,
  and print tests cover the finalized behavior.
