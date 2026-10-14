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

An account owns its recipes, publications, configuration, media, saved views,
and history. All private data access is scoped to its owning account. Public
recipe access is limited to the recipe's public-link route and permitted media.

Slice 1 first implements this boundary with the minimal Account record linked
to the authenticated user's identity. It is intentionally the only
account-owned product record in that slice: it establishes and tests row-level
security without prematurely creating recipe or other domain tables.

## Core Entities

| Entity | Responsibility |
| ------ | -------------- |
| Recipe | The recipe's metadata, state, optional integer Serves count, timings, notes, primary publication and location, optional online recipe URL, privacy, and public-link ID. |
| Publication | A Book, Magazine title, or Site that can be assigned as a primary source. |
| Ingredient | A canonical account-owned ingredient and optional trusted density. |
| Recipe ingredient | An ordered ingredient row with persistent manual order, Main flag, specifics, preparation, and measurements. |
| Measurement | A volume, weight, count (a bare number), Things value (a number with an account-managed non-standard unit word), or Feel phrase attached to one recipe ingredient. |
| Recipe step | An ordered instruction block. |
| Ingredient mention | A structured link from an instruction location to a recipe ingredient. |
| Recipe pairing | A Pairs with entry with required display text and an optional linked target recipe. |
| Recipe reference | A same-account recipe link, external URL, or printed citation linked to a recipe; legacy Publication references remain static text, and purged recipe targets retain their display text. |
| Tag | A trimmed, case-preserving account-owned name, unique after case-folding, with one fixed pastel color key, linked to recipes and publications. |
| Picklist value | A managed selectable value for an account-scoped configurable taxonomy. |
| Explorer state | A per-account last-used recipe or publication explorer configuration: filters, sort, direction, view, and fixed publication scope when applicable. |
| Saved view | A named, pinned recipe or publication query configuration delivered with advanced nested queries in Slice 19. |
| Preference | Account-level defaults: ingredient presentation, volume and weight unit systems, mobile hand preference, and ingredient-mention style. |
| Account | The account record linked to the sign-in identity; it owns private data, volume and weight display-system defaults, a mobile hand preference, an immutable sign-in method, and a server-managed admin flag. |
| Purged recipe | A tombstone record of a permanently purged recipe public-link ID to serve HTTP 410. |
| Media asset | Metadata and private storage path for a cover or recipe image. |
| History event | An append-only forensic record of a saved change. |

Publications retain `created_at` and `updated_at` timestamps. `updated_at`
advances on each publication update and supports Date Changed sorting in the
Library Explorer; Date Added and Date Changed are not displayed as List
columns.

## Relationship Rules

- A recipe has zero or one primary publication. No primary publication means
  Recipe Tin membership.
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
- A recipe ingredient can have one displayed category: Unit, Count, Things, or
  Feel. Unit maps to the stored volume and/or weight records; Things maps to an
  informal record and Feel maps to an unmeasured record. A Unit row can contain
  volume, weight, or both; all other categories contain only their applicable
  value.
- Main ingredients are derived from recipe-ingredient flags, not duplicated
  recipe metadata.
- Ingredient mentions reference a particular recipe ingredient, never an
  unstructured word in instruction text.
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
direct updates remain restricted to the existing column grant. A narrow
authenticated function derives the account from `auth.uid()` and can update
only these two preferences; it accepts no account ID and is not executable by
`public` or `anon`.

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
