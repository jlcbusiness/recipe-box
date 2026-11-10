# DLC 31: Save Public Recipe Copies

**Status:** Complete; approved and implemented with DLC 30.

## References

- [DLC roadmap](README.md), Phase 7
- [DLC 30: Safe Public Recipe Publishing](dlc-30-safe-public-recipe-publishing.md)
- [First-draft specification](../../first-draft-spec.md), Sharing and Authentication
- [Comprehensive reference, § 6](../../comprehensive-reference.md#6-publications-magazine-handling-and-the-recipe-tin)
- [Comprehensive reference, § 9](../../comprehensive-reference.md#9-sharing-privacy-urls-and-image-delivery)
- [Comprehensive reference, § 11](../../comprehensive-reference.md#11-import-export-and-backup-bundles)
- [Data model](../../data-model.md), Ownership, Relationship Rules, and Required Future Detail
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide](../../visual-design.md), Public Recipe View and Data Management
- [Decision log](../../decision-log.md)
- [Slice 11: Source Links and Relationships](../11-source-links-and-relationships.md)
- [Slice 12: Images](../12-images.md)
- [Slice 21: Import](../21-import.md) and [Slice 21B: Scoped Import](../21b-scoped-import.md)

## Outcome

A signed-in person can save an active public recipe as an independent private
recipe in their Recipe Tin, including every field and photo exposed by the
public recipe. The saved recipe contains a titled URL reference to its source,
for example `jlcbusiness's Chicken Hot Pot Delight`. That source attribution is
read-only and cannot be removed while the saved recipe exists.

## Scope and dependencies

- Depends on DLC 30's private-by-default behavior, public username, publication
  disclosure, and explicit rule that publishing permits viewers to save the
  public data and photos.
- Add a **Save to Recipe Tin** action to the public recipe workflow only when
  the request has a server-verified authenticated User session. Visitors without
  a verified session do not see a save action and cannot submit copy data;
  public reading and print/download remain available to everyone.
- Load the source by its public ID on the server and verify it is still active
  and linkable at commit time. Derive the destination account from the
  authenticated session; never accept source User identity or destination account
  IDs from the browser.
- Create a new, private destination recipe with new recipe, ingredient,
  relationship, media, and public-link identities. Do not copy private source
  fields, source account data, signed URLs, or storage paths.
- Preserve the complete public projection: recipe details, ingredient sets
  and measurements, instructions and their public ingredient/photo references,
  times, equipment, public nutrition-per-serving data, pairings, references,
  public publication attribution, and public photos. Do not add data excluded
  by the public allow-list.
- Save the source as an `external_url` recipe reference whose display text is
  `{source username}'s {source recipe title}` and whose URL is the stable
  public recipe URL. This reference is protected in the editor and enforced at
  the database/commit boundary; exports and imports must preserve its protected
  status. Store its source public ID as protected identity metadata, separate
  from editable URL text, and permit multiple trashed copies while enforcing
  at most one active copy per destination account/source public ID. Deleting a
  copied recipe may delete its graph and attribution together.
- Extend the portable bundle format from schema version 9 to version 10 to
  preserve the protected reference identity. Database and scoped imports must
  retain existing protected attribution on replacement and restore it from
  valid exported data; ordinary external URL references remain editable.
- Place the copy in the destination account's reserved Recipe Tin. Preserve
  the source publication name/page as a separate reference rather than
  assigning a source account's publication record. The required protected
  username-and-recipe URL reference remains a distinct reference.
- Do not add public comments, collaborative editing, notifications to the
  source User,
  or automatic republication of a copy.

## Existing patterns and interaction

The public recipe reader is the closest source workflow; it already separates
guest controls from the private application shell and provides the public
projection. The Recipe Tin is the established destination for recipes without
an external primary publication. Import workflows provide prior art for
destination-owned graph creation, ID remapping, transaction boundaries, and
staged media cleanup. Reuse those patterns where they fit, but do not trust a
client-supplied bundle or signed source URL.

When a server-verified User session is present, **Save to Recipe Tin** starts
one server-side copy operation. Without a verified session, omit the save action
entirely; keep public reading and print/download controls available, and reject
direct copy requests. Place the Save icon beside the public output controls in
the header: Save, Download, and Print share the desktop top row in that order,
with Page settings below Print at the right edge. On mobile, Save is to the
left of the combined Print & Download icon, with Page settings below that menu.
Give the icon the accessible name and tooltip
**Save to Recipe Tin**. Keep the title and byline on the left, opposing the
action controls on the right in the same header row. Keep the Save icon in its
original grid position after success, showing a disabled saved indicator so
the remaining controls do not shift. Place success and recoverable error
feedback left of Page settings, right-aligned to that control with an 8px gap
and vertically centered on its icon. Keep feedback out of layout flow so it
neither adds a row nor shifts the header; do not constrain or overlap the title.
On narrow screens, keep compact visible success and failure labels while
retaining the full status and error announcements and saved-copy link for
assistive technology. Keep the saved-copy link underlined when idle so it is
clearly identifiable as a link. Let the header reflow rather than squeezing the
title.
Show progress without blocking public reading. On success, announce that the
private copy was saved and provide a link to it. If that source already has a
saved copy in the account, show a confirmation dialog stating that it is
already in the Recipe Tin and ask whether to open the saved copy or cancel.
**Open saved copy** navigates to it; **Cancel** leaves the User on the public
recipe. A matching copy in Trash is not an active saved copy: Save creates a
fresh private copy and leaves every trashed copy unchanged. Repeated clicks or
concurrent requests cannot create a second active copy. On failure, show a
recoverable error and leave no partial recipe rows or orphaned media. If the
source becomes private, is trashed, or disappears before commit, refuse the
copy and report that the recipe is no longer available.

The protected source reference remains visible in recipe detail and edit mode,
with a trailing `(protected source)` label. In edit mode, show it as a clearly
labeled read-only reference without a type picker, text field, URL editor, or
removal control. Ordinary references retain their current editable behavior.
Keep the distinction perceivable without color alone and maintain the existing
compact reference layout at desktop and mobile widths.

## Data, security, and failure boundaries

- Build the copy from server-loaded allow-listed public data. Do not serialize
  `RecipeRecord` or private database rows to the browser as a shortcut.
- Copy only photo bytes/variants that the public recipe currently exposes.
  Write new objects under the destination account's private media paths and
  create destination-owned media rows. Never retain the source's expiring
  signed URLs, object paths, or access to the source bucket.
- Remap all structured ingredient mentions and instruction-photo markers to
  destination IDs. Missing or invalid source markers must not create dangling
  references.
- Insert the recipe graph, locked attribution reference, and destination media
  metadata transactionally. If storage staging or the database transaction
  fails, remove or queue staged objects and leave no partial destination graph.
- Enforce at most one active saved copy per destination account and source
  public ID in the database so repeated and concurrent requests cannot create
  competing active copies. When one exists, return its destination recipe ID
  for the confirmation flow. Copies in Trash do not block a fresh copy and
  remain unchanged.
- Enforce the locked attribution below the UI layer. User recipe-edit,
  relationship-save, scoped-import, and database-import paths must not edit or
  remove the protected reference while the recipe remains. Export/import
  round-trips preserve its identity and lock. Incoming data cannot overwrite or
  remove an existing protected reference during replacement; ordinary external
  URL references remain editable.
- Keep every saved copy private regardless of the source's linkability. Do not
  reuse the source public ID. Publishing a copied recipe later uses DLC 30's
  explicit confirmation and retains the original source attribution.
- Make repeated requests safe against duplicate copies caused by retries. The
  intended duplicate policy per account/source must be confirmed below.

## Acceptance criteria and automated coverage

Write focused failing tests before production changes:

- Authenticated API tests prove a copy uses the signed-in User's Recipe Tin,
  has fresh IDs, defaults private, and contains only allow-listed source data.
  Anonymous requests, cross-account destination IDs, private/trashed sources,
  and tampered source payloads cannot create a copy.
- Graph tests prove ingredient sets, measurements, steps, mentions, pairings,
  references, publication attribution, nutrition-per-serving output, and
  photo markers survive with correct destination IDs and no dangling links.
- Storage tests prove public photo variants are copied into destination-owned
  private paths, the destination's media rows belong to the copied recipe, and
  no source signed URL/path is retained. Failure tests prove staged objects and
  rows are cleaned up or queued.
- Reference tests prove the source reference is titled with the source
  username and recipe name, targets the stable public URL, is visible in the
  editor/detail, and cannot be edited or removed through UI, recipe save RPC,
  or import/replace paths. Deleting the copied recipe remains valid.
- Export and import tests prove schema version 10 preserves the protected
  source public ID and lock for recipe-scoped and database bundles, and that
  replacement cannot remove an existing protected attribution.
- Retry and conflict tests prove duplicate requests follow the one-active-copy
  policy; a fresh save leaves prior trashed copies intact; the existing-copy
  dialog navigates only on confirmation and leaves the public recipe open on
  cancel; and a source made private before commit produces no copy.
- Chromium and Fold 6 checks cover save-action visibility for verified sessions,
  absence of that action for visitors without a session while print/download
  remain available, direct-request rejection, progress/success/error feedback,
  navigation to the saved recipe, responsive layout, keyboard/focus behavior,
  labels, and axe checks.

## Accepted decisions and resolved assumptions

- Accepted: copies go to the reserved Recipe Tin, source publication name/page
  remains a separate reference, and there is at most one active saved copy per
  account and source. Repeating Save asks before opening the active copy; cancel
  leaves the person on the public page. If matching copies are only in Trash,
  Save creates a fresh copy and leaves the trashed copies untouched.
- Resolved in DLC 30: usernames are 3–30 lowercase ASCII letters, numbers, or
  hyphens, with no leading or trailing hyphen; no additional names are reserved.
- Approved implementation: use the public ID as immutable source
  identity, preserve it with the protected URL reference in bundle schema v10,
  and show the save action only when the request has a server-verified User
  session. Visitors without a session retain public reading and print/download
  but do not get a save or sign-in action.
