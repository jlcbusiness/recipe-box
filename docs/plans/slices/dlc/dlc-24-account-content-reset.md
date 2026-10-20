# DLC 24: Account content reset

This brief interprets the brainstorm's “nuke all” button as a possible
owner-initiated content reset. It is not the existing guarded account-deletion
workflow, and its scope must be approved before implementation.

## Outcome

An authorized person can deliberately remove the agreed account-owned content
in one auditable operation while retaining their authentication account and
receiving a truthful result for asynchronous media cleanup.

## Scope

- Inventory all account-owned records and dependent data before defining the
  reset boundary.
- Include recipes, publications, tags, picklists, ingredient catalog entries,
  densities, history, public-link identifiers, exports, and media only as
  explicitly approved.
- Require an explicit warning and confirmation proportional to the irreversible
  consequences; protect against accidental or repeated submission.
- Use transactional deletion where possible and durable cleanup queues for
  external objects.
- Revoke public links immediately and prevent stale offline data from
  reappearing after the reset.
- Preserve the account, authentication identity, and any settings explicitly
  declared outside the reset boundary.

## Decisions before implementation

- Decide whether the operation clears recipe content, all user-created data, or
  deletes the authentication account. These are distinct actions.
- Decide whether history is deleted or retained as a compliance/audit record.
- Define authorization, recent-authentication requirements, confirmation
  wording, retries, and partial-failure recovery.
- If households exist, define whether one person can reset shared content or
  only leave the household; DLC 23 must resolve this first.

## Acceptance

- The confirmation names the exact data categories and cannot be triggered by a
  single accidental click or stale form submission.
- A successful reset leaves no accessible recipe, publication, private-media,
  public-link, or cached content within the approved boundary.
- Cleanup failures remain durably retryable and are reported as incomplete,
  never as a fully successful reset.
- Repeated requests are safe; authorization prevents cross-account or
  cross-household deletion.
- Database/RLS, public access, media cleanup, offline cache, audit, browser,
  and accessibility tests pass.

## References

- [Invites and admin](../2-invites-and-admin.md)
- [Trash and restore](../8-trash-restore-and-print.md)
- [Export](../20-export.md)
- [Public links](../22-public-links-and-privacy.md)
- [DLC brainstorm](../../discussion/dlc.md)
