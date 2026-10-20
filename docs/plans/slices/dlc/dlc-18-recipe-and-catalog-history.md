# DLC 18: Recipe and catalog history

This brief expands the read-only recipe/publication history viewer from Slice 23
with restoration, search, and catalog history.

## Outcome

An owner can locate meaningful past changes and, where safe, restore an earlier
recipe or publication version without erasing the forensic record.

## Scope

- Define restorable fields and excluded lifecycle/security fields.
- Add a preview and explicit confirmation before restoring a snapshot.
- Search or filter history by date, event type, and supported fields.
- Add a browsable history view for ingredient and picklist catalogs.
- Record restoration as a new event; never rewrite or delete prior events.
- Respect owner isolation, active/trash lifecycle, and current version conflicts.

## Decisions before implementation

- Define restoration semantics for deleted or merged catalog values and
  relationships to current recipes.
- Decide whether restoration creates a new record version or a new entity.
- Bound search and retention behavior; history remains append-only.

## Acceptance

- A restore preview identifies all changed fields and conflicts before save.
- Restore uses optimistic concurrency and records a new forensic event.
- Foreign, purged, or inaccessible records cannot be restored or searched.
- Database, RLS, conflict, audit, catalog, browser, and accessibility tests pass.

## References

- [History viewer](../23-history-viewer.md)
- [Catalog management](../14c-ingredient-catalog-management.md)
