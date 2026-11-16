# Comprehensive Reference Reorganization Blueprint

## Purpose and context

The [comprehensive reference index](./comprehensive-reference.md) currently
holds 16 numbered product sections in one 2,182-line document. It is explicitly
the product authority, but its size makes readers search a long page even
though they usually need one workflow or feature area. Other planning documents
link directly to its numbered sections, so simply moving the text would break
useful navigation.

This blueprint defines a navigable reference series without weakening or
duplicating the product contract. It is the implementation map for this
reorganization; it does not replace the requirements in the canonical reference
pages.

## Authority model

- `comprehensive-reference.md` remains the canonical entry point and index.
- The indexed files in `comprehensive-reference/` together contain the complete
  canonical product reference. They are not summaries or secondary guidance.
- The index explains that the series is authoritative. Other planning documents
  summarize or apply its requirements and defer to it when wording conflicts.
- Preserve the existing numbered section hierarchy and heading text so that
  section citations remain recognizable and can be mapped to new page anchors.
- Keep each requirement in one canonical location. Cross-references should link
  to that location rather than copy its requirement elsewhere.

## Page map

| Page | Existing sections | Contents and reason for grouping |
| --- | --- | --- |
| [00-foundations-and-delivery.md](./comprehensive-reference/00-foundations-and-delivery.md) | 1, 14, 15, 16 | Product purpose and principles, technical/hosting architecture, deferred scope, and test-first delivery. These establish the product context and delivery boundaries for every feature. |
| [01-recipe-card-and-metadata.md](./comprehensive-reference/01-recipe-card-and-metadata.md) | 2 | Recipe identity, metadata, times, photos, entry presentation, and nutrition. |
| [02-ingredients-and-presentation.md](./comprehensive-reference/02-ingredients-and-presentation.md) | 3, 4 | Ingredient rows, measures, density, scaling, sets, portions, nutrition equivalents, reader presentation, sorting, and reordering. |
| [03-instructions-and-links.md](./comprehensive-reference/03-instructions-and-links.md) | 5 | Instruction authoring and mentions, recipe pairings, and recipe references. |
| [04-publications-and-search.md](./comprehensive-reference/04-publications-and-search.md) | 6, 7 | Publications, Recipe Tin, deletion/restore, recipe and publication search, and the source Library explorer. |
| [05-settings-and-taxonomies.md](./comprehensive-reference/05-settings-and-taxonomies.md) | 8 | Picklists, ingredient catalog, tags, trusted densities, nutrition equivalents, preferences, Settings tabs, and account-menu destinations. |
| [06-sharing-and-accounts.md](./comprehensive-reference/06-sharing-and-accounts.md) | 9, 10 | Public/private behavior, URLs, image delivery and abuse controls, authentication, invitations, roles, and administrator-managed updates. |
| [07-import-export-and-history.md](./comprehensive-reference/07-import-export-and-history.md) | 11, 12 | Backup bundles, import/export behavior, recovery boundaries, and forensic history. |
| [08-interaction-and-accessibility.md](./comprehensive-reference/08-interaction-and-accessibility.md) | 13 | Desktop and mobile ergonomics, accessibility, accessible controls, ingredient editing, and private-shell navigation. |

This creates nine topic pages for the 16 existing numbered sections. The page
groups follow related user and delivery concerns; original section numbering
does not change.

## Content and navigation rules

1. Move each numbered section as a complete block, including its nested
   subsections, tables, lists, and examples, into exactly one page in the map.
2. Keep the original numbered headings and their order within each page. Add a
   page title and a short navigation link back to the index; do not rewrite
   requirement prose as part of the move.
3. Give the index a concise authority statement, reading guidance, and a
   detailed table of contents. For every child page, say what it covers and
   provide links to each numbered section and nested heading, so the index can
   act as a fast topic finder.
4. Include the same index link at the top of each child page. Where a moved
   section links to another moved section, make the cross-page target explicit.
5. Remove the stray, duplicated recipe-grid text from the old table of contents;
   preserve its actual requirement in section 7.3 on the publications/search
   page.

## Link migration

- For links to a numbered section or subsection, keep the existing fragment and
  change the target from `comprehensive-reference.md` to the mapped child page.
  The referring file's existing relative path prefix remains unchanged.
- Links with no fragment continue to point to `comprehensive-reference.md`, now
  the authoritative index. This includes general references to the authority.
- Update cross-references inside moved content when their destination is on a
  different child page.
- Review every repository occurrence of `comprehensive-reference.md`, not just
  Markdown links. Archived prompts that imply the index contains all detail
  should direct readers to the relevant indexed page. Historical discussion
  records may continue to name the index when that is the intended authority
  reference.
- Do not rewrite archived conversation exports or historical diffs. Embedded
  paths in those records describe what was written at the time, not live
  navigation. Update maintained planning docs and prompts instead.
- Validate old fragments against actual headings before migrating them. Repair
  already-stale anchors encountered in this pass to the correct existing
  heading; do not preserve a broken destination merely because the source link
  used it.

## Verification requirements

- All 16 numbered sections occur once each across the nine child pages, with
  their nested content preserved.
- The index links to every child page and provides a useful route to every
  numbered section and nested heading.
- Every remaining `comprehensive-reference.md#...` link has been migrated to
  its child page in maintained documents; unanchored mentions point to the
  index intentionally. Archived discussion exports remain unchanged.
- Every cross-page anchor resolves to a heading in its destination, including
  links in maintained Markdown docs and prompts.
- No section requirement was dropped, duplicated, or re-authored except for
  navigation text and correction of a stale link target.
- Run focused Markdown lint and `git diff --check`; check the final repository
  search results and distinguish intentional index mentions from stale paths.
