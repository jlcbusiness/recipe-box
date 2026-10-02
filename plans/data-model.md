# Recipe Box Data Model Boundary

> **Reference Note:** For exhaustive field-by-field definitions, measurement
> structures, picklist taxonomies, and relationship behaviors, see
> [plans/comprehensive-reference.md](comprehensive-reference.md), specifically:
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
| Recipe | The recipe's metadata, state, yield, timings, notes, primary publication, privacy, and public-link ID. |
| Publication | A Book, Magazine issue, or Site that can list recipes. |
| Ingredient | A canonical account-owned ingredient and optional trusted density. |
| Recipe ingredient | An ordered ingredient row with persistent manual order, Main flag, detail, preparation, and measurements. |
| Measurement | A volume, weight, count (a bare number), informal (a number with a non-standard unit word), or unmeasured expression attached to one recipe ingredient. |
| Recipe step | An ordered instruction block. |
| Ingredient mention | A structured link from an instruction location to a recipe ingredient. |
| Recipe pairing | A Pairs with entry with required display text and an optional linked target recipe. |
| Recipe reference | An in-app publication, external URL, or printed citation linked to a recipe. |
| Tag | An account-owned tag linked to recipes and publications. |
| Picklist value | A managed selectable value for an account-scoped configurable taxonomy. |
| Saved view | A persisted recipe or publication search, filter, sort, and column configuration. |
| Preference | Account-level defaults: ingredient presentation, volume and weight unit systems, and ingredient-mention style. |
| Account | The account record linked to the sign-in identity; it owns private data and later carries the single sign-in method and admin flag. |
| Purged recipe | A tombstone record of a permanently purged recipe public-link ID to serve HTTP 410. |
| Media asset | Metadata and private storage path for a cover or recipe image. |
| History event | An append-only forensic record of a saved change. |

## Relationship Rules

- A recipe has zero or one primary publication. No primary publication means
  Recipe Tin membership.
- A recipe may have many supplemental references and many incoming/outgoing
  recipe relationships.
- A recipe has many ordered ingredient rows and many ordered instruction steps.
  Ingredient manual order is persistent and separate from temporary view sorts.
- A recipe ingredient can have a volume measurement, a weight measurement, a
  count (a number with no unit), an informal measurement (a number plus a
  non-standard unit such as bunch), or an approved unmeasured phrase. Volume and
  weight may coexist on the same row.
- Main ingredients are derived from recipe-ingredient flags, not duplicated
  recipe metadata.
- Ingredient mentions reference a particular recipe ingredient, never an
  unstructured word in instruction text.
- A recipe pairing may be plain text or link another recipe. Linked pairings are
  directional and expose both outgoing and incoming recipe relationships.
- Individual magazine issues are individual publications. A Magazine-primary
  recipe may have at most one secondary Site listing, which carries the recipe's
  URL on that site, while the magazine issue remains primary.
- History is append-only and excluded from recovery exports.
- Deleting a recipe or publication moves it to the trash. Trashed items are
  purged permanently after 30 days. The public ID of a purged recipe is retained
  so its URL can return 410.

## Configuration Boundaries

Volume and weight units are fixed recognized definitions. Count has no unit.
Informal units and unmeasured phrases are account-managed configuration.
Ingredients, food types,
meal types, cuisines, equipment, verdicts, enthusiasm options, and tags are
account-managed.

Trusted density belongs to the canonical ingredient, not a recipe row. The first
release permits one trusted density per ingredient.

## Required Future Detail

Before database implementation, define identifiers, nullability, delete and
trash/purge behavior, record versioning for edit-conflict detection, uniqueness, indexes, query/search representation, import IDs,
validation, and Supabase row-level security policies. Record those verified
choices in the relevant slice brief rather than treating this document as a
ready-to-run schema.

For Slice 1, the brief must define the minimal Account record, its one-to-one
link to the authenticated user, private storage-path ownership, and RLS
policies. Its deterministic tests create local Auth users directly only to
arrange fixtures; invitations, admin status, production sign-up enforcement,
and recipe tables are out of scope until their assigned slices.
