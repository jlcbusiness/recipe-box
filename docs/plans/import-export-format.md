# Recipe Box Portable Bundle Format

This document defines the versioned ZIP interchange format used by database,
publication, and recipe exports. It is the format contract for Slice 20 and
future import work; the comprehensive reference remains the product-behavior
authority.

## Archive layout

A version 1 archive contains:

```text
manifest.json
data.json
 images/<asset-id>/full.webp
 images/<asset-id>/thumbnail.webp
```

Paths use forward slashes, are relative, and contain no user content. The v1
namespace permits only `data.json` and UUID-scoped `full.webp` or
`thumbnail.webp` image paths. Each ready asset contributes both variants.

## Manifest

`manifest.json` is UTF-8 JSON with this shape:

```json
{
  "format": "recipe-box-bundle",
  "schema_version": 1,
  "created_at": "2026-10-15T12:00:00.000Z",
  "app_version": "0.1.0",
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
  "schema_version": 1,
  "scope": {
    "type": "database"
  },
  "account_preferences": {},
  "records": {
    "recipes": [],
    "publications": [],
    "recipe_picklist_values": [],
    "recipe_picklist_assignments": [],
    "ingredients": [],
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
array contains only the normalized product fields selected for v1; future
database columns cannot enter the bundle without a format change.
`account_preferences` contains only product preferences. Domain record IDs and
relationship IDs are preserved. Owner `account_id`, Auth user IDs, admin and
sign-in-method values, signed URLs, private Storage paths, and export timestamps
are omitted. Import assigns ownership to the authenticated destination account.

Media asset rows describe ready assets only. Their full and thumbnail storage
paths are represented by their matching relative `images/...` paths. Trashed
records and their ready images are included in full database exports. Scoped
exports include the selected active record graph and only the related rows and
assets needed by that graph. Recipe links whose target is outside the selected
graph retain their target ID and stored display text; import conflict and
unresolved-link behavior belongs to Slice 21.

History, full-text-search documents, pending uploads, Storage deletion queue
rows, and temporary export objects are never part of `records`.

## Version compatibility

Version 1 includes the current recipe `is_private` value and does not include a
public-link identifier, which is introduced by Slice 22. A later format version
must retain the ability to read version 1. For a v1 import after Slice 22, the
importer preserves `is_private` when present and lets the destination create a
new public-link identity rather than reusing a nonexistent source ID. Version
upgrades never reinterpret a missing field as permission to expose private
content.

An importer must validate both `schema_version` fields, require them to match,
verify all file sizes and checksums before creating records, and reject unknown
major format versions without partially applying the bundle. Slice 21 defines
transaction and recovery behavior.

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
