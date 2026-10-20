# DLC 22: Configurable Trash retention

This brief makes the existing fixed Trash retention period configurable without
weakening restore, purge, or media-cleanup guarantees.

## Outcome

An authorized account owner can choose an approved retention period, and Trash
shows when each item is scheduled for permanent deletion.

## Scope

- Define allowed retention choices and the account or household scope.
- Apply the chosen policy consistently to recipes and publications.
- Update restore eligibility, scheduled purge selection, media cleanup, and
  public-link tombstones.
- Explain policy changes, including whether existing trashed records are
  grandfathered or rescheduled.
- Keep individual purge and Purge all explicit and independently available.

## Decisions before implementation

- Select permitted retention bounds after reviewing storage, privacy, and
  operational requirements.
- Decide whether policy changes apply retroactively.
- Verify scheduler cadence and idempotency against the shortest allowed period.

## Acceptance

- Database constraints prevent invalid retention values and callers cannot
  change another account's policy.
- Purge timing uses a deterministic boundary and remains safe under retries.
- Restore is denied only after the configured deadline; media cleanup and
  public-link responses remain consistent.
- Migration, RLS, scheduler, lifecycle, browser, and accessibility tests pass.

## References

- [Trash and restore](../8-trash-restore-and-print.md)
- [Publication lifecycle](../10b-publication-deletion-and-restore.md)
- [Public links](../22-public-links-and-privacy.md)
