# DLC 19: History bundle support

This brief considers forensic history portability for the versioned ZIP formats
from Slices 20 and 21. It depends on the history model in DLC 18.

## Outcome

A person can choose to include history in an export and can import it without
forging current-account identity, bypassing ownership, or overwriting existing
audit events.

## Scope

- Define a versioned, allow-listed history bundle representation.
- Preserve source event identity separately from destination identity.
- Validate checksums, ownership references, size, and schema before import.
- Resolve collisions deterministically and report skipped or transformed data.
- Keep history export opt-in if its size or privacy implications require it.

## Decisions before implementation

- Decide whether imported events are immutable archive records or become
  searchable native history.
- Define provenance fields and how to prevent imported events from appearing
  as locally authored events.
- Review bundle size limits, privacy risks, and forward compatibility.

## Acceptance

- Round-trip tests verify event integrity and provenance across accounts.
- Invalid checksums, foreign identifiers, oversized archives, and malformed
  records fail without partial import.
- Import does not bypass normal recipe conflict planning or RLS.
- Bundle, migration, security, history, browser, and failure-cleanup tests pass.

## References

- [Export](../20-export.md)
- [Import](../21-import.md)
- [History viewer](../23-history-viewer.md)
- [Portable bundle format](../../import-export-format.md)
