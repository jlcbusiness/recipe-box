# DLC 20: Expanded offline use

This brief proposes expanding Slice 24's bounded read-only recipe cache. Offline
writes are a high-risk change and require a technical proof before product
implementation is approved.

## Outcome

A person can complete a narrowly defined recipe workflow offline and reconcile
it safely after reconnecting, without exposing private data or losing edits.

## Scope

- Begin with a proof of local persistence, encryption/platform guarantees,
  schema versioning, quota behavior, and crash recovery.
- Define offline-capable routes and exact cached data before adding writes.
- If approved, stage offline editing, queued writes, conflict handling, and
  background or foreground synchronization separately.
- Keep sign-out and account switching capable of removing all private cached
  data, including pending writes.
- Do not promise offline publication details, history, public routes, or private
  photos without an explicit cache and authorization design.

## Decisions before implementation

- Identify the threat model for shared devices and browser storage.
- Choose a conflict strategy compatible with record-version checks and history.
- Define queue limits, retry rules, stale-cache behavior, and user-visible
  pending/conflict states.
- Stop after the proof if platform guarantees do not meet the security bar.

## Acceptance

- The proof demonstrates recovery across reload, browser restart, and interrupted
  sync without losing or duplicating writes.
- Offline data is account-scoped, bounded, and cleared on sign-out/account
  change according to policy.
- Conflicts never silently overwrite remote edits.
- Security, migration, browser lifecycle, RLS, accessibility, and recovery tests
  pass before expanding scope.

## References

- [Install and offline](../24-install-and-offline.md)
- [History viewer](../23-history-viewer.md)
