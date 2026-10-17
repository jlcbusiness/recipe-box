# Slice 23: History Viewer

## References

- [Delivery roadmap](../delivery-roadmap.md), slice 23
- [First-draft specification](../first-draft-spec.md), Import, Export, Lifecycle, and History
- [Comprehensive reference](../comprehensive-reference.md), §§ 6.6, 9, 12, and 13
- [Data model](../data-model.md), Ownership and Relationship Rules
- [Design philosophy](../design-philosophy.md)
- [Visual design guide](../visual-design.md), Recipe detail, publication detail, and Trash
- [Decision log](../decision-log.md), history and purge decisions
- [Slice 4: Recipe card basics](4-recipe-card-basics.md)
- [Slice 8: Trash, restore, and print](8-trash-restore-and-print.md)
- [Slice 10B: Publication deletion and restore](10b-publication-deletion-and-restore.md)
- [Slice 12.5: Edit publications](12.5-edit-publications.md)
- [Slice 22: Public links and privacy](22-public-links-and-privacy.md)

## Outcome

An owner can open a read-only, newest-first history page from an active recipe
or publication and understand when it changed, what action occurred, and which
meaningful values changed. No history is exposed on public recipe pages.

## Scope

- Add dedicated `/recipes/{id}/history` and `/publications/{id}/history` pages,
  linked at the bottom of their active detail pages.
- Read the existing `recipe_history` and `publication_history` snapshots. Add
  indexes for owner, record, and descending event time. Extend recipe snapshots
  with historical display values for single- and multi-select picklists and the
  assigned publication name so their diffs do not expose opaque IDs.
- Present creation values and changed before/after values for meaningful
  metadata and structured recipe content. Format values for people; never show
  raw JSON or internal account, record, actor, public-link, or association IDs.
- Keep the viewer owner-only and available only while its parent is active.
  Existing Row-Level Security (RLS) remains the data boundary. Public routes
  continue to omit all history.
- Include empty and read-error behavior, accessible navigation back to the
  parent, and responsive layout consistent with Recipe Box's detail and Trash
  screens.

## Exclusions

- No version restore, history mutation, filtering, search, or catalog-history
  viewer.
- No new event types. Recipe display snapshots may be enriched with historical
  picklist labels and publication names; older events are not backfilled from
  the current catalog. History remains excluded from ZIP export/import and is
  deleted with recipe/publication purge as already specified.
- No display of full raw snapshots or authentication identity details.

## Existing patterns and boundaries

- Database triggers already capture recipe and publication create, edit, and
  lifecycle events. Recipe snapshots also include ingredients, steps,
  relationships, and tags; publication snapshots include tags. Recipe
  snapshots do not capture picklist assignment labels, and existing scalar
  picklist fields contain IDs. An additive `picklists` snapshot preserves the
  before values at the recipe update boundary and reads after values when the
  history event is written. It includes the assigned publication's historical
  name, not its internal ID.
- History tables grant authenticated read only. Recipe history RLS additionally
  requires an active owned recipe. Parent detail queries already reject
  trashed records. Purge functions delete the corresponding history.
- Use server-rendered pages and the authenticated Supabase server client; do
  not use service-role access. Query explicit history columns and pass only
  formatted display data to UI components.
- Do not backfill old picklist values from the current catalog: a renamed or
  deleted value could otherwise be presented as if it had been the historical
  value. Older snapshots may omit picklist diffs. Treat a null snapshot as an
  empty snapshot so legacy or partial events remain readable.
- Keep routine actions with their parent record. Place the History link after
  the detail content; the history page itself is an unframed, semantic ordered
  list with separators, not nested cards.

## User flow and state

1. From the bottom of an active recipe or publication detail page, the owner
  follows a labeled History link.
2. The server verifies that the parent is visible to the current owner, then
   loads its events in descending `(created_at, id)` order.
3. Each event shows an action label, timestamp, actor as `You` when present,
   and changed fields as labeled before/after values. Creation shows the
   initial meaningful values. Null snapshots are treated as empty; a value
   present only in the before snapshot renders as `Not set` afterward.
4. A Back to recipe/publication link returns to the parent. Browser Back also
   works; opening history never changes saved data.

Direct access to a missing, trashed, or foreign parent returns the existing
not-found state. Read failures use the route's standard server error handling;
they must not be presented as an empty history. A parent with no events shows a
compact `No history has been recorded.` state.

Recipe text and personal fields remain visible to the authenticated owner
because history is forensic and private. Redaction applies to technical
identifiers and fields that are not meaningful audit values, not to the
owner's historical recipe content. Public projections remain separately
allow-listed and must never include history.

## Responsive and accessibility behavior

- Use semantic headings, an ordered list of events, and definition lists for
  changed fields. The History link and Back link have visible text and normal
  keyboard focus; no action depends on hover.
- Keep the timestamp and event label readable at narrow widths; long values
  wrap without page-level horizontal scrolling. No special pointer or touch
  interaction is required.
- Run axe checks for both history page types. Browser tests verify keyboard
  navigation, visible focus, labels, contrast, and no overflow at desktop and
  Fold 6 widths.

## Acceptance criteria and automated coverage

- Recipe and publication create, update, trash, and restore events appear in
  newest-first order with stable ordering for equal timestamps; changed values
  show readable before/after details.
- New recipe snapshots retain single- and multi-select labels in before/after
  state, including correct values when multiple recipes are saved in one
  transaction.
- Structured ingredient, instruction, relationship, and tag changes display
  meaningful text without raw JSON or technical IDs.
- Owners can read their active record history; another account cannot retrieve
  it. Missing, trashed, and foreign parents do not render a history page.
- Public recipe pages and public projections contain no history or snapshot
  content.
- Existing purge acceptance continues to prove recipe/publication history is
  removed with its parent; exports continue excluding history.
- Browser tests cover links, their placement at the bottom of both detail
  pages, list content, empty/error handling, keyboard, visible focus, labels,
  axe, responsive wrapping, and no horizontal overflow.
- Unit tests cover event labels, changed-field projection, value formatting,
  null before and after snapshots, creation snapshots, and identifier
  redaction. Database tests cover snapshot enrichment, batch isolation, and
  the record/time indexes.

## Assumptions and decisions

- History is opened from active detail pages; trashed records remain
  unavailable, matching the existing recipe-history RLS contract.
- Event history is not paginated in this slice. If real account history grows
  enough to make full record-scoped reads costly, pagination can be added
  without changing event semantics.
- No external interaction research is required: the established detail action
  rows, semantic list patterns, and Trash density resolve the display choices.
- Slice 23 does not broaden from recipe/publication records into catalog audit
  screens; those events remain stored and owner-scoped but are not navigable
  on these pages.
