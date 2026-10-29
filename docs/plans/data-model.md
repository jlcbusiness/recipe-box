# Recipe Box Data Model Boundary

> **Reference Note:** For exhaustive field-by-field definitions, measurement
> structures, picklist taxonomies, and relationship behaviors, see
> [comprehensive reference](comprehensive-reference.md), specifically:
>
> - [comprehensive-reference.md § 2 (Recipe Metadata)](comprehensive-reference.md#2-recipe-card-and-metadata)
> - [comprehensive-reference.md § 3 (Ingredients & Measurements)](comprehensive-reference.md#3-ingredient-rows-measurements-and-density)
> - [comprehensive-reference.md § 6 (Publications & Recipe Tin)](comprehensive-reference.md#6-publications-magazine-handling-and-the-recipe-tin)
> - [comprehensive-reference.md § 8 (Settings & Taxonomies)](comprehensive-reference.md#8-settings-taxonomies-and-picklists)

## Purpose

This document names the domain entities and non-negotiable relationship rules.
It is not a SQL schema or migration plan. The specific table definitions,
constraints, indexes, and row-level security policies must be designed and
verified in the slice brief before implementation.

Every data rule and access boundary must also be observable through deterministic
automated tests. Define test fixtures, controllable time and identity inputs,
and assertions for constraints, migrations, row-level security, and public-data
exposure before implementing the schema or access code.

## Ownership

An account owns its recipes, publications, configuration, media, explorer
preferences, and history. All private data access is scoped to its owning account. Public
recipe access is limited to the recipe's public-link route and permitted media.

Slice 1 first implements this boundary with the minimal Account record linked
to the authenticated user's identity. It is intentionally the only
account-owned product record in that slice: it establishes and tests row-level
security without prematurely creating recipe or other domain tables.

## Core Entities

| Entity | Responsibility |
| ------ | -------------- |
| Recipe | The recipe's metadata, state, optional tried-only signed Score, independent private Star and Heart markers, optional integer Serves count, timings, notes, primary publication and location, optional online recipe URL, privacy, and public-link ID. |
| Publication | A Book, Magazine title, or Site that can be assigned as a primary source. |
| Ingredient | A canonical account-owned ingredient and optional trusted density. |
| Ingredient set | A recipe-owned, ordered, named grouping for ingredient rows. |
| Recipe ingredient | An ordered ingredient row assigned to exactly one ingredient set, with persistent manual order, Main flag, specifics, preparation, measurements, optional two-portion ratio, and optional cubed Size. |
| Measurement | A volume, weight, count (a bare number), Things value (a number with an account-managed non-standard unit word), or Feel phrase attached to one recipe ingredient. |
| Recipe step | An ordered instruction block. |
| Ingredient mention | A structured link from an instruction location to one recipe ingredient row and optionally one of its two portions. |
| Instruction photo reference | A stable media-asset identity embedded in a recipe step; it can reference only a ready photo owned by that same recipe. |
| Recipe pairing | A Pairs with entry with required display text and an optional linked target recipe. |
| Recipe reference | A same-account recipe link, external URL, or printed citation linked to a recipe; legacy Publication references remain static text, and purged recipe targets retain their display text. |
| Tag | A trimmed, case-preserving account-owned name, unique after case-folding, with one fixed pastel color key, linked to recipes and publications. |
| Picklist value | A managed selectable value for an account-scoped configurable taxonomy. |
| Explorer state | A per-account last-used recipe or publication explorer configuration: filters, sort, direction, view, List-column visibility, desktop widths, and fixed publication scope when applicable. |
| Preference | Account-level defaults: ingredient presentation, volume, weight, and temperature display systems, mobile hand preference, independent ingredient/temperature/duration emphasis colors, and private-print emphasis, inline-photo, repeated-ingredient, and owner-only-detail choices. |
| Account | The account record linked to the sign-in identity; it owns private data, volume, weight, and temperature display-system defaults, print preferences, a mobile hand preference, an immutable sign-in method, and a server-managed admin flag. |
| Purged recipe | A tombstone record of a permanently purged recipe public-link ID to serve HTTP 410. |
| Media asset | Metadata and private storage path for a cover or recipe image. A recipe photo has a unique, persisted two-digit reference code within its recipe; covers have no code. |
| History event | An append-only forensic record of a saved change. |

Publications retain `created_at` and `updated_at` timestamps. `updated_at`
advances on each publication update and supports Date Changed sorting in the
Library Explorer; Date Added and Date Changed are not displayed as List
columns.

## Relationship Rules

- Every recipe has one primary publication. Each account has one permanent,
  system-managed Recipe Tin collection publication for recipes without an
  external publication source; Tin recipes have no publication location.
- Recipes and publications each have many account-owned tags through the
  `recipe_tags` and `publication_tags` many-to-many tables. An assignment's
  account must match both its parent record and tag; duplicate assignments are
  prohibited. Tag names are limited to 160 characters and are unique per
  account after trimming and case-folding. Tags are flat; their color key comes
  from the fixed 16-color pastel palette and is visual only.
- A recipe may have many supplemental references and many incoming/outgoing
  recipe relationships.
- A recipe has many ordered ingredient rows and many ordered instruction steps.
  Ingredient manual order is persistent and separate from temporary view sorts.
- Every recipe has at least one ordered ingredient set. Existing recipes use a
  `Main` set; each ingredient row belongs to exactly one set. Set identity,
  order, and labels are included in save history, Trash/restore, and portable
  bundles. A canonical ingredient appears at most once within a set; duplicate
  rows across sets remain independent. Version 1 imports synthesize a `Main`
  set; version 3 bundles preserve portion and Size fields while versions 1 and
  2 default them to null.
- A recipe ingredient can have one displayed category: Unit, Count, Things, or
  Feel. Unit maps to the stored volume and/or weight records; Things maps to an
  informal record and Feel maps to an unmeasured record. A Unit row can contain
  volume, weight, or both; all other categories contain only their applicable
  value.
- Main ingredients are derived from recipe-ingredient flags, not duplicated
  recipe metadata.
- A divided row stores its first-portion ratio; the second portion uses the
  complement, and existing measurements remain the canonical total. Only
  scalar Unit, Count, and Things measurements divide.
- Size is a positive value with unit `in` or `cm`, allowed only for `cubed`
  Preparation. An absent Size has both value and unit null.
- Ingredient mentions reference a particular recipe ingredient row, never an
  unstructured word in instruction text. A divided-row mention may store
  ordinal 1 or 2; a null ordinal refers to the whole row.
- An instruction photo reference resolves only to a ready `recipe_photo` asset
  belonging to the same recipe and account. It stores no signed URL, storage
  path, or image bytes. The photo is decorative and supplemental, with empty
  alternative text and no caption or description; written instructions remain
  complete without it. Removing a referenced photo removes all its step
  references in the same confirmed, version-checked operation. Cancellation or
  a version conflict leaves both recipe content and media unchanged.
- A recipe pairing may be plain text or link another recipe. Linked pairings are
  directional and expose both outgoing and incoming recipe relationships.
- A Magazine publication represents its title. Each Magazine recipe stores its
  own issue, volume, edition/date, and optional page citation in its recipe
  location. Its optional online recipe URL belongs to the recipe and does not
  create a secondary Site relationship.
- Pairing autocomplete and in-app recipe-reference selection expose only
  active recipes from the owning account. Trashed targets remain associated but
  render as text; restore makes their links active again. Permanent target
  purge detaches the target while preserving the last display text. Legacy
  Publication references retain their display text and are not selectable.
  Permanent source-recipe purge removes its pairings and references.
- History is append-only and excluded from recovery exports.
- Recipe and publication history snapshots include assigned tag IDs, names,
  and color keys. Catalog revisions and append-only history track creation,
  rename, merge, deletion, and recoloring. Rename, merge, or replacement
  updates affected entity versions and captures before/after tag assignments in
  the same transaction; recoloring changes the shared visual catalog value
  without changing entity assignment versions.
- Deleting a recipe or publication moves it to the trash. Trashed items are
  purged permanently after 30 days. The public ID of a purged recipe is retained
  so its URL can return 410.
- Deleting a publication applies one atomic recipe disposition. Moving recipes
  to the Recipe Tin or another publication is not reversed by restoring the
  source publication. Recipes moved to Trash retain their publication link and
  location, and require a separate recipe restore.
- A media asset belongs to exactly one active or trashed recipe or publication
  and is stored in the private media bucket. Each publication has at most one
  cover; each recipe has at most 12 ordered photos and one primary photo.
  Each ready asset has nullable normalized crop framing; null displays the
  complete image with Fit/contain, while a saved rectangle and quarter-turn
  rotation are reversible presentation metadata and never replace the stored
  WebP variants. Crop updates use the active parent's version and append the
  corresponding history event. Portable bundle v5 preserves framing and
  rotation; v4 imports default rotation to 0 degrees, and versions 1 through 3
  default framing to null.
  Recipe photos also have a unique, persisted two-digit reference code within
  their recipe, independent of gallery order. Instruction shorthand resolves
  through the stable asset UUID; the visible code is only an authoring label.
  Account quota counts the processed full and thumbnail derivatives, not the
  staged original.
- Trashing a parent hides its media without breaking the association.
  Permanent parent purge queues the staged and processed object paths before
  cascading the media metadata.

## Configuration Boundaries

Volume and weight units are fixed recognized definitions. Count has no unit.
Things units and Feel phrases are account-managed configuration. Their storage
categories remain `informal_unit` and `unmeasured_phrase`.
Ingredients, food types,
meal types, cuisines, equipment, verdicts, enthusiasm options, and tags are
account-managed.

Trusted density belongs to the canonical ingredient, not a recipe row. The first
release permits one trusted density per ingredient.

Slice 13 stores `volume_system` and `weight_system` on Account as non-null
`us_customary` or `metric` values, both defaulting to `us_customary`. Existing
accounts receive the same defaults when the migration is applied; the isolated
migration harness verifies those defaults for both existing and newly created
accounts. Authenticated owners retain their existing account read policy, but
direct updates remain restricted. A narrow authenticated preference function
derives the account from `auth.uid()` and updates only its explicit
allow-listed preference columns; it accepts no account ID and is not
executable by `public` or `anon`.

DLC 08 adds the non-null Account field
`include_instruction_photos_in_private_print`, defaulting to `true` for
existing and new accounts. It controls inline instruction photos in private
print and standalone outputs; gallery photos are always omitted. Its value is
included in database bundle preferences and remains optional when importing
older bundles.

The DLC 09 print preference also adds the non-null Account field
`repeat_ingredients_in_private_print`, defaulting to `true` for existing and
new accounts. It supplies the private **Page Settings** default for Print,
HTML, PNG, and PDF; changes made on a recipe page are transient. The preference
is included in database bundles and remains optional when importing older
bundles.

The private-only details preference adds the non-null Account field
`include_private_details_in_private_print`, defaulting to `false` for existing
and new accounts. It controls whether owner-only metadata, notes, pairings, and
references are included in private Print and Download outputs. Page-level
changes are transient; the preference is included in database bundles and
remains optional when importing older bundles. Recipe tags are not included in
standalone output regardless of this preference.

## Required Future Detail

Before database implementation, define identifiers, nullability, delete and
trash/purge behavior, record versioning for edit-conflict detection, uniqueness, indexes, query/search representation,
import IDs,
validation, and Supabase row-level security policies. Record those verified
choices in the relevant slice brief rather than treating this document as a
ready-to-run schema.

For Slice 1, the brief must define the minimal Account record, its one-to-one
link to the authenticated user, private storage-path ownership, and RLS
policies. Its deterministic tests create local Auth users directly only to
arrange fixtures; invitations, admin status, production sign-up enforcement,
and recipe tables are out of scope until their assigned slices.

Slice 2 adds `is_admin` and `sign_in_method` to Account. Normal authenticated
clients cannot update those columns. Server-side administrative operations
must verify the current Auth user and `is_admin` before using the Supabase
secret-key client. Invitation state remains owned by Supabase Auth rather than
being duplicated in an application table.
