# Slice 11: Source Links and Relationships

**Status:** Complete.

This slice adds recipe-to-recipe Pairs With relationships and supplemental
References, and revises the Magazine publication model. A Magazine publication
represents a title; each recipe stores its own issue, volume, edition/date, and
page location plus an optional online recipe URL. Magazine recipes do not need
a secondary Site publication. In-app References link to recipes only;
existing Publication references remain visible as static legacy text.

The product authority is
[plans/comprehensive-reference.md](../comprehensive-reference.md), especially
[§ 5.2, Pairs With](../comprehensive-reference.md#52-recipe-to-recipe-links-pairs-with),
[§ 5.3, References](../comprehensive-reference.md#53-references-section),
and [§ 6.2, Magazine Titles, Recipe Locations, and Online URLs](../comprehensive-reference.md#62-magazine-titles-recipe-locations-and-online-urls).
Also consult the [first-draft specification](../first-draft-spec.md),
[data model](../data-model.md), [visual design guide](../visual-design.md),
and [decision log](../decision-log.md).

## Outcome

An owner can assign a recipe to a Magazine title, record the recipe's issue and
page location, and optionally paste its online recipe URL. The URL is visible
beside the location under Publication and does not require a Site picker or a
separate section. The owner can also add plain-text or linked Pairs With
entries and recipe, external URL, and printed-citation References. Recipe
detail shows outgoing and incoming Pairs With links. Saves remain owner-scoped,
atomic, version-checked, included in recipe history, and usable on desktop and
Fold 6.

## Decisions

- A Magazine publication represents the title. Issue, volume, edition/date,
  and page are per-recipe location details, not separate publications. The
  citation is free text so it can follow each magazine's own conventions.
- Existing test Magazine records are deduplicated by trimmed,
  case-insensitive title within each account. Keep one publication record,
  reassign recipes to it, preserve their free-text citations and online URLs,
  and delete duplicate publication rows; no owner review is needed for this
  test-data migration.
- Site publications remain available as standalone primary sources for recipes
  from websites that have no print counterpart. They are not secondary
  listings for Magazine recipes.
- A Magazine recipe may have an optional online recipe URL stored directly on
  the recipe. It remains independent of supplemental References and may
  coexist with the free-text Magazine citation.
- The Publication editor always shows the optional online recipe URL for a
  Magazine recipe, including when empty. Keep it on one compact line directly
  below Publication; on mobile, constrain the single-line value to the field
  rather than expanding the form. Recipe detail puts the Magazine citation and
  online link on separate lines at desktop and mobile widths. Desktop shows
  the actual URL as clickable text; mobile shows the compact label `View online`.
- The Magazine editor has no secondary Site selector or Site-listing section.
  The primary Publication picker remains keyboard-operable and viewport-aware.
- Pairs With entries are directional. A recipe can link to another active
  recipe or keep an entry as ordinary text. `#` autocomplete searches active
  recipes owned by the signed-in account; selecting a result creates the link.
  Incoming entries are visible on the target recipe but are edited at their
  source recipe.
- A selected pairing displays a normalized `#slug` token in edit mode (for
  example, `#roast-chicken`). The recipe name remains the saved display text and
  detail-mode link label; editing the token clears the link until another
  recipe is selected.
- On desktop, the Pairs With input has a 3-inch minimum and aligns its right
  edge with the Rest time input. The Recipe Name field has a 3-inch minimum and
  grows with its text, capped by the available form and viewport width.
- A trashed recipe target remains as display text without an active link.
  Restoring it reactivates the link. Permanently purging a linked target
  detaches it while retaining its last display text. Purging the source recipe
  removes its own relationships and references.
- References support another recipe, an external HTTP(S) URL, and a printed
  citation. Recipe targets are selected from the owner's active recipes. A
  trashed or purged recipe reference follows the same
  text-while-unavailable behavior as a Pairs With target. Existing Publication
  references remain static text and are not selectable.
- The type picker labels printed citations `Print`. One shared header labels
  the reference columns `Type` and `Reference`. Scheme-less URL values such as
  `google.com` normalize to HTTPS; other schemes besides HTTP(S) are rejected.
- External URL references display the normalized URL as link text. Print
  citations are plain text. Detail mode renders Pairs With and References as
  unordered lists; public pages render links as static text, consistent with
  the public recipe contract.
- In recipe detail and edit, Pairs With follows the other recipe content,
  Notes follows Pairs With, and References follows Notes.
- On mobile, recipe metadata controls share a 36px height, Magazine Url fields
  appear below Citation, and remove controls align with their fields. Add
  controls are content-sized and 36px tall; recipe-reference pickers use their
  intrinsic option width with 1mm of trailing space, while text fields fill
  their available column. The Reference Type column is content-sized rather
  than reserving an oversized track. The type menu stays within the viewport.
- On desktop, Reference text fields are at least 3 inches wide and no wider
  than half their row. The Type column fits its picker.

## Proposed Data Contract

- Keep owner-scoped recipe pairings and references with stable IDs and explicit
  position values for ordered lists. Enforce same-account relationships with
  composite foreign keys, constraints, and row-level security.
- Store a Magazine recipe's issue/location and optional online recipe URL on
  the recipe row. The recipe save validates and commits them atomically with
  the existing version-checked operation.
- A recipe save increments its version once and writes one history event whose
  snapshot includes the resulting relationship and reference data. Failed,
  unauthorized, or stale saves leave every part unchanged.
- Active detail and picker queries exclude trashed recipes.
  Existing links remain available as text while a target is trashed; restoring
  the target makes the relationship navigable again.
- Recipe purge removes source-owned pairings and references. Purging a linked
  recipe clears its foreign key but preserves the last display text on
  surviving source rows. Existing Publication-reference rows remain static
  and preserve their citation text.

## Scope

### Included

- A Magazine title as the primary publication, per-recipe issue/location, and
  an optional online recipe URL on the recipe.
- Ordered Pairs With entries with ordinary text and optional recipe links;
  outgoing and incoming display; active-recipe `#` autocomplete.
- Ordered References entries for linked recipes, external URLs, and
  printed citations.
- Owner-scoped persistence, same-owner validation, recipe versioning, atomic
  saves, history snapshots, Trash/restore behavior, and purge cleanup.
- Browser, API, owner-isolation, responsive, accessibility, and history tests.

### Excluded

- Recipe or publication images and cover uploads; these remain in Slice 12.
- Public navigation through relationship links, history browsing, link sharing,
  tags, and full-text search.
- Reordering existing ingredient or instruction lists.

## Acceptance Criteria

- Magazine issues are not separate publications. Recipes from the same title
  share one Magazine publication and retain their own issue/volume/page
  location.
- A Magazine recipe has an optional online recipe URL directly on the recipe.
  The field is visible when empty, is labeled `Url`, and does not create a
  Site publication association. On mobile it appears below Citation.
- On mobile, a long URL remains within the single-line editor field, while
  recipe detail places the online link on a line below the Magazine citation.
- The data migration consolidates existing Magazine issue records into titles,
  moves each issue value to its recipes' location, and transfers secondary
  Site-listing URLs to those recipes. It must preserve recipe assignment,
  ownership, resolved history snapshots, and non-Magazine Site behavior.
- A recipe can save, view, and edit plain-text pairings and linked pairings.
  Selecting an active same-owner recipe after `#` creates a directional link;
  the source shows outgoing links and the target shows incoming links.
- Recipe search suggestions exclude trashed and foreign-owner recipes. A
  trashed linked target is shown as text; restoring it restores the active
  link. Purging it preserves text and removes the target relationship. Purging
  the source removes its outgoing rows.
- A recipe can save, view, and edit Recipe, External URL, and Print references.
  In-app links point only to active same-owner recipes, external URLs accept
  normalized HTTP(S) URLs including scheme-less hosts, and printed citations
  are not clickable. Publication is not an available type.
- Trashed or purged in-app recipe targets are rendered as text, regain their
  link if restored, and retain display text after permanent purge. Existing
  Publication references remain static text through saves and purge.
- Relationship writes are atomic with the recipe save, reject stale versions
  and foreign IDs, and appear in recipe history. A failed save changes neither
  the recipe nor its relationships.
- Public pages do not expose private application navigation through Pairs With
  or References. Pairings and references render as static text. Keyboard,
  accessible naming, axe, and horizontal-overflow checks pass on Chromium and
  Fold 6.

## Verification

The revised Magazine workflow and recipe-reference lifecycle passed focused
Chromium and Fold 6 tests, including owner isolation, edit/history, Trash, and
purge behavior. The accessibility suite passed on both browser projects:
31 passed and one existing conditional skip.

- `npm run typecheck` passed.
- `npm run lint` passed with ten existing CSS specificity warnings.
- `npx supabase db lint --local` reported no schema errors.
- `git diff --check` passed.
- Focused source-link E2E: 1 Chromium test and 1 Fold 6 test passed.
- `npm run test:a11y -- --project=chromium --project='Fold 6'`: 31 passed,
  one existing conditional skip.
- Follow-up UI geometry and pairing-token checks passed in Chromium and Fold 6;
  `npm run typecheck`, `npm run lint`, and `git diff --check` passed.

## Completion Criteria

Slice 11 is complete. Owner isolation, atomic versioned history, responsive
behavior, and accessibility coverage are verified on Chromium and Fold 6.
