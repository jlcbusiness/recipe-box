# DLC 24: Account content reset

## Review status

Approved contract. Implementation is complete locally; hosted Google-provider
and physical-device acceptance remain open.

## Outcome

An authenticated account holder can reset all Recipe Box content owned by
their account while preserving the Auth identity and account security/role
fields. Relational deletion is atomic; managed Storage cleanup is durable and
its pending state is reported truthfully.

## Scope

- Reset active and trashed recipes and their dependent data, publications,
  user-created tags and catalogs, recipe and publication history, explorer
  state, and account preferences.
- Return the account to a usable fresh-account baseline: retain or recreate
  the permanent empty Recipe Tin and restore the shipped picklist defaults.
  Remove user-created catalog values, ingredient data, nutrition profiles,
  tags, and assignments.
- Preserve the Auth user, account identity, sign-in method, and server-managed
  admin/owner role fields. This is not the existing administrative account
  deletion flow.
- Revoke each recipe's public link in the reset transaction. Retain
  non-content tombstones for old public IDs so a stale link cannot resolve to
  new content; public requests continue to receive the existing unavailable
  response for purged IDs.
- Clear the current browser's private offline snapshots. A durable account
  content generation invalidates cached snapshots on other devices the next
  time they reconnect. A disconnected device may retain its existing local
  snapshot until it reconnects; the confirmation must state this limitation.
- Delete app-managed media and export archive objects using durable cleanup
  queues. Keep queue records until object removal succeeds. Database content
  becomes unavailable immediately, but the operation is incomplete while
  external object cleanup remains pending.

## Exclusions

- Do not delete the Auth user, sign-in identity, account record, or security
  and role fields.
- Do not reset Supabase or affect another account or a household. Household
  support remains deferred.
- The app cannot delete ZIP files already downloaded to a person's device or
  immediately erase cached data from a device that is offline.

## Approved decisions

- Scope is all app-owned content while retaining authentication.
- Delete history with the content; history can contain private recipe and
  publication snapshots.
- Reset personal preferences to defaults.
- Require provider-specific fresh re-authentication and the typed phrase
  `RESET ALL CONTENT`. Verify the current password for email/password accounts;
  force a Google login for Google accounts and require the returned identity to
  match the signed-in account. Bind proof to a short-lived, single-use reset
  challenge.
- On other devices, invalidate private offline snapshots on their next
  authenticated connection. Do not claim immediate remote erasure while a
  device is disconnected.

Supabase's `auth.reauthenticate()` sends a nonce for Auth user updates; it is
not a generic proof for this database operation. Do not use it as a reset
authorization or treat an unverified OTP as recent authentication.

## User flow and failure behavior

- Place the action at the left of Settings' existing unframed Data management
  row, with Export database and Import database grouped and right-aligned.
  Allow these groups to wrap on narrow screens while keeping the transfer
  actions right-aligned; do not add a separate dashboard card.
- The warning lists the exact data categories removed, the preserved account
  fields, the effect on public links, the queued Storage cleanup, and the
  offline-device limitation.
- Cancel and Escape leave account data unchanged. The reset requires
  re-authentication, the exact phrase, and an explicit submit; a stale or
  replayed confirmation cannot initiate another reset.
- Derive the target account from the verified session. The client supplies no
  account ID. The database operation deletes relational content atomically,
  advances the offline content generation, retains the required baseline, and
  enqueues external objects before returning.
- After the database transaction, clear this browser's private offline
  snapshots. Do not show full success if local cache clearing fails or any
  managed Storage objects remain queued. Show the remaining cleanup state;
  explain that a daily cleanup job retries queued objects, and provide an
  authenticated status check so a person can confirm later whether cleanup
  succeeded. Do not imply the initial counts update automatically.
- Disable the destructive submit until the exact confirmation phrase is
  entered, while retaining server-side exact-phrase validation.
- If authorization, re-authentication, confirmation, or the database
  transaction fails, preserve content and show a recoverable error. A repeated
  request is safe and must not duplicate cleanup work.

## Data, security, and migration boundaries

- Inventory every account-owned table and Storage prefix before implementation;
  include derived search data and all recipe/publication dependencies.
- Keep account ownership derived from the verified Auth identity. Prove that a
  caller cannot reset another account, including when the caller is an admin.
- Preserve existing row-level security and public-data allow-lists. Reset must
  revoke public access before returning and must not expose reset status or
  private content to guests.
- Retain global public-ID tombstones and durable cleanup queue entries only as
  operational denial/retry metadata; neither may contain recipe payloads.
- Use a forward migration for the durable content-generation marker and any
  required RPC or queue changes. Never edit an applied migration.
- Use the selected provider-specific proof: password re-entry for
  email/password accounts and Google `prompt=login` with an identity match for
  Google accounts. Do not use the Supabase re-authentication OTP as generic
  proof for this operation.

## Acceptance criteria and automated coverage

- **Atomic reset and baseline:** database tests prove all in-scope rows and
  private history are removed, the Auth/account identity and roles survive,
  default picklists are restored, the Recipe Tin remains unique, empty, and
  Library-searchable, preferences return to defaults, and search results
  contain no prior content.
- **Authorization:** isolated database/API tests prove the reset is
  owner-derived, cross-account attempts fail without changes, an admin cannot
  reset another account through this action, and insufficient or stale
  re-authentication is rejected.
- **Confirmation and retry:** browser tests cover warning contents, exact
  phrase validation, re-authentication, cancel/Escape, keyboard operation,
  visible focus, accessible status, stale-form rejection, double submission,
  and idempotent retry.
- **Public access:** tests prove all former links stop exposing content in the
  reset transaction, tombstoned IDs cannot be reused, and no title, media, or
  owner information leaks through guest responses.
- **External cleanup:** tests prove media and export objects are queued
  transactionally, cleanup success removes them, injected Storage failures
  remain durably retryable, and pending cleanup is never reported as complete.
- **Offline state:** tests prove the current browser cache is cleared and
  another device's old snapshot is invalidated on its next authenticated
  connection. The confirmation and completion UI state the disconnected-device
  limitation.
- **Responsive/accessibility:** Settings browser tests cover representative
  desktop and mobile widths, keyboard and screen-reader semantics, focus,
  labels, contrast, dialog dismissal, progress, and recoverable errors.
  Data-management tests verify the wipe action stays left of the
  right-aligned transfer actions and the exact-phrase submit remains disabled
  until the phrase matches.

## Assumptions and implementation checks

- The permanent Recipe Tin and shipped picklist defaults are required system
  baselines, not user content to leave missing after reset.
- Already-downloaded exports and offline data on disconnected devices are
  outside the app's immediate deletion control; this limitation is explicit
  before confirmation.
- Inventory dependent rows, signed-media access, export cleanup, write races,
  and Auth re-authentication behavior against the installed implementation and
  current Supabase documentation before choosing the migration and RPC design.

## Local verification

- The local pgTAP acceptance test passes all 29 assertions, including owner
  isolation, preserved identity and roles, reset defaults, durable cleanup
  queues, tombstones, dependent recipe rows, nutrition, density, and tag
  assignments.
- The reset browser tests pass on Chromium and Fold 6, covering the warning,
  exact confirmation phrase, email/password re-authentication, cancellation,
  cache clearing, accessibility, desktop/mobile dialog bounds, and preserving
  callback-provided re-authentication state while the URL is cleaned up. The
  dialog also distinguishes a one-time pending-cleanup snapshot from the daily
  retry schedule and offers a status check for later confirmation.
- Focused export and offline-cache unit tests, TypeScript, and targeted Biome
  checks pass. The local migration was applied without resetting local data.
- Google OAuth requires configured provider credentials and was not exercised
  end to end; callback-state retention is covered with a simulated return URL.
  Hosted Storage cleanup and physical-device behavior remain open.

## References

- [Delivery roadmap](../../delivery-roadmap.md), Mandatory Slice Preparation,
  Standing Rules, and Completion Rule
- [First-draft specification](../../first-draft-spec.md)
- [Comprehensive reference](../../comprehensive-reference.md), especially
  sections 6, 9, 10, 11, 12, and 13
- [Data model](../../data-model.md)
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide](../../visual-design.md), Data Management and Account
  menu sections
- [Decision log](../../decision-log.md)
- [Trash and restore](../8-trash-restore-and-print.md)
- [Export](../../20-export.md)
- [Public links](../../22-public-links-and-privacy.md)
- [History viewer](../../23-history-viewer.md)
- [Install and offline](../../24-install-and-offline.md)
- [DLC brainstorm](../../discussion/dlc.md)
- [Existing administrative account deletion](../../../../src/app/admin/actions.ts)
- [Supabase JavaScript reauthenticate reference](https://supabase.com/docs/reference/javascript/auth-reauthenticate)
- [Supabase JavaScript OAuth sign-in reference](https://supabase.com/docs/reference/javascript/auth-signinwithoauth)
- [Google OAuth authentication URI parameters](https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters)
