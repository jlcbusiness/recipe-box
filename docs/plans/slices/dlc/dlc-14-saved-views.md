# DLC 14: Saved views

This brief makes explorer queries reusable. It depends on the versioned query
model and validation contract in DLC 13.

## Outcome

A person can save a named explorer view, return to it, duplicate it, and remove
it without losing publication scope or personal display preferences.

## Scope

- Create, rename, duplicate, and delete named views.
- Persist query, explorer type, and validated publication scope.
- Add predictable navigation or selection controls without crowding the
  Library and Find interfaces.
- Define what happens when a view's publication is deleted, hidden, or no
  longer accessible.
- Keep saved view state distinct from last-used state and column preferences.

## Decisions before implementation

- Decide whether saved views are account-private or shareable. Do not include
  collaboration absent an explicit security decision.
- Define limits for view count, name length, and query size.
- Decide whether duplication copies only query state or also presentation.

## Acceptance

- Saved views restore exact filters, sort, direction, and validated scope.
- Deleting a view never deletes recipes or publications.
- Owner isolation, stale-scope recovery, import/export policy, and migration
  behavior are covered by database and browser tests.
- Keyboard, mobile, empty, conflict, and accessibility states are tested.

## References

- [Explorer state](../18-explorer-state.md)
- [Explorer preferences](../19-advanced-queries-and-saved-views.md)
- [Advanced query groups](dlc-13-advanced-query-groups.md)
