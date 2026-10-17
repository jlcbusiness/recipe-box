# Slice 21: Import

## References

- [Delivery roadmap](../delivery-roadmap.md), Slice 21 and its Mandatory Slice Preparation and Standing Rules
- [First-draft specification](../first-draft-spec.md), Import, Export, Lifecycle, and History
- [Comprehensive reference, § 11: Import, Export, and Backup Bundles](../comprehensive-reference.md#11-import-export-and-backup-bundles)
- [Comprehensive reference, § 12: Change History and Forensic Audit](../comprehensive-reference.md#12-change-history-and-forensic-audit)
- [Data model](../data-model.md), Ownership, Relationship Rules, Configuration Boundaries, and Required Future Detail
- [Design philosophy](../design-philosophy.md), Information Hierarchy and Interaction
- [Visual design guide](../visual-design.md), Data Management and Export (Slice 20), desktop, mobile, and accessibility
- [Decision log](../decision-log.md), import conflict, backup, ID, and history decisions
- [Slice 20: Export](20-export.md)
- [Portable bundle format](../import-export-format.md)
- Installed Next.js 16 Route Handler guide: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- [fflate API](https://github.com/101arrowz/fflate)
- [Supabase Storage upload](https://supabase.com/docs/reference/javascript/storage-from-upload)
- [Supabase Storage download](https://supabase.com/docs/reference/javascript/storage-from-download)

## Outcome

A signed-in owner can import a valid database ZIP into their account. Before
commit, the app shows detected matches and requires a choice for each
conflicting recipe or publication: Keep existing, Create duplicate, or
Replace. Validation and every selected write complete without silently
discarding the incoming graph or partially changing account records.

## Implementation status

Slice 21A is complete. The implementation streams and validates v1 ZIP
bundles, provides an owner-scoped signed upload grant and read-only preview,
plans database conflicts, catalog reuse, ID remapping, and privacy handling,
and exposes an authenticated commit route backed by a service-role-only
transactional database function. The Settings workflow supports preview,
explicit conflict choices, stale-preview recovery, cancellation, and archive
cleanup. Before commit, the route re-reads the archive, stages both image
variants under destination IDs, verifies WebP content and declared metadata,
and removes or queues staged objects if the transaction fails.

The database function locks and checks matched roots, uses the existing
versioned save and lifecycle routines, preserves planned ingredient-row IDs for
structured mentions, and commits preferences, explorer state, and ready media
in the same transaction. Trashed roots retain lifecycle history. Replacing a
publication with a trashed one is rejected when doing so would affect an active
recipe outside the imported graph.

The complete Slice 21A gate passes. Eight isolated Playwright runs on Chromium
and Fold 6 cover valid and invalid archives, progress and error recovery,
accessible preview, all conflict choices, ambiguous target selection,
cancellation without destination writes, keyboard operation and focus
restoration, stale-version refresh, successful import, and the transactional
API acceptance cases. The unit suite passes 244 tests; TypeScript, Biome,
Markdown lint, and `git diff --check` pass. Biome reports 53 non-blocking CSS
specificity warnings. The isolated stack uses
`/tmp/recipe-box-import-acceptance`; the active local database was not reset.
Slice 21B is complete. Publication and recipe scoped bundles reuse the
validated archive, preview, planner, media, and transactional commit path.
Import publication is available in the Library; Import recipe is available on
publication detail. The workflows are source-independent and derive ownership
from the authenticated destination account. Scoped browser acceptance passes
on Chromium and Fold 6, including conflicts, cancellation, stale-preview
recovery, navigation, accessibility, responsive layout, and real Storage media
staging and cleanup. See [Slice 21B brief](21b-scoped-import.md) for detailed
relationship behavior and verification evidence.

## Scope and dependencies

- Import schema version 1 bundles produced by Slice 20, including bundles made
  before Slice 22 adds public-link identity.
- Support database-scope bundles, including trashed records, product
  preferences, explorer state, and ready media.
- Reuse the existing recipe/publication detail and Settings workflows; only
  Settings receives an Import database action in this slice.
- Include both ready WebP variants for each imported media asset. Pending
  uploads, history, search documents, storage paths, identities, and temporary
  export records remain excluded.
- Do not import URLs, text, standalone images, OCR, history, scoped bundles, or
  unsupported future bundle versions. Slice 21B adds publication and recipe
  scope entry points using this import engine. Slice 22 owns future public-link
  fields and must keep v1 import compatibility.
- Preserve existing export behavior, the v1 on-disk contract, owner RLS, and
  current recipe/publication save and lifecycle APIs.

## Matching and conflict choices

- Match publications by normalized publication type and name. Database and
  publication imports match recipes within their resolved publication. Recipe-
  scoped imports match by normalized name across active destination
  publications so a changed source publication does not hide an existing
  recipe.
- Normalize match keys with Unicode NFKC normalization, trimming, and
  case-insensitive comparison. Do not use source IDs or content hashes as
  evidence of identity. If a key has multiple local candidates, require an
  explicit target selection; never choose one arbitrarily.
- Resolve catalog references (ingredients, picklist values, and tags) against
  the destination account by their category and normalized name. Reuse a
  unique local match; retain the local definition on collision and list that
  reuse in the preview. Add unmatched values with new IDs. A conflicting
  trusted density keeps the local density and is called out before commit.
- Keep existing skips the selected incoming root and all dependent rows owned
  by that root. Recipe-scoped conflicts call this choice Ignore. Create
  duplicate adds the `(Imported)` suffix to the root name with a separating
  space and imports its graph with new destination IDs. Replace keeps the
  matched root ID and replaces its imported graph in the same transaction; a
  recipe replacement also keeps its current destination publication.
- For a recipe-scoped import, resolve source publication metadata
  automatically. Reuse one active normalized match, create a missing source
  publication, and map Recipe Tin to the destination owner's collection without
  importing a collection record. New and duplicate recipes default to the
  source publication and can be assigned to another active destination
  publication. For a database import, publications and recipes are independently
  matched and resolved. Unmatched local recipes are not deleted when a
  publication is replaced.
- Allocate fresh destination IDs for newly created records and graph children.
  Preserve matched recipe/publication root IDs on Replace. Rewrite every
  included foreign key through the source-to-destination map. An out-of-scope
  recipe link reconnects only to one unique active local match; otherwise
  retain its display text and clear the link.
- Database import applies the bundle's listed product preferences and explorer
  state after the owner reviews the preview. Recipe privacy is preserved;
  public-link IDs are never imported or reused.

## Data, security, and failure boundaries

- Authenticate with server-verified `auth.getUser()` before issuing an upload
  token or reading bundle data. Derive the destination account from that user;
  ignore all incoming owner and actor IDs.
- Upload the ZIP directly from the browser to the existing private bundle
  Storage bucket through a one-use signed upload path under the authenticated
  account's random `imports/` namespace. Do not send ZIP bytes through a Next.js
  request body. Keep the compressed archive within the bucket's configured
  limit; enforce the format's 64 MiB JSON and 1 GiB aggregate uncompressed
  image limits during parsing.
- Before preview, validate the archive namespace, entry uniqueness, exact
  manifest file list, UTF-8 JSON, format and schema versions, scope agreement,
  byte lengths, SHA-256 digests, expected image variants, record allow-lists,
  and all internal references. Reject malformed, unsupported, incomplete,
  oversized, or checksum-invalid archives before creating destination records.
- Apply all record changes through one owner-derived, service-role-only
  database function and one transaction. It revalidates owner-scoped mappings,
  writes versioned records and history, and rolls back on any constraint,
  concurrency, or validation error. Do not accept caller-supplied account IDs.
- Stage imported media at random owner-scoped paths before the database
  transaction. Only after all images are uploaded and verified may the database
  transaction create ready media rows. On database failure, remove staged
  objects; queue failed removals through the existing media deletion queue.
  Temporary ZIPs are deleted after use or queued for the existing delayed
  bundle cleanup worker. A cleanup failure is reported as retryable and never
  reported as a successful import.
- A failed validation or database transaction leaves all account records and
  history unchanged. A failed Storage upload leaves no ready media rows. If
  cleanup cannot complete, retain a narrowly scoped cleanup record and report
  the cleanup state without exposing object paths.
- Serialize concurrent changes by locking matched roots and checking the
  previewed versions at commit. A changed or unavailable root invalidates the
  preview and requires a fresh preview; never overwrite a newer edit.
- Import writes append-only creation/update history through existing triggers.
  History itself is not imported. Replace produces one auditable root update
  rather than replaying source history.
- After Slice 22, a v1 import preserves `is_private` and relies on a new
  destination-generated public-link identity. Missing privacy fields never
  make a record public; never copy source public URLs or identity.

## User flow and interaction

- Settings adds an Import database action in the existing unframed Data
  management section. Publication and recipe detail import actions are
  deferred to Slice 21B. The action accepts one `.zip` file and opens the
  accessible import workflow.
- Selecting a ZIP starts upload and comparison automatically. Upload and
  validation show progress and disable only the active import action. The
  compact file row shows the archive name and record/media counts together;
  private/public recipe counts and an `Import preview` heading are omitted.
  Cancel before commit abandons the import and cleans up its temporary objects.
- A valid bundle preview shows scope, record/media counts, matched records,
  ambiguous matches, catalog reuse, and any existing records that Replace will
  update. Each conflict requires a deliberate choice; no destructive default
  is preselected. Database and publication imports offer Replace, Duplicate,
  and Ignore for recipe conflicts; recipe-scoped conflicts offer Replace or
  Duplicate only. New and duplicate recipes can select a destination
  publication. The final Import action commits all choices together. Cancel
  returns without changing records.
- Validation errors identify the actionable problem without exposing server
  paths or database details. A commit failure keeps the user's choices and
  allows retry after refreshing stale matches. A successful commit announces
  completion and navigates to the imported root for scoped import; database
  import stays in Settings.
- Use the Recipe Box visual guide: compact labeled controls, light paper/ink
  surfaces, clear green/tomato meanings, restrained borders, and no new card
  grid. Keep the preview readable with long names and large conflict sets.
- The workflow is keyboard-operable from file selection through all decisions
  and commit. Provide a visible focus indicator, descriptive labels, live
  progress/status and error announcements, focus restoration on cancel, and
  contrast independent of color. On mobile, controls remain within the
  viewport, actions have at least 48px hit areas, and no page-level horizontal
  overflow occurs. Pointer and touch use the same staged behavior.

## Acceptance criteria and automated tests

- **Bundle rules:** Unit tests accept valid v1 database/publication/recipe
  bundles and reject invalid ZIP paths, duplicate/missing/unlisted entries,
  mismatched scopes or versions, unknown fields, unsupported versions, invalid
  UTF-8/JSON, oversized data/media, malformed references, and missing image
  variants. Verify exact byte counts and SHA-256 before preview.
- **Graph planning:** Unit tests cover normalized unique matching, ambiguous
  candidates, catalog reuse, privacy preservation, duplicate suffix, fresh ID
  allocation, FK rewrites, out-of-scope link fallback, all three conflict
  choices, scoped graph closure, and destination Recipe Tin mapping.
- **Database boundary:** Migration/API tests prove owner isolation, service-role
  restriction, atomic rollback, optimistic version checks, history events,
  replacement preservation of root identity, and no imported account/auth or
  public-link identity fields. Inject a failure late in the import and assert
  no destination rows or history remain.
- **Media and cleanup:** Tests prove both image variants are staged and mapped
  to new IDs, no ready rows exist before commit, Storage failure prevents the
  database call, DB failure cleans or queues every staged image, and ZIP
  cleanup handles success, failure, cancellation, and foreign-path rejection.
- **Browser workflow:** Chromium and Fold 6 tests cover the Settings entry
  point, valid and invalid database bundles, conflict resolution for all
  choices, ambiguous target selection, cancel before commit, retry after stale
  preview, successful import, progress/error recovery, keyboard-only
  operation, visible focus, accessible labels/status, axe, and responsive
  overflow at relevant layout boundaries.
- Run focused unit and API tests first, then Chromium and Fold 6 acceptance,
  TypeScript, Biome, Markdown lint, and `git diff --check`. Reset only the
  dedicated `/tmp/recipe-box-import-acceptance` Supabase project when its test
  setup requires it. Never reset the active local stack or start a competing
  dev server without explicit authorization.

## Assumptions and deferred decisions

- The accepted conflict policy is the recommendation confirmed before this
  brief: match by normalized type/name or recipe name within the resolved
  publication; replace the matched root and imported graph transactionally;
  keep existing skips that incoming graph; duplicate remaps IDs and appends
  the `(Imported)` suffix with a separating space.
- Slice 21 is split into 21A database import and 21B publication/recipe scoped
  imports. Slice 21A delivers the shared validated and transactional engine;
  Slice 21B adds scoped import workflows without changing that contract.
- Public-link identity does not exist in v1 and remains a Slice 22 concern.
- Unknown future schema versions are rejected; compatibility for any later
  version is defined by the slice that adds it.
- Third-party interaction research is not needed for this workflow: the
  existing export action and staged Settings interactions establish local
  precedents, and the accepted user decision settles the consequential
  conflict behavior.

The automated acceptance list above is the completion gate for this slice.
