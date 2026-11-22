# Recipe Box Comprehensive Reference: Import, Export, and History

[Back to the comprehensive reference index](../comprehensive-reference.md)

> Canonical product requirements: Backup bundles, export and import behavior, recovery boundaries, and forensic history.

## 11. Import, Export, and Backup Bundles

### 11.1 ZIP Bundle Formats

Export is built for disaster recovery and migration. The app's ZIP export is the
user-facing backup mechanism; Supabase backups are not used. Version 16 archives
contain:

- `manifest.json`: Format and schema versions, UTC creation time, scope, app
  version, and each payload file's uncompressed byte count and SHA-256 digest.
- `data.json`: Normalized relational JSON using fixed record-table and
  per-table field allow-lists, including Made count and last-made timestamp,
  ingredient sets and each row's set
  membership, portion ratio, Size value/unit, mention ordinal, protected
  source-reference identity, ordered time entries, and the optional
  `saved_from_public_id` direct-save marker. Account
  IDs, Auth user IDs, admin and
  sign-in-method fields, signed URLs, private Storage paths, and export
  timestamps are omitted. Media rows include nullable normalized crop framing
  and retained source path/size metadata; product preferences and recipe
  privacy are retained.
- `images/<asset-id>/full.webp`, `thumbnail.webp`, `source-full.webp`, and
  `source-thumbnail.webp`: Every distinct official and retained-source WebP
  variant for each included media asset, addressed by stable asset UUID.
  Source paths may alias official paths when the source is the current display.
  Pending uploads and history are excluded.

The manifest lists every payload file except itself. Archive paths are limited
to `data.json` and UUID-scoped official or retained-source WebP paths. The portable
contract and compatibility rules are defined in
[import-export-format.md](import-export-format.md).

### 11.2 Export Scopes

1. **Database Export:** Accessible in App data from the Account menu. Includes all owned records,
   including trashed-but-restorable rows, product preferences, and ready images.
2. **Publication Export:** Accessible from publication detail, to the left of
   Edit on desktop. Library cards do not expose publication export actions.
   Includes the selected active publication, its recipes and dependent
   relational rows, and their ready images. On mobile, a 40px transfer-menu
   button offers `Export publication` and `Import recipe`; Edit and Add Recipe
   remain separate icon actions in the compact toolbar.
3. **Recipe Export:** Accessible beside Print and Edit on recipe detail.
   The icon action is 36px square to match Print and Edit. It includes the
   selected active recipe graph and ready images, plus basic metadata for its
   primary publication. Cross-scope recipe links retain their source IDs and
   display text.

### 11.3 Import Conflict Resolution

Imports accept supported v1 through v16 bundles only after validating archive
integrity, scope, and required graph data. Versions 1 through 3 default media
framing to null (Fit/contain); version 4 preserves each media asset's nullable
normalized crop rectangle at 0-degree rotation, and version 5 preserves its
quarter-turn rotation. Version 6 adds recipe ratings and personal markers.
Version 7 preserves distinct official display and retained-source image
variants; versions 1 through 6 treat their full and thumbnail files as the
source. Invalid framing is rejected before applying records.
Version 8 preserves the paired Makes quantity and thing; earlier versions
default both fields to null.
Version 9 adds nutrition profiles, measure equivalents, and recipe/ingredient
nutrition overrides; version 10 adds protected public-source identity to
references; version 11 adds ordered recipe time entries; and version 12 adds
the `saved_from_public_id` direct-save marker. Versions 1 through 11 default
that marker to null. Version 13 adds `amount_is_a`; version 14 adds
`alternate_note`; version 15 adds `prep_ahead_markdown`; and version 16 adds
`made_count` and `last_made_at`. For versions 1 through 15, new imports of
Tried recipes default to a Made count of one with an unknown last-made
timestamp; other States default to zero and null. Same-recipe imports restore
values present in the bundle, and when an older bundle omits the Made fields
they preserve the destination's current values.
Version 1 recipes receive a synthesized `Main` set and their ingredient rows
are assigned to it. Version 2
preserves the included set records and row membership. Versions 1 and 2 default
portion ratio, Size, and mention ordinal fields to null; version 3 preserves
them and remaps portion markers with their row IDs. Imports are
source-independent: the authenticated destination account determines
ownership, and the import does not require the source account or source Auth
identity to exist locally.

Version 12 validates a non-null direct-save marker against the recipe's
protected source attribution. Faithful imports preserve it only when no other
active recipe in the destination account already has that marker; a collision
is rejected. Choosing Duplicate for an import conflict clears the marker while
preserving protected source attribution. New duplicates start with Made count
zero and no last-made timestamp. A duplicate of a Tried recipe resets State to
Want to try and clears Tried-only conditional values; other duplicate State
behavior remains unchanged.

Publication roots match by normalized publication type and name. Database and
publication imports match recipe roots by normalized name within the resolved
publication. Recipe-scoped imports match by normalized name across all active
destination publications, regardless of the source publication. Source IDs and
content hashes do not establish identity. Publication conflicts offer
**Keep Existing**, **Create Duplicate**, or **Replace**. Recipe conflicts in
database and publication imports offer **Replace**, **Duplicate**, or
**Ignore**; recipe-scoped conflicts offer **Replace** or **Duplicate** only.
Replace retains the destination root ID and the matched recipe's current
destination publication. Recipes included in a publication bundle remain
independently resolved roots.

A recipe bundle's publication metadata is a dependency, not a second
replaceable root. A unique active normalized type/name match is reused; if no
match exists, the publication is created automatically. Recipe Tin maps to the
destination User's existing collection and is never imported as a
publication record. New and duplicate recipes default to the source publication
and can be assigned to another active destination publication.
When the retained or selected destination type forbids a source recipe URL or
printed location, preserve it as an external-URL reference or printed citation
and clear the incompatible primary location field. Compatible location fields
remain unchanged. Do not duplicate an equivalent imported reference.

Import database remains in App data. Selecting a ZIP starts upload and
comparison automatically; the compact file row shows the filename and
record/media counts together without private/public recipe counts or an
`Import preview` heading. Import publication is available in the Library, and
Import recipe is an item in the shared Export publication/Import recipe transfer
menu on desktop and mobile. Publication Edit, Add Recipe, and transfer actions
use compact 40px icon-only controls with accessible names and tooltips. Scoped
imports preserve recipe privacy, remap imported IDs, and resolve relationships
using the bundle and destination data: an out-of-scope recipe link reconnects
only to one unique active destination match, otherwise its display text remains
without a link. Out-of-scope publication references retain their text without
a foreign ID.

### 11.4 Backup Reminder

Because export is the only backup, App data shows the date of the last full-database export and a gentle reminder when
it is more than 30 days old.

### 11.5 Export Delivery and Limits

The normalized `data.json` is limited to 64 MiB and aggregate uncompressed
images to 1 GiB. Exports exceeding either limit fail without advancing the
full-database export date. Missing or unreadable ready images also fail rather
than producing a partial archive.

The server builds the ZIP as a Node.js stream and uploads it to a random
account-prefixed path in the private `recipe-exports` Storage bucket. The API
returns a 15-minute signed URL instead of ZIP bytes, avoiding the Vercel
Function 4.5 MiB response-body limit. A successful export is queued for deletion
at least 24 hours later. The full-database timestamp advances only after the
archive is finalized, uploaded, queued for cleanup, and its signed URL is
created; scoped exports do not change it. Failed operations clean up partial
objects and leave the timestamp unchanged. Navigating away aborts an in-flight
export request, and the server removes or queues any partial archive for cleanup.

Export feedback is displayed below its action without changing the action row
or the position of following page content. On App data, feedback appears below
the Export and Import actions and above Wipe all account data, without moving
or covering those controls. App data retains a 48px mobile action target;
compact publication and recipe actions use their dimensions above.

### 11.6 Recovery and reset boundaries

A full database ZIP is an account-data backup, not a backup of the Supabase
project. It restores account-owned records, preferences, and ready image
variants. It does not include Auth users or credentials, or change history.
Local resets are allowed when a clean baseline is worth the reset and reload
effort. The repeatable synthetic fixture can restore its test accounts and
data; it does not preserve arbitrary local records. Export local data that is
not represented by the fixture if it needs to survive a reset.

After `npm run dev:local` or `supabase db reset` has reapplied
migrations, run `npm run seed:synthetic -- --local` to restore the synthetic
baseline. To recover other exported app data, create a fresh local Auth
account and import the full database ZIP from App data. Import is account-derived,
so it does not require the original Auth user ID. This workflow restores
account data, not Auth identities or history. Never reset a linked or hosted
database as part of local testing.

---

## 12. Change History and Forensic Audit

### 12.1 Purpose and Constraints

- Change history exists purely for forensic auditing (e.g., checking "what was the baking time before I changed it?",
  "when did I add cardamom?").
- **No Version Restore:** To keep the schema and UI clean, full version restoration is explicitly excluded from the v1 scope.
- **Export Exclusion:** History logs are excluded from ZIP backup bundles to keep backups clean and portable.

### 12.2 Captured Audit Events

History events are recorded on save (never on individual keystrokes):

- Recipe / Publication creation
- Successful Made actions, together with the count, timestamp, and any State
  transition; same-day no-ops create no event
- Metadata edits (field-level before/after diffs)
- Tag assignment changes, including tag IDs, names, and color keys in
  before/after recipe and publication snapshots
- Tag catalog creation, rename, merge, deletion, and recoloring, including
  affected recipe/publication IDs, actor, and before/after catalog snapshots
- Tag recoloring, including affected recipe/publication IDs and before/after
  catalog snapshots with color keys
- Ingredient additions, removals, and quantity modifications
- Ingredient nutrition profile and measure-equivalent changes, with before and
  after snapshots
- Recipe ingredient nutrition override and recipe-level nutrition changes,
  captured with the ordinary versioned recipe save
- Pre-recipe Prep Markdown changes, captured separately from Notes and ordered
  instruction-step changes
- Before/after ingredient snapshots include portion ratios and Size value/units;
  instruction mention snapshots include nullable portion ordinals.
- Step reordering and edits
- Publication assignment and unparenting
- Trashed / restored states
- Account ID and ISO timestamp

---
