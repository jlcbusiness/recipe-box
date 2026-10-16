# Slice 20: Export

This slice adds owner-authorized ZIP exports for the full account, one
publication, or one recipe. It does not import or modify source records.

## References

- [Delivery roadmap](../delivery-roadmap.md), Slice 20
- [First-draft specification](../first-draft-spec.md), Import, Export, Lifecycle, and History
- [Comprehensive reference, § 11: Import, Export, and Backup Bundles](../comprehensive-reference.md#11-import-export-and-backup-bundles)
- [Comprehensive reference, § 9.4: Secure Image Delivery](../comprehensive-reference.md#94-secure-image-delivery)
- [Comprehensive reference, § 12: Change History and Forensic Audit](../comprehensive-reference.md#12-change-history-and-forensic-audit)
- [Data model](../data-model.md), Ownership, Relationship Rules, and Configuration Boundaries
- [Design philosophy](../design-philosophy.md), Information Hierarchy and Interaction
- [Visual design guide](../visual-design.md), Account menu and Settings (Slice 14A)
- [Decision log](../decision-log.md), backup, Settings, and test-first decisions
- [Slice 12: Images](12-images.md), private storage and ready asset lifecycle
- [Portable bundle format](../import-export-format.md)
- Installed Next.js 16 Route Handler guide: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- [Vercel Function limits](https://vercel.com/docs/functions/limitations)
- [Vercel streaming](https://vercel.com/docs/functions/streaming)
- [Supabase Storage upload](https://supabase.com/docs/reference/javascript/storage-from-upload)
- [Supabase Storage download](https://supabase.com/docs/reference/javascript/storage-from-download)
- [Archiver API](https://www.archiverjs.com/docs/archiver/)

## Outcome

A signed-in owner can download a database, publication, or recipe ZIP. The ZIP
contains normalized relational JSON, a versioned manifest, SHA-256 checksums,
and the selected records' ready image assets. Settings shows the last completed
full-database archive time and reminds the owner when it is more than 30 days
old.

## Requirements and scope

- Add one owner-authorized export boundary with an allow-listed scope: database,
  publication, or recipe. Database exports include all owned records, including
  trashed-but-restorable records. Publication and recipe exports are available
  only for owned active records and include their dependent records and ready
  images.
- Export full account content and product preferences, but never credentials,
  auth identities, admin/sign-in-method fields, forensic history, derived search
  documents, pending uploads, cleanup jobs, or another account's data.
- Publication exports contain the selected publication, its recipes, their
  dependent ingredients, picklist values, tags, densities, and relationship
  rows, plus the publication cover and recipe photos. Recipe exports contain
  the selected recipe graph and photos plus basic metadata for its primary
  publication. Cross-scope recipe links retain their source IDs and display
  text; Slice 21 defines how unresolved links are handled during import.
- Preserve stable domain record IDs and all current recipe fields, including
  `is_private`. Omit source `account_id` and actor/auth-user IDs; import assigns
  ownership from the authenticated destination account. Slice 22 will version
  any future public-link identity fields and must support this v1 format.
- Include both ready full and thumbnail WebP objects. Never expose signed media
  URLs or the private Storage bucket. A missing or unreadable object fails the
  export; it cannot silently produce a partial backup.
- Keep imports, conflict resolution, history export, deletion of user records,
  public media access, and changes to recipe/publication data out of scope.

## Format and large-export boundaries

- The portable bundle format is version 1 and is defined in
  [import-export-format.md](../import-export-format.md). It uses fixed internal
  paths, a manifest file list, UTC creation time, app version, scope, byte
  lengths, and SHA-256 checksums for `data.json` and every image file.
- Cap included uncompressed media at 1 GiB, matching the existing per-account
  processed-media quota. Cap normalized `data.json` at 64 MiB. Reject larger
  bundles before reporting success, with a recoverable accessible error and no
  update to the full-export timestamp.
- Do not return ZIP bytes from the Next.js function: current Vercel Function
  request and response bodies are limited to 4.5 MiB. Build the ZIP with a
  Node.js streaming archive, upload it to a random owner-prefixed path in the
  existing private Storage bucket, and return a short-lived signed download
  URL. The app response carries only a small JSON result.
- Queue the temporary ZIP for deletion no sooner than 24 hours after creation;
  the existing daily media cleanup handles the object. If queuing cleanup fails,
  remove the object before returning an error. The signed download URL expires
  after 15 minutes. Temporary ZIPs are not included in media quota accounting.
- Record `last_database_export_at` only after the database ZIP has been
  finalized, uploaded, queued for cleanup, and a signed URL has been created.
  Publication and recipe exports do not change this date. A browser download
  interrupted after URL issuance cannot be detected; the timestamp means a
  complete, verified archive is available for download, not proof that the
  browser saved it.

## Security and failure boundaries

- Authenticate with server-verified `auth.getUser()` before any export work.
  Resolve data through one owner-derived, read-only database snapshot; never
  accept an account ID from the client. Validate UUIDs and scope IDs, and return
  the same unavailable response for missing or foreign-owned records.
- Query data without the Data API's default 1,000-row truncation. The snapshot
  is consistent for the request, owner-scoped, and returns only the fixed table
  allow-list. Storage access uses the server-only service-role client after the
  verified owner and asset paths have been established.
- Buffer at most one image at a time, verify its observed byte count against
  metadata and its SHA-256 before adding it, and apply backpressure while
  streaming ZIP bytes to Storage. On any query, checksum, archive, upload, or
  cleanup-queue error, delete or queue the partial ZIP, return an error, and do
  not update the backup timestamp.
- Use no-store responses and a random export path that contains no record
  titles. Signed URLs are never persisted in the database or logs.

## User flow and UI contract

- Settings adds a full-width, unframed `Data management` section after the
  existing working Settings domains. It shows the last full export date or
  `No database export yet`, and an explicit reminder when there is no export or
  the saved date is more than 30 days old. A labeled `Export database` action
  starts the download.
- Publication detail exposes `Export` to the left of `Edit`; Library cards do
  not expose publication export actions. Recipe detail exposes `Export recipe`
  beside Print and Edit. On mobile, publication Export and Edit are icon
  buttons sized 40px square, and Add Recipe is a 40px icon in the compact
  toolbar. Recipe detail actions remain 36px square to match Print and Edit.
  These scoped actions do not change the database-export reminder.
- Download filenames identify both the scope and exported item, for example
  `Recipe Box - Database Export.zip`, `<publication> - Publication Export.zip`,
  and `<recipe> - Recipe Export.zip`.
- Starting an export is immediate; there is no draft or confirmation. While it
  is preparing, disable only that action and announce progress through a live
  status below the button without shifting the other actions or following page
  content. Feedback is out of document flow. On success, start the signed
  download and show completion status. On failure, keep the page and actions
  available, announce a useful error, and allow retry. There is no cancel
  action; navigation aborts the request and the server cleans any partial
  object.
- Keep Settings unframed and responsive, with explicit text action labels,
  visible focus, semantic labels/status, and a 48px mobile action hit area.
  Publication and recipe actions use the compact dimensions above and visible
  keyboard focus. Preserve existing navigation and Settings sections. No new
  modal, card grid, hover-only control, or third-party imagery.

## Test-first acceptance

Write focused automated tests before production code:

- Unit tests cover bundle scope closure, portable account-field allow-list,
  unsupported/oversized bundles, ZIP entry names, asset byte counts, and
  SHA-256 generation/verification.
- Unit and API tests prove snapshot completeness beyond 1,000 rows, owner
  isolation, scope validation, active-only scoped exports, inclusion of
  trashed records in database exports, exclusion of history/pending assets,
  and preservation of the existing timestamp on each failure boundary.
- Export integration tests inspect the ZIP after downloading its signed URL; verify
  manifest and `data.json`, every listed checksum, both image variants, and
  cleanup queuing/expiry. A missing asset, failed ZIP upload, failed cleanup
  enqueue, invalid scope, unauthenticated request, or foreign ID must never
  report success. Server failure-injection tests verify failed uploads and
  failed cleanup enqueue remove the archive, while signed-URL or timestamp
  failures leave the already-queued archive for cleanup. Route tests verify
  helper failures do not advance the full-export timestamp. Cleanup-worker
  tests cover due-object deletion, retry tracking after Storage failure, and
  rejection of paths outside the queued account's export directory.
- Browser tests cover all three actions, the Settings date and 30-day reminder,
  progress/success/error and retry states, keyboard activation and visible focus,
  touch activation for all three scopes on Fold 6, navigation-away abort with
  server-side partial-archive cleanup, labels, axe, desktop/mobile layout, the
  Settings action's 48px mobile target, compact scoped-action dimensions, stable
  action/content positions during feedback, and no horizontal overflow. Test
  just below, at, and above any layout reflow threshold.
- Verify the future compatibility contract in the portable-format tests: v1
  retains current `is_private`, contains no future public-link identifier, and
  can be recognized after Slice 22 adds a later schema version. Slice 22 must
  add its importer-compatibility test when its fields are defined.

Run focused unit and API tests first, then Chromium and Fold 6 acceptance,
TypeScript, Biome, Markdown lint, and `git diff --check`. Do not use
`npm run dev:local` or reset local Supabase. Use the existing server if running;
otherwise start only a free-port local server for UI verification.

## Completion criteria

- All three scopes produce valid, complete, owner-scoped ZIPs with versioned
  metadata, verified checksums, correct relational closure, and ready images.
- Oversized or failed exports remain retryable and never advance the recorded
  full-database backup date.
- Temporary archives are private, short-lived, and cleanup-queued; no ZIP body
  is sent through the Vercel Function response.
- Settings communicates the last full export and 30-day reminder accessibly;
  all three export flows work by keyboard, pointer, and touch.
- Automated acceptance passes locally, and the portable format, comprehensive
  reference, visual guide, decision log, and roadmap describe verified behavior.
