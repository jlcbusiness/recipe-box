# DLC 13: Advanced query groups

This brief extends the Slice 17–19 explorer filters into a composable query
model. It is the foundation for reusable saved views in DLC 14.

## Outcome

A person can build a query containing nested AND/OR groups, understand its
meaning, and save or restore a stable representation without changing current
filter behavior unexpectedly.

## Scope

- Define a versioned, validated query grammar for fields, operators, values,
  and nested groups.
- Provide a keyboard- and touch-accessible builder and a concise explanation
  of the effective query.
- Preserve current flat filters by mapping them to equivalent query groups.
- Define URL, last-used explorer-state, pagination, and serialization behavior.
- Reject unsupported fields/operators server-side and retain owner scoping.

## Decisions before implementation

- Limit maximum nesting, clause count, and serialized size.
- Decide whether queries are applied immediately or through an explicit Apply
  action, and how invalid drafts are shown.
- Verify indexes and query plans before accepting operators that cause scans.

## Acceptance

- Round-trip tests prove that supported queries serialize and execute
  equivalently, including empty and nested groups.
- Existing URL filters, pagination, and saved explorer state remain compatible.
- Invalid, foreign, oversized, and unsupported query input is safely rejected.
- Unit, database/RLS, browser, performance-boundary, and accessibility tests
  pass.

## References

- [Find recipes](../17-find-recipes.md)
- [Explorer state](../18-explorer-state.md)
- [Explorer preferences](../19-advanced-queries-and-saved-views.md)
