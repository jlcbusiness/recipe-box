# DLC 23: Households and account roles

This brief explores multi-person ownership and collaboration beyond the current
single-owner account model. It requires a security and data-ownership design
before implementation.

## Outcome

People in a household can collaborate on an explicitly selected set of shared
content with clear roles, accountable ownership, and a dedicated way to revoke
pending invitations.

## Scope

- Define household identity separately from individual authentication accounts.
- Define membership, invitation lifecycle, roles, role changes, and last-owner
  protection.
- Add explicit invitation revocation and safe handling of accepted or expired
  invitations.
- Define ownership and authorization for recipes, publications, picklists,
  tags, media, history, exports, public links, and offline caches.
- Preserve personal settings and private data unless sharing is explicit.

## Decisions before implementation

- Determine whether shared content belongs to a household or an individual;
  specify transfer and account-removal behavior.
- Define least-privilege roles and which actions are owner-only.
- Threat-model invitation abuse, member removal, public links, storage paths,
  history visibility, and stale offline data.
- Plan migration for existing single-owner accounts and rollback before schema
  changes are approved.

## Acceptance

- Every read and write is authorized by household membership and role at the
  database boundary, not only by UI checks.
- Removing a member revokes access to routes, storage, public-management
  actions, and future sync without deleting other members' data.
- Pending invitations can be revoked with idempotent, tested cleanup.
- Database/RLS, invitation, migration, media, history, export/import, public,
  and multi-account browser tests pass.

## References

- [Invites and admin](../2-invites-and-admin.md)
- [Account administration](../../../src/app/admin/actions.ts)
- [DLC brainstorm](../../discussion/dlc.md)
