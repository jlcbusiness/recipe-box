# Recipe Box Portable Bundle Format

This document defines the versioned ZIP interchange format used by database,
publication, and recipe exports. It is the format contract for Slice 20 and
future import work; the comprehensive reference remains the product-behavior
authority.

## Archive layout

A version 11 archive contains:

```text
manifest.json
data.json
 images/<asset-id>/full.webp
 images/<asset-id>/thumbnail.webp
 images/<asset-id>/source-full.webp
 images/<asset-id>/source-thumbnail.webp
```

Paths use forward slashes, are relative, and contain no user content. The v1
namespace permits only `data.json` and UUID-scoped full, thumbnail, and
retained-source image paths. A ready asset contributes each distinct stored
variant once; source paths may alias the official paths when the source is
already the official image.

## Manifest

`manifest.json` is UTF-8 JSON with this shape:

```json
{
  "format": "recipe-box-bundle",
  "schema_version": 11,
  "created_at": "2026-10-15T12:00:00.000Z",
  "app_version": "1.0.0",
  "scope": {
    "type": "database"
  },
  "files": [
    {
      "path": "data.json",
      "size_bytes": 1234,
      "sha256": "lowercase-64-character-hex-digest"
    },
    {
      "path": "images/asset-uuid/full.webp",
      "size_bytes": 5678,
      "sha256": "lowercase-64-character-hex-digest"
    }
  ]
}
```

`scope.type` is `database`, `publication`, or `recipe`. Publication and recipe
scopes also include the selected record's UUID as `scope.id`. `created_at` is
UTC ISO 8601. `app_version` is the application package version.

`files` lists every payload file except `manifest.json`, exactly once. It
includes `data.json` and every image object. `size_bytes` is the uncompressed
byte count. `sha256` is the SHA-256 digest of the exact file bytes. The manifest
is not self-checksummed. A reader rejects missing, duplicate, unlisted, or
checksum-mismatched payload files and rejects absolute paths, `..` components,
backslashes, and unexpected ZIP entries.

## Data document

`data.json` is UTF-8 JSON with a versioned envelope:

```json
{
  "format": "recipe-box-data",
  "schema_version": 11,
  "scope": {
    "type": "database"
  },
  "account_preferences": {},
  "records": {
    "recipes": [],
    "publications": [],
    "recipe_picklist_values": [],
    "recipe_picklist_assignments": [],
    "recipe_time_entries": [],
    "ingredients": [],
    "ingredient_nutrition_profiles": [],
    "ingredient_measure_equivalents": [],
    "recipe_ingredient_sets": [],
    "recipe_ingredients": [],
    "recipe_ingredient_measurements": [],
    "recipe_steps": [],
    "recipe_step_mentions": [],
    "recipe_site_listings": [],
    "recipe_pairings": [],
    "recipe_references": [],
    "ingredient_densities": [],
    "tags": [],
    "recipe_tags": [],
    "publication_tags": [],
    "explorer_state": [],
    "media_assets": []
  }
}
```

The `records` keys and each table's fields are fixed versioned allow-lists. Each
array contains only the normalized product fields selected for v12; future
database columns cannot enter the bundle without a format change. Every v2
recipe ingredient row includes `ingredient_set_id`, which references a set in
`recipe_ingredient_sets` for the same recipe. Version 3 also includes
`portion_one_ratio`, `size_value`, and `size_unit` on ingredient rows, plus a
nullable `portion_ordinal` on ingredient mentions. Media asset rows include a
`crop` field that is either null or a normalized rectangle with `left`, `top`,
`width`, and `height` numbers in the range 0–1, plus `rotation` set to 0, 90,
180, or 270 degrees clockwise. The rectangle must have positive dimensions and
remain within the oriented image. Null means Fit/contain and preserves the
complete source. Version 7 media rows also include `source_full_path`,
`source_thumbnail_path`, and `source_byte_size`. The full and thumbnail paths
identify the official display files; source paths preserve the normalized
uncropped files needed for future edits. A source path may alias its official
path. `byte_size` counts every distinct stored file, while
`source_byte_size` counts the retained source variants. The nullable ratio
stores portion 1's share of the canonical total; ordinal 1 or 2 identifies the
referenced portion. Recipe rows include nullable `makes_quantity` and
`makes_thing` fields, which are either both null or a positive integer and
non-empty authored text. Versions 1 through 7 import both Makes fields as null.
`account_preferences` contains only product preferences and is empty for
publication and recipe scopes. Database bundles may include
`include_instruction_photos_in_private_print`; the boolean is optional so
older bundles remain valid, and a missing value preserves the destination
account's current setting. The field was added without changing schema version
5. Domain record IDs and relationship IDs are preserved. Owner `account_id`,
Auth user IDs, admin and sign-in-method values, signed URLs, private Storage
paths, and export timestamps are omitted. Import assigns ownership to the
authenticated destination account.

Media asset rows describe ready assets only. Their official and retained-source
storage paths are represented by matching relative `images/...` paths. Trashed
records and their ready images are included in full database exports. Scoped
exports include the selected active record graph and only the related rows and
assets needed by that graph. IDs in the archive describe source records and
relationships; they do not establish identity in the destination account.
Import maps included relationships to destination IDs. For an out-of-scope
recipe link, import reconnects only to a unique active destination recipe
matching the stored display text; otherwise it clears the link and preserves
the text. An out-of-scope publication reference preserves its display text
without a publication ID. For a recipe-scoped import, the destination recipe
match uses normalized name across active destination publications. Source
publication metadata resolves automatically; Recipe Tin maps to the
destination owner's collection. See [Slice 21B](slices/21b-scoped-import.md)
for the complete relationship and conflict rules.

History, full-text-search documents, pending uploads, Storage deletion queue
rows, and temporary export objects are never part of `records`.

## Version compatibility

Version 2 adds ingredient-set records and row membership. Version 3 adds
divided-portion ratios, Size values and units, and mention ordinals. Version 4
adds nullable media crop framing with 0-degree rotation. Version 5 adds
quarter-turn rotation. Version 6 adds recipe ratings and independent star and
heart markers. Version 7 preserves distinct official display images and
retained source images so future framing edits remain reversible. Version 8
adds the optional paired Makes quantity and thing. Version 9 adds ingredient
nutrition profiles and measure equivalents plus recipe-level and
recipe-ingredient nutrition overrides. Version 10 adds protected public-copy
source identity to recipe references. Version 11 adds ordered recipe time
entries with their Time Type references. Version 12 adds the optional
`saved_from_public_id` direct-save marker to recipe records. Versions 1 through
11 import with their existing compatibility rules; older
media rows treat their full and thumbnail files as the retained source.

A v1 import synthesizes one `Main` set per recipe and assigns that recipe's
ingredient rows to it. Versions 1 and 2 default the v3 fields to null,
retaining unsplit rows, no Size, and whole-row mentions. Versions 1 through 3
default media crop framing to null. ID remapping preserves the portion ordinal
in both marker text and mention records. Every version lets the destination
database generate a new public-link identity rather than reusing a source ID.
The import planner does not include `public_id` in recipe records. Version
upgrades never reinterpret a missing field as permission to expose private
content.

Version 9 adds ingredient nutrition profile and measure-equivalent records,
recipe-level `nutrition_overrides`, and per-nutrient recipe-ingredient
overrides with their serving-basis and acknowledgement metadata, plus an
optional recipe-only serving-size basis on each ingredient row. Profile and
equivalent records are included only for ingredients in the exported record
graph; recipe and row overrides remain attached to their corresponding recipe
records. The fixed allow-list excludes owner IDs and unrecognized nutrient
keys. Versions 1 through 8 import without profiles, equivalents, or nutrition
overrides.

Version 10 adds `is_protected_source` and nullable `source_public_id` fields to
recipe references. Protected references must be external URLs with a valid
source public ID, and each account may have only one protected reference per
source ID. Versions 1 through 9 import references with protected metadata set
to false and null. Import and replacement preserve existing protected source
attribution rather than allowing incoming data to remove or overwrite it.

Version 11 adds `recipe_time_entries` records with `id`, `recipe_id`,
`time_type_id`, `minutes`, and `position`. Each `time_type_id` references an
included `recipe_picklist_values` record in the `time_type` category. The
allow-list for v11 recipe records omits the nine legacy component-time columns
and retains the derived `total_time_minutes`. Versions 1 through 10 convert
non-null component values to entries of their matching seeded types; if no
component value exists but Total Time is present, import creates one Cook
entry. When component values exist, their sum determines the imported total.

Version 12 requires every recipe record to include `saved_from_public_id`,
either null or a UUID matching exactly one protected source reference on that
recipe. Versions 1 through 11 normalize the marker to null. A faithful import
preserves a valid marker, but rejects an active marker that conflicts with
another active copy in the destination account; choosing Duplicate clears the
marker while retaining protected source attribution.

An importer must validate both `schema_version` fields, require them to match,
accept only versions 1 through 12, verify all file sizes and checksums before
creating records, and reject unknown versions without partially applying the
bundle. Slice 21 defines transaction and recovery behavior.

## Export limits

- Maximum aggregate uncompressed image bytes: 1 GiB, matching the existing
  account processed-media quota.
- Maximum uncompressed `data.json`: 64 MiB.
- A bundle beyond either limit is rejected before a successful export is
  recorded. Export limits apply before ZIP compression.

## References

- [Comprehensive reference, § 11: Import, Export, and Backup Bundles](comprehensive-reference.md#11-import-export-and-backup-bundles)
- [Comprehensive reference, § 12: Change History and Forensic Audit](comprehensive-reference.md#12-change-history-and-forensic-audit)
- [Data model](data-model.md)
- [Slice 20: Export](slices/20-export.md)
